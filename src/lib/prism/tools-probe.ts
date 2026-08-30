/** Prism AI — Detección de capacidad de tools por modelo.
 *
 * `probeModel` solo dice si el modelo responde. Aquí se va un paso más:
 * se manda una petición MÍNIMA con un `tools` inventado y se mira si el
 * modelo lo acepta o lo rechaza. Muchos modelos gratis no soportan
 * `tools` (o lo soportan mal) y encenderlo a secas rompe el agente justo
 * en los modelos para los que existe Prism — es el fallo que el PLAN-V4
 * identifica y arregla aquí.
 *
 * La prueba es cara (un round-trip), así que el resultado se cachea en
 * memoria (no en localStorage: si cambias de clave o de proveedor, se
 * repite la prueba la próxima vez; es lo correcto porque la capacidad
 * puede depender de la clave).
 *
 * Cómo se decide el veredicto:
 *   - 200 + cuerpo con `tool_calls` / `tool_use` / `functionCall` → OK
 *   - 200 sin tools en la respuesta → OK (el modelo aceptó el campo y
 *     respondió texto normal; se puede usar tools, aunque este modelo
 *     no las aprovechó para esta pregunta trivial)
 *   - 400 con «tools» / «function» / «functionDeclarations» en el error
 *     → NO soporta tools
 *   - 400 con otro mensaje → desconocido (lo tratamos como NO para no
 *     romper el agente; el modelo ya falló en algo)
 *   - 401/403 → sin-clave / sin-permiso (igual que `classifyProbe`)
 *   - 429 → limitado (acepta tools, solo que se acabó la cuota)
 *   - 5xx / sin-red → caído / sin-red (no se sabe; no se cachea)
 */
import { getProvider } from "./providers";
import type { ProviderConfig, ProviderId } from "./types";
import { buildRequest, endpoint } from "./chat-client";
import { classifyProbe, type ProbeVerdict } from "./model-probe";
import { translateTools } from "./tools-translate";
import { TOOL_CATALOG } from "./tools-catalog";
import { recordQuotaHeaders } from "./quota";

export type ToolsSupport =
  | "ok" // soporta tools
  | "no" // no las soporta
  | "sin-clave"
  | "sin-permiso"
  | "limitado" // 429: soporta tools pero se acabó la cuota
  | "caido"
  | "sin-red"
  | "desconocido";

export interface ToolsProbeResult {
  support: ToolsSupport;
  /** veredicto clásico (compatible con `classifyProbe`) */
  verdict: ProbeVerdict;
  status: number;
  detail?: string;
  ms: number;
  at: number;
}

/** Mensajes de error típicos que indican que el modelo NO soporta tools. */
const NO_TOOLS = [
  "tool",
  "function",
  "functiondeclarations",
  "function_calling",
  "tool_calls",
  "tools parameter",
  "not support",
  "unsupported",
  "does not support",
  "tools are not",
  "tools is not",
  "no tool",
];

/** Cachea el resultado por `(providerId, modelId)` en memoria. Si la
 * clave cambia, el resultado se invalida porque `probeTools` recibe la
 * `config` completa y se incluye `apiKey` en la clave de cache. */
const cache = new Map<string, ToolsProbeResult>();

function cacheKey(providerId: ProviderId, config: ProviderConfig, modelId: string): string {
  // Incluye apiKey (hasheada levemente para no guardarla literal): si
  // cambias de plan, la capacidad de tools puede cambiar.
  const keyHash = config.apiKey.length + ":" + config.apiKey.slice(0, 4);
  return `${providerId}::${config.baseUrl ?? ""}::${modelId}::${keyHash}`;
}

/** ¿Vale la pena cachear este resultado? Los transitorios (caído,
 * sin-red, limitado) no: conviene volver a probar. */
function cacheable(s: ToolsSupport): boolean {
  return s === "ok" || s === "no" || s === "sin-clave" || s === "sin-permiso" || s === "desconocido";
}

/** Lee el cache si la entrada sigue siendo fresca. */
export function getCachedToolsProbe(
  providerId: ProviderId,
  config: ProviderConfig,
  modelId: string
): ToolsProbeResult | null {
  return cache.get(cacheKey(providerId, config, modelId)) ?? null;
}

/** Invalida la entrada (p. ej. si el usuario cambia de clave y quiere
 * volver a probar). Fire-and-forget. */
export function invalidateToolsProbe(
  providerId: ProviderId,
  config: ProviderConfig,
  modelId: string
): void {
  cache.delete(cacheKey(providerId, config, modelId));
}

/** Para tests: limpia toda la cache. No se usa en producción. */
export function _clearToolsCacheForTests(): void {
  cache.clear();
}

/** Construye el body mínimo CON tools, por protocolo. Pide 1 token
 * de salida para no gastar más de la prueba normal. */
function cuerpoConTools(protocol: string, modelId: string): Record<string, unknown> | null {
  const tools = translateTools(protocol as "openai" | "anthropic" | "gemini", TOOL_CATALOG);
  if (!tools) return null;
  if (protocol === "anthropic") {
    return {
      model: modelId,
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
      tools: tools as unknown,
    };
  }
  if (protocol === "gemini") {
    return {
      contents: [{ role: "user", parts: [{ text: "hi" }] }],
      generationConfig: { maxOutputTokens: 1 },
      tools: tools as unknown,
    };
  }
  return {
    model: modelId,
    max_tokens: 1,
    messages: [{ role: "user", content: "hi" }],
    tools: tools as unknown,
  };
}

/** Construye el body MÍNIMO SIN tools para comparar. Si el modelo
 * responde igual con y sin tools, el soporte es claro. Si solo responde
 * sin tools, el soporte es NO. */
function cuerpoSinTools(protocol: string, modelId: string): Record<string, unknown> {
  if (protocol === "anthropic") {
    return { model: modelId, max_tokens: 1, messages: [{ role: "user", content: "hi" }] };
  }
  if (protocol === "gemini") {
    return {
      contents: [{ role: "user", parts: [{ text: "hi" }] }],
      generationConfig: { maxOutputTokens: 1 },
    };
  }
  return { model: modelId, max_tokens: 1, messages: [{ role: "user", content: "hi" }] };
}

/** Manda la prueba de tools y decide el veredicto. No lanza: si algo
 * falla a nivel de red, devuelve `sin-red`. */
export async function probeTools(
  providerId: ProviderId,
  config: ProviderConfig,
  modelId: string,
  signal?: AbortSignal
): Promise<ToolsProbeResult> {
  // Si ya estaba en cache, se devuelve sin tocar la red.
  const cached = getCachedToolsProbe(providerId, config, modelId);
  if (cached) return cached;

  const def = getProvider(providerId);
  const base = (config.baseUrl || def.baseUrl).trim();
  const empezó = Date.now();

  // Petición con tools.
  let path: string;
  let extra: Record<string, string> = {};
  if (def.protocol === "anthropic") {
    path = "/v1/messages";
    extra = {
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    };
  } else if (def.protocol === "gemini") {
    path = `/models/${encodeURIComponent(modelId)}:generateContent`;
    extra = { "x-goog-api-key": config.apiKey };
  } else {
    path = "/chat/completions";
    extra = { Authorization: `Bearer ${config.apiKey}` };
  }
  const req = buildRequest(endpoint(base, path), { config, providerId }, extra);
  const bodyObj = cuerpoConTools(def.protocol, modelId);
  if (!bodyObj) {
    // Catálogo vacío (no debería pasar): lo tratamos como NO.
    const result: ToolsProbeResult = {
      support: "no",
      verdict: "caido",
      status: 0,
      detail: "Catálogo de tools vacío",
      ms: Date.now() - empezó,
      at: Date.now(),
    };
    return result;
  }
  const body = JSON.stringify(bodyObj);

  let status: number;
  let text: string;
  try {
    const res = await fetch(req.target, { method: "POST", headers: req.headers, body, signal });
    recordQuotaHeaders(providerId, res.headers);
    status = res.status;
    if (!res.ok) {
      try {
        text = (await res.text()).slice(0, 400);
      } catch {
        text = "";
      }
    } else {
      text = "";
    }
  } catch (err) {
    const result: ToolsProbeResult = {
      support: "sin-red",
      verdict: classifyProbe(0),
      status: 0,
      detail: err instanceof Error ? err.message : undefined,
      ms: Date.now() - empezó,
      at: Date.now(),
    };
    return result;
  }

  const support = classifyToolsSupport(status, text);
  const result: ToolsProbeResult = {
    support,
    verdict: classifyProbe(status, text),
    status,
    detail: text || undefined,
    ms: Date.now() - empezó,
    at: Date.now(),
  };
  if (cacheable(support)) {
    cache.set(cacheKey(providerId, config, modelId), result);
  }
  return result;
}

/** Clasifica la respuesta HTTP/cuerpo en `ToolsSupport`. */
export function classifyToolsSupport(status: number, body = ""): ToolsSupport {
  const t = body.toLowerCase();
  if (status === 0) return "sin-red";
  if (status >= 200 && status < 300) return "ok";
  if (status === 429) return "limitado";
  if (status === 401) return "sin-clave";
  if (status === 403) {
    // 403 puede ser sin-permiso o que el modelo no existe con esta clave.
    return NO_TOOLS.some((s) => t.includes(s)) ? "no" : "sin-permiso";
  }
  if (status === 400 || status === 422) {
    // 400 + mención de tools/function → NO soporta.
    if (NO_TOOLS.some((s) => t.includes(s))) return "no";
    // 400 sin mención de tools: no sabemos. Lo tratamos como desconocido
    // (NO rompe el agente: se cae al camino XML).
    return "desconocido";
  }
  if (status === 404) return "desconocido"; // 404 en el modelo, no en tools
  return "caido";
}

/** ¿Se pueden mandar tools a este modelo? `limitado` cuenta como sí:
 * el modelo las acepta, solo que ahora mismo se acabó la cuota. */
export function supportsTools(s: ToolsSupport): boolean {
  return s === "ok" || s === "limitado";
}

/** Mensaje corto para la UI. */
export function mensajeTools(s: ToolsSupport): string {
  switch (s) {
    case "ok":
      return "Soporta tools";
    case "no":
      return "No soporta tools (usa XML)";
    case "sin-clave":
      return "Clave no válida";
    case "sin-permiso":
      return "Tu clave no tiene acceso";
    case "limitado":
      return "Soporta tools (cuota agotada)";
    case "caido":
      return "El proveedor devolvió un error";
    case "sin-red":
      return "No hubo respuesta";
    case "desconocido":
      return "Capacidad de tools desconocida";
  }
}
