"use client";
/** Prism AI — Cliente de chat streaming multi-protocolo.
 * Todas las peticiones van por /api/proxy (mismo origen, sin CORS) o directas
 * al proveedor si el usuario lo prefiere. Las claves viajan solo en cabeceras.
 */
import type { AppSettings, Attachment, ChatMessage, ProviderConfig, ProviderId } from "./types";
import { getProvider } from "./providers";
import { usePrism } from "./store";
import { beginRequest } from "./request-log";
import { classifyProbe, esFalloDeImagen, type ProbeResult } from "./model-probe";
import { resolveAttachmentDataUrl } from "./attachment-blob";
import {
  buildToolResultMessage,
  parseToolCallsFromChunk,
  translateTools as translateToolsForProtocol,
  type ToolCallLite,
} from "./tools-translate";
import type { ToolDef, ToolCall, ToolResult } from "./tools-catalog";
import { recordQuotaHeaders, parseOpenRouterKey } from "./quota";
import { motivoDeRespuesta, type MotivoParada } from "./finish-reason";
import { razonamientoDeTrozo } from "./razonamiento";

/** Cabecera de código de acceso de las rutas propias (si el usuario lo configuró).
 * La usan el chat, el radar de modelos y Repo Studio: todas las rutas de este
 * servidor pasan por el mismo guardián. */
export function accessCodeHeaders(): Record<string, string> {
  const code = usePrism.getState().settings.accessCode?.trim();
  return code ? { "x-prism-code": code } : {};
}

export interface StreamCallbacks {
  onDelta: (text: string) => void;
  onReasoning?: (text: string) => void;
  onDone: (full: string) => void;
  /** Por qué paró el modelo, según el proveedor. Se llama antes de `onDone`
   *  y solo si el proveedor lo dijo: sin dato, no se llama. */
  onFinish?: (motivo: MotivoParada) => void;
  /** El stream trajo tool_calls y el llamador debe ejecutarlos y
   * reinyectar los resultados. Se llama UNA vez al final del stream,
   * antes de `onDone`, con la lista acumulada. Si no hubo tool_calls,
   * NO se llama. */
  onToolCalls?: (calls: ToolCall[]) => void;
}

/** Mensaje con posibles imágenes adjuntas. Puede llevar `tool_calls`
 * (OpenAI) o `tool_use_id` (Anthropic) cuando es un mensaje que el
 * modelo pidió ejecutar tools. */
export type StreamMessage = Pick<ChatMessage, "role" | "content"> & {
  attachments?: Attachment[];
  /** OpenAI: id de las llamadas que pidió el asistente, para
   * correlacionar el siguiente `tool` con este mensaje. */
  tool_calls?: unknown;
  /** Anthropic: id de un tool_use, para correlacionar el tool_result. */
  tool_use_id?: string;
  /** OpenAI: id de la llamada que este mensaje `role: "tool"` responde. */
  tool_call_id?: string;
  /** Gemini / Anthropic: nombre del tool (trazabilidad). */
  name?: string;
};

export interface StreamOptions extends StreamCallbacks {
  providerId: ProviderId;
  config: ProviderConfig;
  modelId: string;
  messages: StreamMessage[];
  settings: AppSettings;
  signal: AbortSignal;
  /** Catálogo de herramientas que el modelo puede invocar. Si se pasa,
   * se traducen al formato del protocolo y se inyectan en el body. */
  tools?: readonly ToolDef[];
}

function splitDataUrl(dataUrl: string | undefined): { mediaType: string; data: string } {
  // Los adjuntos llegan pre-resueltos por `resolveAttachmentsForSend`, así
  // que `a.dataUrl` está garantizado. Pero TS no lo sabe (es opcional en
  // el tipo): por si llegara uno sin resolver, caemos a un PNG de 1×1
  // transparente antes que mandar `undefined` y romper la petición.
  const url = dataUrl ?? "data:image/png;base64,";
  const m = url.match(/^data:([^;,]+)(?:;[^,]*)?,([\s\S]*)$/);
  return m
    ? { mediaType: m[1], data: m[2] }
    : { mediaType: "image/jpeg", data: url };
}

/** Contenido multimodal para protocolo OpenAI */
function toOpenAIContent(m: StreamMessage): string | unknown[] {
  if (!m.attachments?.length) return m.content;
  return [
    { type: "text", text: m.content || "Describe la(s) imagen(es) adjunta(s)." },
    ...m.attachments.map((a) => ({ type: "image_url", image_url: { url: a.dataUrl } })),
  ];
}

/** Contenido multimodal para protocolo Anthropic */
function toAnthropicContent(m: StreamMessage): string | unknown[] {
  if (!m.attachments?.length) return m.content;
  const parts: unknown[] = m.attachments.map((a) => {
    const { mediaType, data } = splitDataUrl(a.dataUrl);
    return { type: "image", source: { type: "base64", media_type: mediaType, data } };
  });
  parts.push({ type: "text", text: m.content || "Describe la(s) imagen(es) adjunta(s)." });
  return parts;
}

/** Partes multimodales para protocolo Gemini */
function toGeminiParts(m: StreamMessage): unknown[] {
  const parts: unknown[] = [{ text: m.content || "Describe la(s) imagen(es) adjunta(s)." }];
  for (const a of m.attachments ?? []) {
    const { mediaType, data } = splitDataUrl(a.dataUrl);
    parts.push({ inlineData: { mimeType: mediaType, data } });
  }
  return parts;
}

const PROXY_PATH = "/api/proxy";

/** Pre-resuelve los `dataUrl` de los adjuntos de todos los mensajes antes
 * de llamar a las funciones de protocolo (que leen `a.dataUrl` síncrono).
 *
 * Desde la v3.14, los adjuntos persistidos solo tienen `blobId` — el
 * `dataUrl` vive en IndexedDB y se carga aquí a demanda. Los que no se
 * puedan recuperar (entrada huérfana o IDB caído) se descartan: mandarlos
 * con `dataUrl: undefined` rompería la petición al proveedor.
 *
 * Si un mensaje pierde todos sus adjuntos, se conserva el texto: el
 * modelo puede responder a partir del contexto, aunque no verá la imagen. */
async function resolveAttachmentsForSend(messages: StreamMessage[]): Promise<StreamMessage[]> {
  if (!messages.length) return messages;
  const hayAdjuntos = messages.some((m) => m.attachments?.length);
  if (!hayAdjuntos) return messages;
  return Promise.all(
    messages.map(async (m) => {
      if (!m.attachments?.length) return m;
      const atts: Attachment[] = [];
      for (const a of m.attachments) {
        const dataUrl = await resolveAttachmentDataUrl(a);
        if (dataUrl) atts.push({ ...a, dataUrl });
      }
      return { ...m, attachments: atts };
    })
  );
}

/** fetch con registro (últimas peticiones + copiar como cURL).
 *
 * `target` es a DÓNDE va el navegador —el proxy de mismo origen, o el proveedor
 * si el usuario pidió conexión directa—; `meta.url` es siempre la URL del
 * proveedor, que es la que tiene sentido en el registro y en «Copiar como cURL».
 * Van separados a propósito: confundirlos manda la petición del navegador al
 * proveedor con las cabeceras del proxy, y el navegador la corta en el
 * preflight («Failed to fetch»).
 */
async function loggedFetch(
  target: string,
  meta: {
    providerId: string;
    providerName: string;
    modelId: string;
    url: string;
    headers: Record<string, string>;
    body: string;
  },
  init: RequestInit
): Promise<Response> {
  const startedAt = Date.now();
  const finish = beginRequest({ ...meta, method: "POST" });
  try {
    const res = await fetch(target, init);
    finish({ ok: res.ok, status: res.status, ms: Date.now() - startedAt });
    return res;
  } catch (err) {
    // Una cancelación del usuario no es un fallo del proveedor, pero la entrada
    // tiene que cerrarse igual para que no se quede «en curso» para siempre.
    const abortada = err instanceof DOMException && err.name === "AbortError";
    finish({ ok: false, status: abortada ? ABORTED : 0, ms: Date.now() - startedAt });
    if (abortada) throw err;
    // «Failed to fetch» a secas no dice nada: el navegador oculta el motivo real
    // por seguridad. Al menos se explica QUÉ conexión falló y qué mirar.
    throw Object.assign(new Error(fallaDeRed(target, meta.providerName)), { cause: err });
  }
}

/** Estado con el que se registra una petición que canceló el usuario. */
export const ABORTED = -1;

/** Mensaje para un fetch que ni siquiera llegó a tener respuesta. */
function fallaDeRed(target: string, providerName: string): string {
  return target.startsWith("/")
    ? `No se pudo contactar con el servidor de Prism (${target.split("?")[0]}). ` +
        "Revisa tu conexión; si usas VPN, bloqueador de anuncios o una red con " +
        "filtro, prueba a desactivarlos para este sitio."
    : `No se pudo conectar directamente con ${providerName}. En modo directo el ` +
        "navegador exige que el proveedor autorice la petición (CORS) y la " +
        "mayoría no lo hace: desactiva «Conexión directa» en Ajustes → Proveedores " +
        "para volver a pasar por el proxy.";
}

export function endpoint(baseUrl: string, path: string): string {
  return baseUrl.replace(/\/+$/, "") + path;
}

/** Cabeceras que son cosa del proxy y no del proveedor: no deben aparecer en el
 * registro ni en el cURL, porque allí la URL ya es la del proveedor. */
const PROXY_HEADERS = ["x-target-url", "x-prism-code"];

export interface BuiltRequest {
  /** a dónde hace fetch el navegador: el proxy, o el proveedor si es directa */
  target: string;
  /** la URL del proveedor, siempre; para el registro y «Copiar como cURL» */
  upstream: string;
  /** cabeceras que se envían de verdad */
  headers: Record<string, string>;
  /** las mismas sin las internas del proxy, para el registro */
  logHeaders: Record<string, string>;
  direct: boolean;
}

/** Decide a dónde va la petición (proxy o directa) y con qué cabeceras. */
export function buildRequest(
  url: string,
  opts: Pick<StreamOptions, "config" | "providerId">,
  extraHeaders: Record<string, string> = {}
): BuiltRequest {
  const { config, providerId } = opts;
  const direct = config.useProxy === false;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };
  if (!direct) {
    headers["x-target-url"] = url;
    Object.assign(headers, accessCodeHeaders());
  }
  const logHeaders = Object.fromEntries(
    Object.entries(headers).filter(([k]) => !PROXY_HEADERS.includes(k.toLowerCase()))
  );
  return {
    target: direct ? url : `${PROXY_PATH}?t=${encodeURIComponent(providerId)}`,
    upstream: url,
    headers,
    logHeaders,
    direct,
  };
}

async function readSSE(
  res: Response,
  onData: (json: string) => void
): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("La respuesta no admite streaming");
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() ?? "";
    for (const raw of parts) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      onData(payload);
    }
  }
}

async function assertOk(res: Response, providerName: string): Promise<void> {
  if (res.ok) return;
  let detail = "";
  try {
    const text = await res.text();
    try {
      const j = JSON.parse(text);
      detail = j?.error?.message ?? j?.error?.status ?? j?.message ?? text;
    } catch {
      detail = text;
    }
  } catch {
    /* ignore */
  }
  const hint = esFalloDeImagen(detail)
    ? " — ese modelo no admite imágenes: manda solo texto o elige uno con visión"
    : res.status === 401 || res.status === 403
      ? " — revisa tu API key en Ajustes"
      : res.status === 429
        ? " — has superado el límite de peticiones o tu saldo"
        : "";
  const short = detail.length > 300 ? detail.slice(0, 300) + "…" : detail;
  // Retry-After: se propaga para que el sistema de salud respete el enfriamiento sugerido
  const ra = Number(res.headers.get("retry-after"));
  const retryAfterMs = Number.isFinite(ra) && ra > 0 ? ra * 1000 : undefined;
  throw Object.assign(
    new Error(`${providerName} ${res.status}: ${short || res.statusText}${hint}`),
    { status: res.status, retryAfterMs }
  );
}

/** Lanza una generación en streaming. Devuelve el texto completo. */
export async function streamChat(opts: StreamOptions): Promise<string> {
  // Pre-resolver adjuntos: desde la v3.14 los binarios viven en IndexedDB y
  // el `dataUrl` puede no estar relleno en el mensaje (vino del store
  // persistido). Antes de tocar las funciones de protocolo (que leen
  // `a.dataUrl` síncrono), resolvemos cada adjunto y rellenamos su `dataUrl`
  // en memoria. Los que no se puedan cargar (entrada huérfana o IDB caído)
  // se descartan: enviar un `image_url: undefined` rompería la petición.
  const messages = await resolveAttachmentsForSend(opts.messages);
  const streamOpts = { ...opts, messages };
  const { providerId, config, modelId, settings, signal, tools } = streamOpts;
  const def = getProvider(providerId);
  const base = (config.baseUrl || def.baseUrl).trim();

  let content = "";
  let reasoning = "";
  // Por qué paró, según el proveedor. En streaming los chunks intermedios lo
  // mandan a null y solo el último lo rellena, así que gana el último con
  // valor. Hasta ahora este campo no se leía en ningún sitio.
  let motivoParada: MotivoParada | null = null;
  const anotarMotivo = (protocolo: "openai" | "anthropic" | "gemini", j: unknown) => {
    const m = motivoDeRespuesta(protocolo, j);
    if (m) motivoParada = m;
  };

  // Acumulador de tool_calls durante el stream (OpenAI los envía en
  // delta, hay que ir pegando `arguments` a medida que llegan).
  const toolCallsAcc: Map<number, ToolCallLite> = new Map();
  // Lista final de ToolCall al cerrar el stream.
  const flushToolCalls = (): ToolCall[] => {
    if (!toolCallsAcc.size) return [];
    const calls: ToolCall[] = [];
    for (const [, lite] of toolCallsAcc) {
      let args: Record<string, unknown> = {};
      try {
        args = lite.argsText ? (JSON.parse(lite.argsText) as Record<string, unknown>) : {};
      } catch {
        // args parciales o malformados: pasamos args vacío y el runner
        // devolverá un error que el modelo verá y podrá corregir.
      }
      calls.push({ id: lite.id, name: lite.name, args });
    }
    return calls;
  };
  /** Acumula tool_calls de un chunk OpenAI/Anthropic/Gemini en el
   *  mapa `toolCallsAcc`. */
  const accumToolCalls = (chunk: unknown): void => {
    const lites = parseToolCallsFromChunk(def.protocol, chunk);
    if (!lites.length) return;
    for (const lite of lites) {
      // Si el id ya existe, concatenamos `argsText` (streaming parcial).
      const existing = toolCallsAcc.get(Number(lite.id.replace(/\D/g, "")) ?? 0);
      if (existing && existing.id === lite.id) {
        existing.argsText += lite.argsText;
        if (lite.name && !existing.name) existing.name = lite.name;
      } else {
        const key = toolCallsAcc.size;
        toolCallsAcc.set(key, { ...lite });
      }
    }
  };

  const push = () => {
    const visible = content || (reasoning ? "" : "");
    streamOpts.onDelta(visible === "" && reasoning ? "" : content);
    if (reasoning) streamOpts.onReasoning?.(reasoning);
  };

  if (def.protocol === "anthropic") {
    const system = settings.systemPrompt?.trim();
    const msgs = messages.filter((m) => m.role !== "system");
    const body: Record<string, unknown> = {
      model: modelId,
      max_tokens: settings.maxTokens ?? 8192,
      temperature: settings.temperature,
      stream: settings.stream,
      messages: msgs.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: toAnthropicContent(m),
      })),
    };
    if (system) body.system = system;
    // Tools: se traducen al formato Anthropic (input_schema) si el modelo
    // las soporta. Si el llamador no pasa `tools`, el campo no se añade
    // y el modelo responde como antes.
    if (tools?.length) {
      const translated = translateToolsForProtocol("anthropic", tools);
      if (translated) body.tools = translated;
    }
    const req = buildRequest(endpoint(base, "/v1/messages"), opts, {
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    });
    const res = await loggedFetch(
      req.target,
      { providerId, providerName: def.name, modelId, url: req.upstream, headers: req.logHeaders, body: JSON.stringify(body) },
      { method: "POST", headers: req.headers, body: JSON.stringify(body), signal }
    );
    recordQuotaHeaders(providerId, res.headers);
    await assertOk(res, def.name);
    if (!settings.stream) {
      const j = await res.json();
      // El cuerpo puede traer `content` con bloques `text`, `thinking` y
      // `tool_use`. El razonamiento de Anthropic (bloques `thinking`) antes
      // se tiraba sin enseñar; ahora se normaliza como en los otros dos.
      anotarMotivo("anthropic", j);
      const r = razonamientoDeTrozo("anthropic", j);
      content = r.contenido;
      if (r.razonamiento) {
        reasoning += r.razonamiento;
        push();
      }
      // Acumula tool_use del cuerpo no-streaming.
      accumToolCalls({
        content: (j.content ?? []) as { type: string; text?: string; id?: string; name?: string; input?: unknown }[],
      });
      streamOpts.onDelta(content);
    } else {
      await readSSE(res, (payload) => {
        try {
          const ev = JSON.parse(payload);
          anotarMotivo("anthropic", ev);
          // thinking_delta (razonamiento) y text_delta (contenido) pasan por
          // el mismo traductor: es la pieza normalizada de razonamiento
          const r = razonamientoDeTrozo("anthropic", ev);
          if (r.razonamiento) {
            reasoning += r.razonamiento;
            if (!content) push();
          }
          if (r.contenido) {
            content += r.contenido;
            push();
          }
          // Anthropic streaming de tools:
          // - content_block_start con tool_use → id y name
          // - content_block_delta con input_json_delta → args parciales
          if (ev.type === "content_block_start" && ev.content_block?.type === "tool_use") {
            accumToolCalls({
              content: [{ type: "tool_use", id: ev.content_block.id, name: ev.content_block.name, input: {} }],
            });
          }
          if (ev.type === "content_block_delta" && ev.delta?.type === "input_json_delta") {
            // Lo acumulamos como args parciales: el último tool_use
            // existente recibirá este fragmento.
            const lastKey = [...toolCallsAcc.keys()].pop();
            if (lastKey != null) {
              const existing = toolCallsAcc.get(lastKey);
              if (existing) existing.argsText += ev.delta.partial_json ?? "";
            }
          }
        } catch { /* fragmento incompleto */ }
      });
    }
  } else if (def.protocol === "gemini") {
    const sys = settings.systemPrompt?.trim();
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: toGeminiParts(m),
      }));
    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: settings.temperature,
        ...(settings.maxTokens ? { maxOutputTokens: settings.maxTokens } : {}),
      },
    };
    if (sys) body.systemInstruction = { parts: [{ text: sys }] };
    if (tools?.length) {
      const translated = translateToolsForProtocol("gemini", tools);
      if (translated) body.tools = translated;
    }
    const method = settings.stream ? "streamGenerateContent?alt=sse" : "generateContent";
    const req = buildRequest(
      endpoint(base, `/models/${encodeURIComponent(modelId)}:${method}`),
      opts,
      { "x-goog-api-key": config.apiKey }
    );
    const res = await loggedFetch(
      req.target,
      { providerId, providerName: def.name, modelId, url: req.upstream, headers: req.logHeaders, body: JSON.stringify(body) },
      { method: "POST", headers: req.headers, body: JSON.stringify(body), signal }
    );
    recordQuotaHeaders(providerId, res.headers);
    await assertOk(res, def.name);
    const handle = (j: {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean; functionCall?: { name?: string; args?: unknown } }[] } }[];
    }) => {
      anotarMotivo("gemini", j);
      // Las partes con thought:true son razonamiento: antes se pegaban al
      // contenido y salían mezcladas dentro de la respuesta
      const r = razonamientoDeTrozo("gemini", j);
      if (r.razonamiento) {
        reasoning += r.razonamiento;
        if (!content) push();
      }
      if (r.contenido) {
        content += r.contenido;
        push();
      }
      // Acumula functionCall de Gemini (no-streaming o chunks SSE).
      const parts = j.candidates?.[0]?.content?.parts ?? [];
      const fcParts = parts.filter((p) => p.functionCall);
      if (fcParts.length) {
        accumToolCalls({
          candidates: [{ content: { parts: fcParts } }],
        });
      }
    };
    if (!settings.stream) {
      handle(await res.json());
    } else {
      await readSSE(res, (payload) => {
        try { handle(JSON.parse(payload)); } catch { /* ignore */ }
      });
    }
  } else {
    // OpenAI-compatible (AiHubMix, OpenAI, DeepSeek, Groq, OpenRouter, Ollama…)
    const msgs: { role: string; content: string | unknown[]; tool_calls?: unknown; tool_call_id?: string; name?: string }[] = [];
    if (settings.systemPrompt?.trim()) msgs.push({ role: "system", content: settings.systemPrompt.trim() });
    for (const m of messages.filter((m) => m.role !== "system")) {
      // Mensajes `tool` (respuesta a una tool_call anterior): se pasan
      // con su `tool_call_id` y `name`; OpenAI exige este formato.
      // `m.role` es `"user" | "assistant" | "system"` en el tipo, así
      // que comprobamos `m.tool_call_id` (que solo llevan los mensajes
      // de resultado de tool) en vez de comparar con "tool".
      if (m.tool_call_id) {
        msgs.push({ role: "tool", content: m.content, tool_call_id: m.tool_call_id, name: m.name });
        continue;
      }
      // Mensajes assistant que pidieron tools: pasan con `tool_calls`.
      if (m.role === "assistant" && m.tool_calls) {
        msgs.push({ role: "assistant", content: m.content || "", tool_calls: m.tool_calls });
        continue;
      }
      msgs.push({ role: m.role, content: toOpenAIContent(m) });
    }
    const body: Record<string, unknown> = {
      model: modelId,
      messages: msgs,
      temperature: settings.temperature,
      stream: settings.stream,
      ...(settings.maxTokens
        ? { max_tokens: settings.maxTokens }
        : providerId === "nvidia"
          ? { max_tokens: 16384 }
          : {}),
    };
    // Kimi K3 y otros NIM de razonamiento: el snippet de Build manda esto.
    if (providerId === "nvidia" && /kimi-k3|kimi-k2|deepseek-r1|nemotron/i.test(modelId)) {
      body.reasoning_effort = "max";
    }
    if (tools?.length) {
      const translated = translateToolsForProtocol("openai", tools);
      if (translated) body.tools = translated;
    }
    const extra: Record<string, string> = {};
    if (providerId === "openrouter") extra["HTTP-Referer"] = location.origin;
    if (providerId === "nvidia" && settings.stream) extra.Accept = "text/event-stream";
    const req = buildRequest(endpoint(base, "/chat/completions"), opts, {
      Authorization: `Bearer ${config.apiKey}`,
      ...extra,
    });
    const res = await loggedFetch(
      req.target,
      { providerId, providerName: def.name, modelId, url: req.upstream, headers: req.logHeaders, body: JSON.stringify(body) },
      { method: "POST", headers: req.headers, body: JSON.stringify(body), signal }
    );
    recordQuotaHeaders(providerId, res.headers);
    await assertOk(res, def.name);
    const handle = (j: {
      choices?: { delta?: { content?: string | null; reasoning_content?: string | null }; message?: { content?: string | null; tool_calls?: unknown[] } }[];
    }) => {
      anotarMotivo("openai", j);
      // el razonamiento (reasoning_content) se traduce aquí, igual que las
      // tools y el motivo de parada: una pieza normalizada por módulo
      const r = razonamientoDeTrozo("openai", j);
      if (r.razonamiento) {
        reasoning += r.razonamiento;
        if (!content) push();
      }
      if (r.contenido) {
        content += r.contenido;
        push();
      }
      // Acumula tool_calls del delta (streaming).
      accumToolCalls(j);
      // Caso no-streaming: el mensaje final trae `tool_calls`.
      const msg = j.choices?.[0]?.message;
      if (msg?.tool_calls) {
        accumToolCalls({ choices: [{ delta: { tool_calls: msg.tool_calls } }] });
      }
    };
    if (!settings.stream) {
      const j = await res.json();
      anotarMotivo("openai", j);
      content = j.choices?.[0]?.message?.content ?? "";
      // Caso no-streaming: el mensaje final trae `tool_calls` en
      // `message.tool_calls`, no en `delta.tool_calls`. Lo envolvemos
      // para que `accumToolCalls` lo entienda.
      const msg = j.choices?.[0]?.message;
      if (msg?.tool_calls) {
        accumToolCalls({ choices: [{ delta: { tool_calls: msg.tool_calls } }] });
      }
      push();
    } else {
      await readSSE(res, (payload) => {
        try { handle(JSON.parse(payload)); } catch { /* ignore */ }
      });
    }
  }

  // Si el modelo pidió tools, se lo decimos al llamador ANTES de `onDone`
  // para que pueda ejecutarlos, reinyectar los resultados y disparar la
  // siguiente vuelta. Si no hay tool_calls, `onToolCalls` no se llama
  // (el llamador decide si seguir con XML o cerrar el bucle).
  const finalCalls = flushToolCalls();
  if (finalCalls.length && streamOpts.onToolCalls) {
    streamOpts.onToolCalls(finalCalls);
  }
  if (motivoParada) streamOpts.onFinish?.(motivoParada);
  streamOpts.onDone(content);
  return content;
}

/** Obtiene la lista de modelos disponibles del proveedor.
 *
 * Los tres protocolos comparten el mismo camino de red que el chat —el proxy de
 * mismo origen, salvo conexión directa— así que pasan por `buildRequest`. Antes
 * cada uno lo repetía a mano y ya divergían entre sí.
 */
export async function fetchModels(providerId: ProviderId, config: ProviderConfig): Promise<string[]> {
  const def = getProvider(providerId);
  const base = (config.baseUrl || def.baseUrl).trim();

  const pedir = async (path: string, extra: Record<string, string>) => {
    const req = buildRequest(endpoint(base, path), { config, providerId }, extra);
    // GET: sin cuerpo, así que tampoco hace falta anunciar JSON.
    delete req.headers["Content-Type"];
    const res = await fetch(req.target, { headers: req.headers });
    await assertOk(res, def.name);
    return res.json();
  };

  if (def.protocol === "gemini") {
    const j = await pedir("/models", { "x-goog-api-key": config.apiKey });
    return (j.models ?? [])
      .map((m: { name: string }) => m.name?.replace(/^models\//, ""))
      .filter((id: string) => id && !id.includes("embedding") && !id.includes("aqa"));
  }

  if (def.protocol === "anthropic") {
    const j = await pedir("/v1/models", {
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    });
    return (j.data ?? []).map((m: { id: string }) => m.id).filter(Boolean);
  }

  const j = await pedir("/models", { Authorization: `Bearer ${config.apiKey}` });
  return (j.data ?? []).map((m: { id: string }) => m.id).filter(Boolean).sort();
}

/**
 * Consulta puntual del estado de la clave en OpenRouter (GET /api/v1/key):
 * uso y tope en créditos. La llama el panel de Cuota al abrirse, NO en bucle:
 * es un endpoint aparte, y preguntarle en cada respuesta sería justo el tipo de
 * tráfico que los límites castigan. Devuelve null si la respuesta no se entiende.
 */
export async function fetchOpenRouterKeyInfo(
  providerId: ProviderId,
  config: ProviderConfig
): Promise<{ used: number; limit: number | null } | null> {
  const def = getProvider(providerId);
  const base = (config.baseUrl || def.baseUrl).trim();
  const req = buildRequest(endpoint(base, "/api/v1/key"), { config, providerId }, {
    Authorization: `Bearer ${config.apiKey}`,
  });
  delete req.headers["Content-Type"];
  const res = await fetch(req.target, { headers: req.headers });
  await assertOk(res, def.name);
  return parseOpenRouterKey(await res.json());
}




/* ------------------------------------------------------------------ */
/* comprobar un modelo                                                */
/* ------------------------------------------------------------------ */

/** Cuerpo mínimo por protocolo: un token de salida, sin streaming. */
function cuerpoDePrueba(protocolo: string, modelId: string): Record<string, unknown> {
  if (protocolo === "anthropic") {
    return { model: modelId, max_tokens: 1, messages: [{ role: "user", content: "hi" }] };
  }
  if (protocolo === "gemini") {
    return {
      contents: [{ role: "user", parts: [{ text: "hi" }] }],
      generationConfig: { maxOutputTokens: 1 },
    };
  }
  return { model: modelId, max_tokens: 1, messages: [{ role: "user", content: "hi" }] };
}

/** Ruta y cabeceras de la prueba, por protocolo. */
function peticionDePrueba(providerId: ProviderId, config: ProviderConfig, modelId: string) {
  const def = getProvider(providerId);
  const base = (config.baseUrl || def.baseUrl).trim();
  if (def.protocol === "anthropic") {
    return buildRequest(endpoint(base, "/v1/messages"), { config, providerId }, {
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    });
  }
  if (def.protocol === "gemini") {
    return buildRequest(
      endpoint(base, `/models/${encodeURIComponent(modelId)}:generateContent`),
      { config, providerId },
      { "x-goog-api-key": config.apiKey }
    );
  }
  return buildRequest(endpoint(base, "/chat/completions"), { config, providerId }, {
    Authorization: `Bearer ${config.apiKey}`,
  });
}

/**
 * Manda la petición más pequeña posible y traduce la respuesta.
 *
 * Un token de salida: lo justo para saber si el proveedor reconoce el modelo y
 * deja usarlo con tu clave. No pasa por el registro de peticiones — es ruido
 * que taparía las peticiones de verdad en «Uso».
 */
export async function probeModel(
  providerId: ProviderId,
  config: ProviderConfig,
  modelId: string,
  signal?: AbortSignal
): Promise<ProbeResult> {
  const def = getProvider(providerId);
  const empezó = Date.now();
  const req = peticionDePrueba(providerId, config, modelId);
  const body = JSON.stringify(cuerpoDePrueba(def.protocol, modelId));

  try {
    const res = await fetch(req.target, { method: "POST", headers: req.headers, body, signal });
    recordQuotaHeaders(providerId, res.headers);
    let texto = "";
    if (!res.ok) {
      try {
        texto = (await res.text()).slice(0, 400);
      } catch {
        /* sin cuerpo legible */
      }
    }
    return {
      verdict: classifyProbe(res.status, texto),
      status: res.status,
      detail: texto || undefined,
      ms: Date.now() - empezó,
      at: Date.now(),
    };
  } catch (err) {
    return {
      verdict: classifyProbe(0),
      status: 0,
      detail: err instanceof Error ? err.message : undefined,
      ms: Date.now() - empezó,
      at: Date.now(),
    };
  }
}
