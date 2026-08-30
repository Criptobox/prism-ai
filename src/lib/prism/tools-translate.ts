/** Prism AI — Traducción del catálogo de herramientas a los 3 protocolos.
 *
 * OpenAI pide `tools: [{type: "function", function: {name, description, parameters}}]`.
 * Anthropic pide `tools: [{name, description, input_schema}]`.
 * Gemini pide `tools: [{functionDeclarations: [{name, description, parameters}]}]` y no
 * admite `parameters` como objeto vacío (exige al menos `type: "object"`).
 *
 * Las tres formas son casi lo mismo con renombramientos, pero el
 * detalle mal hecho rompe la petición. Aquí se concentran las
 * diferencias para que `streamChat` no tenga que saber de ellas.
 */
import type { ToolDef, ToolParamSchema, ToolProtocol } from "./tools-catalog";

/** Forma OpenAI del catálogo. */
export interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: ToolParamSchema;
  };
}

/** Forma Anthropic del catálogo. */
export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: ToolParamSchema;
}

/** Forma Gemini de una declaración de función. */
export interface GeminiFunctionDecl {
  name: string;
  description: string;
  parameters: ToolParamSchema;
}

/** Forma Gemini del contenedor de tools (un array de `functionDeclarations`
 * envuelto en un objeto). */
export interface GeminiTool {
  functionDeclarations: GeminiFunctionDecl[];
}

/** Traduce el catálogo a la forma que pide el protocolo.
 *
 * Devuelve `null` si el catálogo está vacío — así `streamChat` puede
 * omitir el campo `tools` del body (algunos proveedores rechazan un
 * array vacío). */
export function translateTools(
  protocol: ToolProtocol,
  tools: readonly ToolDef[]
): OpenAITool[] | AnthropicTool[] | GeminiTool[] | null {
  if (!tools.length) return null;
  switch (protocol) {
    case "openai":
      return tools.map((t) => ({
        type: "function" as const,
        function: {
          name: t.name,
          description: t.description,
          // OpenAI acepta `parameters: {type: "object", properties: {}}`
          // sin más; no necesita normalización.
          parameters: t.parameters,
        },
      }));
    case "anthropic":
      return tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    case "gemini":
      return [
        {
          functionDeclarations: tools.map((t) => ({
            name: t.name,
            description: t.description,
            // Gemini exige que `parameters` sea un objeto con `type: "object"`
            // al menos. Si el tool no tiene parámetros, lo normalizamos aquí.
            parameters: t.parameters,
          })),
        },
      ];
  }
}

/* ------------------------------------------------------------------ */
/* parseo de tool_calls en la respuesta del modelo                     */
/* ------------------------------------------------------------------ */

/** Detecta si el último chunk SSE trae tool_calls (OpenAI),
 * tool_use (Anthropic) o functionCall (Gemini) y los devuelve en la
 * forma común `ToolCall`. Si no hay, devuelve `[]`.
 *
 * Las funciones NO son puras porque leen JSON dinámico del proveedor,
 * pero son defensivas: si algo no se entiende, se devuelve `[]` en
 * lugar de lanzar (el streaming seguiría con el texto que llegara). */
export function parseToolCallsFromChunk(
  protocol: ToolProtocol,
  chunk: unknown
): ToolCallLite[] {
  if (!chunk || typeof chunk !== "object") return [];
  const c = chunk as Record<string, unknown>;
  try {
    if (protocol === "openai") {
      const delta = (c.choices?.[0] as { delta?: Record<string, unknown> })?.delta;
      const calls = delta?.tool_calls;
      if (!Array.isArray(calls)) return [];
      return calls.map((tc: Record<string, unknown>, i: number) => {
        const fn = (tc.function ?? {}) as Record<string, unknown>;
        return {
          id: String(tc.id ?? `call_${i}`),
          name: String(fn.name ?? tc.name ?? ""),
          // `arguments` llega como string JSON en streaming; puede ser parcial.
          argsText: String(fn.arguments ?? tc.arguments ?? ""),
        };
      });
    }
    if (protocol === "anthropic") {
      // Anthropic emite `content_block_start` con `tool_use` y luego
      // `content_block_delta` con `input_json_delta`. Aquí solo nos
      // interesa el bloque cuando está COMPLETO; el acumulador vive en
      // `streamChat`. Esta función es para el caso no-streaming.
      const blocks = c.content as { type: string; id?: string; name?: string; input?: unknown }[] | undefined;
      if (!Array.isArray(blocks)) return [];
      return blocks
        .filter((b) => b.type === "tool_use")
        .map((b, i) => ({
          id: String(b.id ?? `toolu_${i}`),
          name: String(b.name ?? ""),
          argsText: JSON.stringify(b.input ?? {}),
        }));
    }
    if (protocol === "gemini") {
      const parts = (c.candidates?.[0]?.content?.parts) as { functionCall?: { name?: string; args?: unknown } }[] | undefined;
      if (!Array.isArray(parts)) return [];
      return parts
        .filter((p) => p && p.functionCall)
        .map((p, i) => ({
          id: `gemini_${i}`,
          name: String(p.functionCall?.name ?? ""),
          argsText: JSON.stringify(p.functionCall?.args ?? {}),
        }));
    }
  } catch {
    return [];
  }
  return [];
}

/** Forma ligera de `ToolCall` mientras se acumula en streaming. */
export interface ToolCallLite {
  id: string;
  name: string;
  /** Argumentos como texto JSON (puede ser parcial mientras stream). */
  argsText: string;
}

/** Construye el `ToolResult` de vuelta al modelo en el formato del
 * protocolo, para reinyectarlo en el siguiente turno. */
export function buildToolResultMessage(
  protocol: ToolProtocol,
  result: { callId: string; name: string; content: string; ok: boolean }
): unknown {
  if (protocol === "openai") {
    // OpenAI: mensaje con role "tool", tool_call_id y content.
    return {
      role: "tool",
      tool_call_id: result.callId,
      content: result.content,
    };
  }
  if (protocol === "anthropic") {
    // Anthropic: bloque `tool_result` dentro de un mensaje `user`.
    return {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: result.callId,
          content: result.content,
          is_error: !result.ok,
        },
      ],
    };
  }
  // Gemini: `functionResponse` en una parte de un mensaje `user`.
  return {
    role: "user",
    parts: [
      {
        functionResponse: {
          name: result.name,
          response: { name: result.name, content: result.content },
        },
      },
    ],
  };
}
