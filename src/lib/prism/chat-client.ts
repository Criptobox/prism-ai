"use client";
/** Prism AI — Cliente de chat streaming multi-protocolo.
 * Todas las peticiones van por /api/proxy (mismo origen, sin CORS) o directas
 * al proveedor si el usuario lo prefiere. Las claves viajan solo en cabeceras.
 */
import type { AppSettings, Attachment, ChatMessage, ProviderConfig, ProviderId } from "./types";
import { getProvider } from "./providers";
import { usePrism } from "./store";
import { beginRequest } from "./request-log";
import { classifyProbe, type ProbeResult } from "./model-probe";
import { recordQuotaHeaders, parseOpenRouterKey } from "./quota";

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
}

/** Mensaje con posibles imágenes adjuntas */
export type StreamMessage = Pick<ChatMessage, "role" | "content"> & {
  attachments?: Attachment[];
};

export interface StreamOptions extends StreamCallbacks {
  providerId: ProviderId;
  config: ProviderConfig;
  modelId: string;
  messages: StreamMessage[];
  settings: AppSettings;
  signal: AbortSignal;
}

function splitDataUrl(dataUrl: string): { mediaType: string; data: string } {
  const m = dataUrl.match(/^data:([^;,]+)(?:;[^,]*)?,([\s\S]*)$/);
  return m
    ? { mediaType: m[1], data: m[2] }
    : { mediaType: "image/jpeg", data: dataUrl };
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

function endpoint(baseUrl: string, path: string): string {
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
  const hint =
    res.status === 401 || res.status === 403
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
  const { providerId, config, modelId, messages, settings, signal } = opts;
  const def = getProvider(providerId);
  const base = (config.baseUrl || def.baseUrl).trim();

  let content = "";
  let reasoning = "";

  const push = () => {
    const visible = content || (reasoning ? "" : "");
    opts.onDelta(visible === "" && reasoning ? "" : content);
    if (reasoning) opts.onReasoning?.(reasoning);
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
      content = (j.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
      opts.onDelta(content);
    } else {
      await readSSE(res, (payload) => {
        try {
          const ev = JSON.parse(payload);
          if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
            content += ev.delta.text ?? "";
            push();
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
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    }) => {
      const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (text) {
        content += text;
        push();
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
    const msgs: { role: string; content: string | unknown[] }[] = [];
    if (settings.systemPrompt?.trim()) msgs.push({ role: "system", content: settings.systemPrompt.trim() });
    msgs.push(
      ...messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: toOpenAIContent(m) }))
    );
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
      choices?: { delta?: { content?: string | null; reasoning_content?: string | null } }[];
    }) => {
      const d = j.choices?.[0]?.delta;
      if (d?.reasoning_content) {
        reasoning += d.reasoning_content;
        if (!content) push();
      }
      if (d?.content) {
        content += d.content;
        push();
      }
    };
    if (!settings.stream) {
      const j = await res.json();
      content = j.choices?.[0]?.message?.content ?? "";
      push();
    } else {
      await readSSE(res, (payload) => {
        try { handle(JSON.parse(payload)); } catch { /* ignore */ }
      });
    }
  }

  opts.onDone(content);
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
