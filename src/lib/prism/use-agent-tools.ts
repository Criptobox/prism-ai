"use client";
/** Prism AI — Hook del bucle de tools del agente (PLAN-V4 punto 5).
 *
 * El bloque de `runGeneration` que maneja `probeTools` + el bucle de
 * `tool_calls` vivía dentro de `chat-app.tsx` (unas 130 líneas). Aquí
 * se extrae a un hook para:
 *   - Reducir `chat-app.tsx` (que ya tiene 2200+ líneas).
 *   - Aislar la lógica de tools para poder testearla sin React.
 *   - Dejar claro que el bucle es una pieza intercambiable: cuando se
 *     añadan más herramientas, solo se toca este hook.
 *
 * El hook NO es reentrante: se llama una vez por `streamChat`. Devuelve
 * una función `runWithTools(...)` que envuelve el `streamChat` y maneja
 * el bucle internamente.
 */
import { useCallback, useRef } from "react";
import { streamChat, type StreamOptions, type StreamMessage } from "@/lib/prism/chat-client";
import { TOOL_CATALOG, type ToolCall, type ToolResult } from "@/lib/prism/tools-catalog";
import { runTools, type ToolContext } from "@/lib/prism/tool-runner";
import { probeTools, supportsTools, type ToolsSupport } from "@/lib/prism/tools-probe";
import { buildToolResultMessage } from "@/lib/prism/tools-translate";
import { runProjectInMemory } from "@/lib/prism/sandbox-runner";
import type { ProviderId } from "@/lib/prism/types";
import { PROVIDER_MAP } from "@/lib/prism/providers";
import type { SandboxSeed } from "@/lib/prism/sandbox";

export interface AgentToolsState {
  /** Último resultado del probe de tools (para UI: chip «Soporta tools»). */
  lastSupport: ToolsSupport | null;
}

/** Construye el contexto de herramientas a partir del estado del Sandbox.
 * Si no hay proyecto, los archivos están vacíos y `run_project` devuelve
 * un mensaje claro ("no tiene archivos"). */
function buildToolContext(sandboxInitial: SandboxSeed | null): ToolContext {
  const files = sandboxInitial?.files
    ? Object.fromEntries(sandboxInitial.files.map((f) => [f.path, f.content]))
    : {};
  return {
    projectFiles: files,
    runProject: async (opts) => runProjectInMemory(files, opts ?? {}),
    getQuota: () => null,
  };
}

/** Ejecuta una llamada al modelo con soporte de tools. Si el modelo
 * soporta tools Y el modo agente está activo, hace el bucle:
 * streamChat → si hay tool_calls → ejecuta localmente → reinyecta →
 * siguiente vuelta. Si no soporta tools, una sola llamada.
 *
 * @param baseOpts Opciones base de `streamChat` (providerId, modelId,
 *   messages, settings, signal, callbacks). El hook añade `tools` si
 *   corresponde y maneja el bucle internamente.
 * @param agentOn Si el modo agente está activo (sin él, no se pasa el
 *   catálogo).
 * @param maxLoops Máximo de iteraciones (mismo techo que el bucle XML).
 * @param sandboxInitial Proyecto activo del Sandbox (para
 *   `run_project`).
 * @param config Config del proveedor (clave fresca).
 * @returns El texto final del modelo.
 */
export function useAgentTools() {
  const stateRef = useRef<AgentToolsState>({ lastSupport: null });

  const runWithTools = useCallback(
    async (
      baseOpts: Omit<StreamOptions, "tools">,
      agentOn: boolean,
      maxLoops: number,
      sandboxInitial: SandboxSeed | null,
      config: { apiKey: string; baseUrl?: string }
    ): Promise<string> => {
      const providerId = baseOpts.providerId as ProviderId;
      const candidate = { providerId, modelId: baseOpts.modelId };

      // ——— ¿El modelo soporta tools? ———
      // La prueba es cara (un round-trip) y se cachea por modelo+clave.
      // Si soporta tools Y el modo agente está activo, se le pasa el
      // catálogo. Si no soporta tools, se cae al camino XML.
      let toolSupport: ToolsSupport = "desconocido";
      if (agentOn && TOOL_CATALOG.length) {
        try {
          const probe = await probeTools(providerId, config as never, baseOpts.modelId, baseOpts.signal);
          toolSupport = probe.support;
        } catch {
          toolSupport = "desconocido";
        }
      }
      stateRef.current.lastSupport = toolSupport;
      const useToolPath = supportsTools(toolSupport) && agentOn;

      // Historial que se va ampliando con cada vuelta.
      let convo: StreamMessage[] = [...baseOpts.messages];
      let content = "";
      const loops = Math.max(1, Math.min(8, maxLoops));

      for (let loop = 0; loop < loops; loop++) {
        if (baseOpts.signal.aborted) break;

        // En la segunda vuelta+, borrar el content y reasoning previos
        // para que el stream pinte el texto nuevo del modelo. El
        // llamador recibe estos callbacks y actualiza su estado.
        if (loop > 0) {
          content = "";
          baseOpts.onDelta("");
          baseOpts.onReasoning?.("");
        }

        const pendingToolCalls: ToolCall[] = [];
        await streamChat({
          ...baseOpts,
          messages: convo,
          ...(useToolPath ? { tools: TOOL_CATALOG } : {}),
          onToolCalls: (calls) => {
            pendingToolCalls.push(...calls);
          },
        });

        // Si no pidió tools, el bucle termina aquí.
        if (!pendingToolCalls.length || !useToolPath) {
          return content;
        }

        // Techo de iteraciones: pedir al modelo que entregue la respuesta final.
        if (loop + 1 >= loops) {
          convo = [
            ...convo,
            {
              role: "assistant" as const,
              content,
              tool_calls: pendingToolCalls.map((tc) => ({
                id: tc.id,
                type: "function",
                function: { name: tc.name, arguments: JSON.stringify(tc.args) },
              })),
            } as StreamMessage,
            {
              role: "user" as const,
              content:
                "Has llegado al límite de iteraciones con tools. Entrega ahora la respuesta final al usuario sin más llamadas a herramientas.",
            } as StreamMessage,
          ];
          continue;
        }

        // Ejecutar tools localmente.
        const tctx = buildToolContext(sandboxInitial);
        const results: ToolResult[] = await runTools(pendingToolCalls, tctx);

        // Construir los mensajes para la siguiente vuelta.
        const def = PROVIDER_MAP[providerId];
        convo = [
          ...convo,
          {
            role: "assistant" as const,
            content,
            tool_calls: pendingToolCalls.map((tc) => ({
              id: tc.id,
              type: "function",
              function: { name: tc.name, arguments: JSON.stringify(tc.args) },
            })),
          } as StreamMessage,
          ...results.map((r) => buildToolResultMessage(def.protocol, r) as StreamMessage),
        ];
      }

      return content;
    },
    []
  );

  return { runWithTools, stateRef };
}
