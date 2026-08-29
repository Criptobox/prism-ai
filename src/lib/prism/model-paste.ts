/** Prism AI — Extrae proveedor, clave, URL y modelo de un snippet
 * (Python de NVIDIA Build, OpenAI SDK de TokenRouter/Groq/OpenRouter, cURL…). */

import { PROVIDERS } from "./providers";
import type { ProviderId } from "./types";

export function parseModelPaste(raw: string): string {
  const t = raw.trim();
  if (!t) return "";

  const quoted = t.match(/["']model["']\s*:\s*["']([^"']+)["']/i);
  if (quoted?.[1]) return quoted[1].trim();

  const kw = t.match(/model\s*=\s*["']([^"']+)["']/i);
  if (kw?.[1]) return kw[1].trim();

  const nim = t.match(
    /(?:https?:\/\/)?(?:www\.)?build\.nvidia\.com\/(?:nim\/)?([a-z0-9._-]+\/[a-z0-9._-]+)/i
  );
  if (nim?.[1]) return nim[1];

  const line = t.split(/[\s,;]+/)[0] ?? "";
  return line.replace(/^["']|["']$/g, "");
}

export function isNvidiaCatalogPaste(raw: string): boolean {
  return /build\.nvidia\.com|integrate\.api\.nvidia\.com/i.test(raw);
}

export type ProviderSnippet = {
  providerId: ProviderId;
  apiKey?: string;
  modelId?: string;
  baseUrl?: string;
};

const PLACEHOLDER = /^(YOUR|TU_|xxx|placeholder|changeme|sk-YOUR|YOUR_KEY|YOUR_TOKEN)/i;

/** Hosts extra que no coinciden 1:1 con el baseUrl por defecto. */
const HOST_ALIASES: { host: string; id: ProviderId }[] = [
  { host: "integrate.api.nvidia.com", id: "nvidia" },
  { host: "build.nvidia.com", id: "nvidia" },
  { host: "api.tokenrouter.com", id: "tokenrouter" },
  { host: "api.tokenrouter.io", id: "tokenrouter" },
  { host: "tokenrouter.me", id: "tokenrouter" },
  { host: "www.tokenrouter.com", id: "tokenrouter" },
  { host: "api.moonshot.cn", id: "kimi" },
  { host: "platform.moonshot.ai", id: "kimi" },
  { host: "platform.kimi.ai", id: "kimi" },
  { host: "open.bigmodel.cn", id: "zai" },
];

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function providerFromUrl(url: string): ProviderId {
  const host = hostnameOf(url);
  if (!host) return "custom";
  const alias = HOST_ALIASES.find((a) => host === a.host || host.endsWith("." + a.host));
  if (alias) return alias.id;
  for (const p of PROVIDERS) {
    if (p.id === "custom" || !p.baseUrl.startsWith("http")) continue;
    const ph = hostnameOf(p.baseUrl);
    if (ph && (host === ph || host.endsWith("." + ph))) return p.id;
  }
  return "custom";
}

function normalizeBaseUrl(url: string): string {
  return url
    .trim()
    .replace(/\/chat\/completions\/?$/i, "")
    .replace(/\/completions\/?$/i, "")
    .replace(/\/+$/, "");
}

function extractUrl(t: string): string | undefined {
  const named =
    t.match(/invoke_url\s*=\s*["'](https?:\/\/[^"']+)["']/i)?.[1] ??
    t.match(/base_url\s*=\s*["'](https?:\/\/[^"']+)["']/i)?.[1] ??
    t.match(/baseURL\s*=\s*["'](https?:\/\/[^"']+)["']/i)?.[1];
  if (named) return named;
  const any = t.match(/https?:\/\/[a-z0-9.-]+(?::\d+)?(?:\/[^\s"'\\]*)?/i)?.[0];
  return any?.replace(/[.,;]+$/, "");
}

function extractApiKey(t: string): string | undefined {
  const candidates = [
    t.match(/Bearer\s+([A-Za-z0-9._\-]+)/i)?.[1],
    t.match(/api_key\s*=\s*["']([^"']+)["']/i)?.[1],
    t.match(/["']api_key["']\s*:\s*["']([^"']+)["']/i)?.[1],
    t.match(
      /(?:TOKENROUTER_API_KEY|OPENAI_API_KEY|NVIDIA_API_KEY|GROQ_API_KEY|MOONSHOT_API_KEY)\s*[=:]\s*["']?([A-Za-z0-9._\-]+)/i
    )?.[1],
    t.match(/\b(nvapi-[A-Za-z0-9_-]+)/)?.[1],
  ];
  for (const c of candidates) {
    if (c && !PLACEHOLDER.test(c) && c.length >= 8) return c;
  }
  return undefined;
}

/** Snippet de cliente (Python/cURL/SDK), no una clave suelta. */
export function looksLikeProviderSnippet(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  const hasUrl = /https?:\/\/|invoke_url|base_url|baseURL/i.test(t);
  const hasAuth = /Bearer\s+|api_key\s*=|nvapi-/i.test(t);
  const hasModel = /["']model["']\s*:|model\s*=/i.test(t);
  return (hasUrl && (hasAuth || hasModel)) || (hasAuth && hasModel && t.includes("\n"));
}

export function parseProviderSnippet(raw: string): ProviderSnippet | null {
  const t = raw.trim();
  if (!t || !looksLikeProviderSnippet(t)) return null;

  const apiKey = extractApiKey(t);
  const rawUrl = extractUrl(t);
  const baseUrl = rawUrl ? normalizeBaseUrl(rawUrl) : undefined;

  let modelId = parseModelPaste(t) || undefined;
  if (
    modelId &&
    (modelId.startsWith("http") ||
      modelId.startsWith("nvapi-") ||
      modelId.includes("=") ||
      PLACEHOLDER.test(modelId))
  ) {
    modelId = undefined;
  }

  let providerId: ProviderId = "custom";
  if (baseUrl) providerId = providerFromUrl(baseUrl);
  else if (isNvidiaCatalogPaste(t) || /nvapi-/i.test(t)) providerId = "nvidia";

  if (!apiKey && !modelId && !baseUrl) return null;
  return {
    providerId,
    apiKey,
    modelId,
    baseUrl:
      baseUrl ??
      (providerId === "nvidia" ? "https://integrate.api.nvidia.com/v1" : undefined),
  };
}

/** Compat: el recuadro viejo de NVIDIA. */
export function looksLikeNimSnippet(raw: string): boolean {
  const s = parseProviderSnippet(raw);
  return !!s && s.providerId === "nvidia";
}

export function parseNimSnippet(raw: string): Omit<ProviderSnippet, "providerId"> | null {
  const s = parseProviderSnippet(raw);
  if (!s || s.providerId !== "nvidia") return null;
  const { apiKey, modelId, baseUrl } = s;
  return { apiKey, modelId, baseUrl };
}
