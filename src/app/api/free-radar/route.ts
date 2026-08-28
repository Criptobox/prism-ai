import { NextResponse } from "next/server";
import { guardRequest, guardResponse } from "@/lib/prism/api-guard";
import { RADAR_OPENROUTER_FALLBACK, type LiveModel } from "@/lib/prism/free-radar";

export const dynamic = "force-dynamic";

/** Lista «en vivo» de modelos :free de OpenRouter (endpoint público, sin clave).
 * Caché en memoria de 10 min para no martillar la API. */
let cache: { at: number; data: { live: boolean; openrouter: LiveModel[] } } | null = null;
const TTL = 10 * 60 * 1000;

async function fetchOpenRouterFree(): Promise<{ live: boolean; models: LiveModel[] }> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { data?: Array<Record<string, unknown>> };
    const models = (json.data ?? [])
      .filter((m) => typeof m.id === "string" && (m.id as string).endsWith(":free"))
      .map((m) => ({
        id: m.id as string,
        name: typeof m.name === "string" ? (m.name as string) : undefined,
        contextLength: typeof m.context_length === "number" ? (m.context_length as number) : undefined,
      }))
      .sort((a, b) => (b.contextLength ?? 0) - (a.contextLength ?? 0))
      .slice(0, 30);
    if (models.length === 0) throw new Error("sin modelos :free");
    return { live: true, models };
  } catch {
    return { live: false, models: RADAR_OPENROUTER_FALLBACK };
  }
}

export async function GET(req: Request) {
  // Solo consulta una API pública, pero sin guardián el servidor de cualquiera
  // sirve de amplificador anónimo hacia OpenRouter.
  const guard = guardRequest(req);
  if (!guard.ok) return guardResponse(guard);

  if (cache && Date.now() - cache.at < TTL) {
    return NextResponse.json({ ...cache.data, fetchedAt: new Date(cache.at).toISOString(), cached: true });
  }
  const { live, models } = await fetchOpenRouterFree();
  const data = { live, openrouter: models };
  cache = { at: Date.now(), data };
  return NextResponse.json({ ...data, fetchedAt: new Date().toISOString(), cached: false });
}
