/** Prism AI — Radar de modelos gratis
 * Catálogo curado de proveedores con capa gratuita, ofertas del momento
 * (algunas con fecha/límite) y páginas que rastrean modelos gratis.
 * La lista «en vivo» de OpenRouter se obtiene de /api/free-radar. */
import type { ProviderId } from "./types";

export type RadarSource = {
  id: string;
  name: string;
  /** proveedor con integración nativa en Prism (null = usar «Personalizado») */
  providerId: ProviderId | null;
  /** baseUrl OpenAI-compatible para configurar el proveedor Personalizado */
  customBase?: string;
  description: string;
  keyUrl?: string;
  models: string[];
  limits: string;
  type: "permanente" | "trial" | "temporal";
  docsUrl?: string;
};

export type RadarOffer = {
  id: string;
  title: string;
  detail: string;
  providerId: ProviderId | null;
  /** modelo a activar con 1 clic */
  modelId?: string;
  customBase?: string;
  /** etiqueta humana de vigencia, ej. «hasta el 30 sep» */
  endsLabel?: string;
  url?: string;
  keyUrl?: string;
  hot?: boolean;
};

export type RadarPage = { id: string; name: string; url: string; note: string };

export type LiveModel = { id: string; name?: string; contextLength?: number };

/** Ids de novedades recientes: alimentan el badge de notificación del sidebar.
 * Al marcar como vistas (markRadarSeen) el badge desaparece. */
export const RADAR_NOVEDAD_IDS = [
  "offer-kimi-k3-free",
  "offer-kimi-trial",
  "offer-or-kimi-free-rotativo",
  "src-cerebras",
  "src-mistral",
  "src-github",
  "src-sambanova",
];

export const RADAR_OFFERS: RadarOffer[] = [
  {
    id: "offer-kimi-k3-free",
    title: "Kimi K3 gratis en AiHubMix",
    detail:
      "Versión free y abierta de coding-kimi-k3 de Moonshot AI (2.8T · multimodal · pensamiento · tools · contexto 1.05M). " +
      "Límites: 5 req/min · 500 req/día · 1M tokens/día. Sin tarjeta. Funciona con tu clave de AiHubMix. " +
      "OJO: las cuentas sin recargar solo tienen 10 intentos gratis en TODO AiHubMix; tras una recarga pequeña la capa -free queda con límites diarios.",
    providerId: "aihubmix",
    modelId: "coding-kimi-k3-free",
    endsLabel: "Vigente · verificado 28 ago 2026",
    url: "https://aihubmix.com/model/coding-kimi-k3-free",
    hot: true,
  },
  {
    id: "offer-kimi-trial",
    title: "Crédito de prueba de la API oficial de Kimi",
    detail:
      "Las cuentas nuevas de Kimi/Moonshot reciben crédito gratuito para la API oficial, " +
      "así puedes probar Kimi K3 completo a coste 0 mientras dure el crédito.",
    providerId: null,
    customBase: "https://api.moonshot.ai/v1",
    modelId: "kimi-k3-preview",
    endsLabel: "Solo cuentas nuevas · validez limitada",
    url: "https://www.kimi.com/en/help/kimi-api/api-free-trial",
    keyUrl: "https://platform.moonshot.ai/console/api-keys",
  },
  {
    id: "offer-or-kimi-free-rotativo",
    title: "OpenRouter rota modelos :free sin avisar",
    detail:
      "Hoy hay 18 modelos :free (GLM-5.2, MiniMax M3, Nemotron 3 Ultra 550B, Inkling de Thinking Machines, Gemma 4…). " +
      "Entra al Radar → «En vivo» para ver la lista actualizada al momento.",
    providerId: "openrouter",
    endsLabel: "Rotan constantemente",
    url: "https://openrouter.ai/models?max_price=0",
  },
  {
    id: "offer-nvidia-credits",
    title: "NVIDIA NIM: 1000 créditos API al registrarte",
    detail:
      "build.nvidia.com regala 1000 créditos para probar modelos frontiers (Llama, DeepSeek, Nemotron) " +
      "vía API compatible con OpenAI. Ideal para probar modelos premium sin pagar.",
    providerId: null,
    customBase: "https://integrate.api.nvidia.com/v1",
    endsLabel: "Para cuentas nuevas",
    keyUrl: "https://build.nvidia.com",
  },
];

export const RADAR_SOURCES: RadarSource[] = [
  {
    id: "src-aihubmix",
    name: "AiHubMix",
    providerId: "aihubmix",
    description:
      "Una sola clave para 27+ modelos gratis con sufijo -free. Incluye Kimi K3 free, GPT-5.5 free, Gemini Flash free y más. " +
      "Importante: cuenta nueva sin recargar = 10 intentos gratis totales (luego pide una recarga mínima).",
    keyUrl: "https://aihubmix.com/apikey",
    models: [
      "coding-kimi-k3-free",
      "gpt-5.5-free",
      "gpt-4.1-free",
      "gpt-4.1-mini-free",
      "gpt-4o-free",
      "gemini-3-flash-preview-free",
      "glm-4.7-flash-free",
      "deepseek-v3-free",
    ],
    limits: "Sin recargar: solo 10 intentos totales · tras recargar: según modelo (Kimi K3: 5 rpm · 500/día)",
    type: "permanente",
    docsUrl: "https://doc.aihubmix.com/",
  },
  {
    id: "src-openrouter",
    name: "OpenRouter",
    providerId: "openrouter",
    description:
      "Decenas de modelos con :free que rotan cada semana. Con $10 de crédito comprado el límite diario sube de 50 a 1000 req/día.",
    keyUrl: "https://openrouter.ai/keys",
    models: [
      "z-ai/glm-5.2:free",
      "minimax/minimax-m3:free",
      "nvidia/nemotron-3-ultra-550b-a55b:free",
      "thinkingmachines/inkling:free",
      "google/gemma-4-31b-it:free",
      "inclusionai/ling-3.0-flash-fin:free",
    ],
    limits: "~18-30 modelos :free · 50 req/día (1000 con crédito)",
    type: "permanente",
    docsUrl: "https://openrouter.ai/docs/limits",
  },
  {
    id: "src-gemini",
    name: "Google AI Studio (Gemini)",
    providerId: "gemini",
    description:
      "Capa gratuita generosa con Gemini 2.5 Pro y Flash. La clave se saca en un minuto con cuenta Google.",
    keyUrl: "https://aistudio.google.com/app/apikey",
    models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite"],
    limits: "Flash: ~10-15 rpm · 250-500 req/día (varía por modelo/región)",
    type: "permanente",
    docsUrl: "https://ai.google.dev/gemini-api/docs/rate-limits",
  },
  {
    id: "src-groq",
    name: "Groq",
    providerId: "groq",
    description:
      "Inferencia ultrarrápida gratis: Llama 3.3 70B, Kimi K2 Instruct (¡Kimi gratis!), Qwen3 y más.",
    keyUrl: "https://console.groq.com/keys",
    models: [
      "llama-3.3-70b-versatile",
      "moonshotai/kimi-k2-instruct",
      "qwen/qwen3-32b",
      "llama-3.1-8b-instant",
    ],
    limits: "~30k tokens/min · 1k req/día según modelo",
    type: "permanente",
    docsUrl: "https://console.groq.com/docs/rate-limits",
  },
  {
    id: "src-zai",
    name: "GLM · Z.ai",
    providerId: "zai",
    description: "GLM-4.5-Flash es gratis: rápido y bueno para código y uso diario.",
    keyUrl: "https://z.ai/manage-apikey/apikey-list",
    models: ["glm-4.5-flash", "glm-4.5-air"],
    limits: "GLM-Flash gratis sin coste (límites suaves)",
    type: "permanente",
  },
  {
    id: "src-cerebras",
    name: "Cerebras",
    providerId: null,
    customBase: "https://api.cerebras.ai/v1",
    description:
      "El free tier más rápido del mercado (inferencia a velocidad absurda): Llama 3.3 70B, Qwen3 32B, GPT-OSS-120B.",
    keyUrl: "https://cloud.cerebras.ai",
    models: ["llama3.3-70b", "qwen-3-32b", "gpt-oss-120b"],
    limits: "Gratis con límites diarios generosos según modelo",
    type: "permanente",
    docsUrl: "https://inference-docs.cerebras.ai/support/pricing",
  },
  {
    id: "src-mistral",
    name: "Mistral La Plateforme",
    providerId: null,
    customBase: "https://api.mistral.ai/v1",
    description: "Plan gratuito experimental: Mistral Small y la familia open-mistral completos.",
    keyUrl: "https://console.mistral.ai/api-keys",
    models: ["mistral-small-latest", "mistral-nemo", "codestral-latest"],
    limits: "1 req/s · 500.000 tokens/min · 500 req/día",
    type: "permanente",
    docsUrl: "https://docs.mistral.ai/deployment/laplateforme/tier/",
  },
  {
    id: "src-github",
    name: "GitHub Models",
    providerId: null,
    customBase: "https://models.github.ai/inference",
    description:
      "Con tu cuenta de GitHub: GPT-4.1/4o, Llama, DeepSeek, Grok y más con límites diarios gratis. Clave = token personal de GitHub.",
    keyUrl: "https://github.com/settings/personal-access-tokens",
    models: ["openai/gpt-4.1-mini", "openai/gpt-4o-mini", "meta/Llama-4-Scout-17B-16E-Instruct"],
    limits: "Gratis con GitHub · 50-150 req/día según modelo (más con pago verificado)",
    type: "permanente",
    docsUrl: "https://docs.github.com/es/github-models",
  },
  {
    id: "src-sambanova",
    name: "SambaNova Cloud",
    providerId: null,
    customBase: "https://api.sambanova.ai/v1",
    description: "Capa gratuita con Llama 70B y DeepSeek-R1 destilado a muy alta velocidad.",
    keyUrl: "https://cloud.sambanova.ai/apis",
    models: ["Meta-Llama-3.3-70B-Instruct", "DeepSeek-R1-Distill-Llama-70B", "Qwen3-32B"],
    limits: "Free tier: rpm/rpd según modelo",
    type: "permanente",
    docsUrl: "https://docs.sambanova.ai/cloud/docs/get-started/overview",
  },
  {
    id: "src-cloudflare",
    name: "Cloudflare Workers AI",
    providerId: null,
    customBase: "https://api.cloudflare.com/client/v4/accounts/TU_CUENTA/ai/v1",
    description:
      "10.000 «neuronas» gratis al día: Llama 3.3 70B fast, Qwen, Gemma… Sustituye TU_CUENTA por tu account ID.",
    keyUrl: "https://dash.cloudflare.com/profile/api-tokens",
    models: ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/qwen/qwen2.5-coder-32b-instruct"],
    limits: "10.000 neuronas/día gratis",
    type: "permanente",
    docsUrl: "https://developers.cloudflare.com/workers-ai/platform/pricing/",
  },
  {
    id: "src-nvidia",
    name: "NVIDIA NIM",
    providerId: null,
    customBase: "https://integrate.api.nvidia.com/v1",
    description: "Catálogo enorme en build.nvidia.com con 1000 créditos gratis al crear la cuenta.",
    keyUrl: "https://build.nvidia.com",
    models: ["meta/llama-3.3-70b-instruct", "deepseek-ai/deepseek-r1", "nvidia/llama-3.3-nemotron-super-49b-v1.5"],
    limits: "1000 créditos de prueba por cuenta",
    type: "trial",
    docsUrl: "https://docs.api.nvidia.com",
  },
  {
    id: "src-ollama",
    name: "Ollama (local)",
    providerId: "ollama",
    description: "Modelos en tu propio equipo: gratis e ilimitado para siempre, funciona sin internet.",
    models: ["llama3.2", "qwen2.5", "qwen2.5-coder"],
    limits: "Ilimitado · 100% local",
    type: "permanente",
    docsUrl: "https://ollama.com/library",
  },
];

/** Páginas que rastrean ofertas y capas gratis de modelos API */
export const RADAR_PAGES: RadarPage[] = [
  {
    id: "page-awesome",
    name: "awesome-free-llm-apis (GitHub)",
    url: "https://github.com/mnfst/awesome-free-llm-apis",
    note: "Lista mantenida por la comunidad: todas las APIs con capa gratuita permanente y sus límites.",
  },
  {
    id: "page-or-blog",
    name: "OpenRouter Blog — Free LLM APIs compared",
    url: "https://openrouter.ai/blog/tutorials/free-llm-apis-compared",
    note: "13 opciones gratis comparadas (actualizado 2026): velocidad, límites y trampas.",
  },
  {
    id: "page-edenai",
    name: "Eden AI — Best Free LLM APIs",
    url: "https://www.edenai.co/post/top-free-llm-tools-apis-and-open-source-models",
    note: "Top 11 proveedores con rate limits reales medidos (ago 2026).",
  },
  {
    id: "page-wotai",
    name: "woTai — live-probed free list",
    url: "https://wotai.co/blog/best-free-llm-apis",
    note: "Lista sondeada en vivo: ~57 modelos gratis funcionando hoy.",
  },
  {
    id: "page-aihubmix",
    name: "AiHubMix — catálogo -free",
    url: "https://aihubmix.com/models",
    note: "Filtra por «free»: 27+ modelos con sufijo -free y promos temporales.",
  },
];

/** Referencia local por si /api/free-radar no puede salir a la red */
export const RADAR_OPENROUTER_FALLBACK: LiveModel[] = [
  { id: "thinkingmachines/inkling:free", contextLength: 1048576 },
  { id: "nvidia/nemotron-3.5-lightning:free", contextLength: 1000000 },
  { id: "nvidia/nemotron-3-ultra-550b-a55b:free", contextLength: 1000000 },
  { id: "dots-studio/dots-3-note-preview:free", contextLength: 512000 },
  { id: "minimax/minimax-m3:free", contextLength: 1048576 },
  { id: "z-ai/glm-5.2:free", contextLength: 256000 },
  { id: "inclusionai/ling-3.0-flash-fin:free", contextLength: 262144 },
  { id: "poolside/laguna-s-2.1:free", contextLength: 262144 },
  { id: "google/gemma-4-31b-it:free", contextLength: 262144 },
  { id: "google/gemma-4-26b-a4b-it:free", contextLength: 262144 },
  { id: "minimax/minimax-m2.7:free", contextLength: 196608 },
  { id: "cohere/north-mini-code:free", contextLength: 256000 },
  { id: "nvidia/nemotron-3-super-120b-a12b:free", contextLength: 262144 },
  { id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", contextLength: 256000 },
  { id: "liquid/lfm-2.5-2.6b:free", contextLength: 65536 },
  { id: "thinkingmachines/inkling-small:free", contextLength: 1048576 },
  { id: "poolside/laguna-xs-2.1:free", contextLength: 262144 },
  { id: "nvidia/nemotron-3.5-content-safety:free", contextLength: 128000 },
];

export function unseenRadarCount(seenIds: string[]): number {
  const set = new Set(seenIds);
  return RADAR_NOVEDAD_IDS.filter((id) => !set.has(id)).length;
}
