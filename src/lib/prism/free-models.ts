/** Prism AI — Detección de modelos gratis por proveedor.
 *
 * Reglas (verificado con la documentación oficial de cada proveedor):
 *  - AiHubMix subsidia 27+ modelos con sufijo «-free» (gpt-5.5-free, deepseek-v3-free…).
 *  - OpenRouter marca los gratuitos con sufijo «:free».
 *  - TokenRouter, con sufijo «-free» (su propia página avisa de que la
 *    capacidad gratuita es limitada y la estabilidad no está garantizada).
 *  - Gemini (AI Studio), Groq y Ollama ofrecen capa gratuita completa.
 *  - Z.ai ofrece GLM-Flash gratis.
 */
import type { ProviderId } from "./types";
import { makeModelKey, splitModelKey } from "./types";

/** Proveedores cuya API completa tiene capa gratuita (sin coste, con límites de tasa) */
export const FULL_FREE_TIER: ProviderId[] = ["gemini", "groq", "ollama", "cerebras"];

/** Crédito de prueba o plan experimental: todos sus modelos cuentan como gratis aquí */
export const TRIAL_FREE_TIER: ProviderId[] = ["nvidia", "kimi", "mistral"];

/** Proveedores locales que no necesitan API key */
export const KEYLESS_PROVIDERS: ProviderId[] = ["ollama", "lmstudio"];

/** Modelos gratis conocidos además de los que llevan sufijo -free / :free */
export const CURATED_FREE: Partial<Record<ProviderId, string[]>> = {
  zai: ["glm-4.5-flash", "glm-4.7-flash", "glm-4.5-air"],
};

/** ¿Es este modelo gratis con este proveedor? */
export function isFreeModel(providerId: ProviderId, modelId: string): boolean {
  const id = modelId.toLowerCase();
  if (id.includes("free")) return true; // AiHubMix «-free», OpenRouter «:free»
  if (FULL_FREE_TIER.includes(providerId) || TRIAL_FREE_TIER.includes(providerId)) return true;
  const curated = CURATED_FREE[providerId] ?? [];
  return curated.some((m) => id === m.toLowerCase());
}

/** Filtra una lista dejando solo los modelos gratis */
export function filterFreeModels<T extends string>(
  providerId: ProviderId,
  models: T[]
): T[] {
  return models.filter((m) => isFreeModel(providerId, m));
}

/** Config mínima de proveedores necesaria para elegir failover (evita importar el store aquí) */
export interface FailoverProviderCfg {
  apiKey: string;
  enabled: boolean;
  models: string[];
}

/** Orden de preferencia para el failover: primero capas 100% gratuitas sin recarga */
const FAILOVER_ORDER: ProviderId[] = [
  "gemini",
  "groq",
  "cerebras",
  "openrouter",
  "tokenrouter",
  "zai",
  "aihubmix",
  "kimi",
  "nvidia",
  "mistral",
  "ollama",
  "lmstudio",
  "deepseek",
  "xai",
  "openai",
  "anthropic",
  "custom",
];

/** Detecta errores de cuota/límite agotado (ej. AiHubMix: «solo 10 intentos sin recargar») */
export function isQuotaError(text: string): boolean {
  return /(abuse of free resources|can only try \d+ times|insufficient (?:balance|quota|credit)|quota.{0,24}(?:exceed|exhaust|limit)|out of (?:credits?|quota)|has_exceeded|billing|topup|recharg|\b429\b|\b402\b)/i.test(
    text
  );
}

/** Elige otro modelo gratis de otro proveedor conectado para reintentar tras agotar cuota.
 * `isBlocked` permite saltar proveedores en cooldown (salud de modelos). */
export function pickFailoverCandidate(
  providers: Partial<Record<ProviderId, FailoverProviderCfg>>,
  excludeProviderId: ProviderId,
  isBlocked?: (providerId: ProviderId, modelId: string) => boolean
): { providerId: ProviderId; modelId: string } | null {
  const usable = (id: ProviderId): FailoverProviderCfg | undefined => {
    const cfg = providers[id];
    if (!cfg?.enabled) return undefined;
    if (!cfg.apiKey.trim() && !KEYLESS_PROVIDERS.includes(id)) return undefined;
    return cfg;
  };
  for (const id of FAILOVER_ORDER) {
    if (id === excludeProviderId) continue;
    const cfg = usable(id);
    if (!cfg) continue;
    const free = filterFreeModels(id, cfg.models);
    const modelId = free.find((m) => !isBlocked?.(id, m)) ?? null;
    if (modelId) return { providerId: id, modelId };
  }
  return null;
}

export interface AutoCandidate {
  providerId: ProviderId;
  modelId: string;
  modelKey: string;
}

/** Cadena «Auto» (estilo OmniRoute): último modelo que funcionó (LKGP) primero,
 * luego el mejor gratis de cada proveedor por orden de preferencia.
 * `isBlocked` salta los que están en cooldown; el emisor es el propio usuario. */
export function buildAutoChain(
  providers: Partial<Record<ProviderId, FailoverProviderCfg>>,
  lastGoodKey: string | null,
  isBlocked?: (providerId: ProviderId, modelId: string) => boolean,
  limit = 6
): AutoCandidate[] {
  const usable = (id: ProviderId): FailoverProviderCfg | undefined => {
    const cfg = providers[id];
    if (!cfg?.enabled) return undefined;
    if (!cfg.apiKey.trim() && !KEYLESS_PROVIDERS.includes(id)) return undefined;
    return cfg;
  };
  const out: AutoCandidate[] = [];
  const seen = new Set<string>();
  const push = (providerId: ProviderId, modelId: string) => {
    const key = makeModelKey(providerId, modelId);
    if (seen.has(key) || isBlocked?.(providerId, modelId)) return;
    seen.add(key);
    out.push({ providerId, modelId, modelKey: key });
  };
  // 1. LKGP: el último que respondió bien, si sigue conectado
  if (lastGoodKey) {
    const split = splitModelKey(lastGoodKey);
    if (split && usable(split.providerId) && providers[split.providerId]?.models.includes(split.modelId)) {
      push(split.providerId, split.modelId);
    }
  }
  // 2. resto por orden de preferencia de capas gratis
  for (const id of FAILOVER_ORDER) {
    const cfg = usable(id);
    if (!cfg) continue;
    const free = filterFreeModels(id, cfg.models);
    if (free[0]) push(id, free[0]);
    if (out.length >= limit) break;
  }
  return out;
}
