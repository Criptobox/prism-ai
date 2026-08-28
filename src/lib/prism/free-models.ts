/** Prism AI — Detección de modelos gratis por proveedor.
 *
 * Reglas (verificado con la documentación oficial de cada proveedor):
 *  - AiHubMix subsidia 27+ modelos con sufijo «-free» (gpt-5.5-free, deepseek-v3-free…).
 *  - OpenRouter marca los gratuitos con sufijo «:free».
 *  - Gemini (AI Studio), Groq y Ollama ofrecen capa gratuita completa.
 *  - Z.ai ofrece GLM-Flash gratis.
 */
import type { ProviderId } from "./types";

/** Proveedores cuya API completa tiene capa gratuita (sin coste, con límites de tasa) */
export const FULL_FREE_TIER: ProviderId[] = ["gemini", "groq", "ollama"];

/** Modelos gratis conocidos además de los que llevan sufijo -free / :free */
export const CURATED_FREE: Partial<Record<ProviderId, string[]>> = {
  zai: ["glm-4.5-flash", "glm-4.7-flash", "glm-4.5-air"],
};

/** ¿Es este modelo gratis con este proveedor? */
export function isFreeModel(providerId: ProviderId, modelId: string): boolean {
  const id = modelId.toLowerCase();
  if (id.includes("free")) return true; // AiHubMix «-free», OpenRouter «:free»
  if (FULL_FREE_TIER.includes(providerId)) return true;
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
