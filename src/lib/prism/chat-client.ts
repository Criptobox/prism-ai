"use client";
/** Prism AI — Cliente de chat streaming multi-protocolo.
 * Todas las peticiones van por /api/proxy (mismo origen, sin CORS) o directas
 * al proveedor si el usuario lo prefiere. Las claves viajan solo en cabeceras.
 */
import type { AppSettings, Attachment, ChatMessage, ProviderConfig, ProviderId } from "./types";
import { getProvider } from "./providers";
import { usePrism } from "./store";
import { beginRequest } from "./request-log";

/** Cabecera de código de acceso del proxy propio (si el usuario la configuró) */
function accessCodeHeaders(): Record<string, string> {
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

/** fetch con registro (últimas peticiones + copiar como cURL) */
async function loggedFetch(
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
    const res = await fetch(meta.url, init);
    finish({ ok: res.ok, status: res.status, ms: Date.now() - startedAt });
    return res;
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === "AbortError";
    finish({ ok: false, status: 0, ms: Date.now() - startedAt });
    throw err;
  }
}

function endpoint(baseUrl: string, path: string): string {
  return baseUrl.replace(/\/+$/, "") + path;
}

/** Construye la URL final (proxy o directa) y las cabeceras. */
function buildRequest(url: string, opts: StreamOptions, extraHeaders: Record<string, string> = {}) {
  const { config, providerId, settings } = opts;
  const direct = config.useProxy === false;
  const target = direct ? url : `${PROXY_PATH}?t=${encodeURIComponent(providerId)}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };
  if (!direct) {
    headers["x-target-url"] = url;
    Object.assign(headers, accessCodeHeaders());
  }
  return { url: target, headers, direct };
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
    const { url, headers, direct } = buildRequest(endpoint(base, "/v1/messages"), opts, {
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    });
    const res = await loggedFetch(
      { providerId, providerName: def.name, modelId, url: endpoint(base, "/v1/messages"), headers, body: JSON.stringify(body) },
      { method: "POST", headers, body: JSON.stringify(body), signal }
    );
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
    const { url, headers } = buildRequest(endpoint(base, `/models/${encodeURIComponent(modelId)}:${method}`), opts, {
      "x-goog-api-key": config.apiKey,
    });
    const realUrl = endpoint(base, `/models/${encodeURIComponent(modelId)}:${method}`);
    const res = await loggedFetch(
      { providerId, providerName: def.name, modelId, url: realUrl, headers, body: JSON.stringify(body) },
      { method: "POST", headers, body: JSON.stringify(body), signal }
    );
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
      ...(settings.maxTokens ? { max_tokens: settings.maxTokens } : {}),
    };
    const extra: Record<string, string> = {};
    if (providerId === "openrouter") extra["HTTP-Referer"] = location.origin;
    const { url, headers } = buildRequest(endpoint(base, "/chat/completions"), opts, {
      Authorization: `Bearer ${config.apiKey}`,
      ...extra,
    });
    const res = await loggedFetch(
      { providerId, providerName: def.name, modelId, url: endpoint(base, "/chat/completions"), headers, body: JSON.stringify(body) },
      { method: "POST", headers, body: JSON.stringify(body), signal }
    );
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

/** Obtiene la lista de modelos disponibles del proveedor. */
export async function fetchModels(providerId: ProviderId, config: ProviderConfig): Promise<string[]> {
  const def = getProvider(providerId);
  const base = (config.baseUrl || def.baseUrl).trim();
  const direct = config.useProxy === false;
  const addProxy = (u: string) => (direct ? u : `${PROXY_PATH}?t=${encodeURIComponent(providerId)}`);

  if (def.protocol === "gemini") {
    const url = addProxy(endpoint(base, "/models"));
    const headers: Record<string, string> = { "x-goog-api-key": config.apiKey };
    if (!direct) {
      headers["x-target-url"] = endpoint(base, "/models");
      Object.assign(headers, accessCodeHeaders());
    }
    const res = await fetch(url, { headers });
    await assertOk(res, def.name);
    const j = await res.json();
    return (j.models ?? [])
      .map((m: { name: string; supportedGenerationMethods?: string[] }) =>
        m.name?.replace(/^models\//, "")
      )
      .filter((id: string) => id && (!id.includes("embedding") && !id.includes("aqa")));
  }

  if (def.protocol === "anthropic") {
    const url = endpoint(base, "/v1/models");
    const headers: Record<string, string> = {
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    };
    if (!direct) {
      headers["x-target-url"] = url;
      Object.assign(headers, accessCodeHeaders());
    }
    const res = await fetch(direct ? url : PROXY_PATH, { headers });
    await assertOk(res, def.name);
    const j = await res.json();
    return (j.data ?? []).map((m: { id: string }) => m.id).filter(Boolean);
  }

  const url = endpoint(base, "/models");
  const headers: Record<string, string> = { Authorization: `Bearer ${config.apiKey}` };
  if (!direct) {
    headers["x-target-url"] = url;
    Object.assign(headers, accessCodeHeaders());
  }
  const res = await fetch(addProxy(url), { headers });
  await assertOk(res, def.name);
  const j = await res.json();
  return (j.data ?? []).map((m: { id: string }) => m.id).filter(Boolean).sort();
}


