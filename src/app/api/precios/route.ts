import { NextResponse } from "next/server";
import { guardRequest, guardResponse } from "@/lib/prism/api-guard";
import { PRECIOS, PRECIOS_FECHA, PRECIOS_FUENTE } from "@/lib/prism/precios-datos";

export const dynamic = "force-dynamic";

/** Prism AI — Precios frescos, sin esperar a una versión nueva.
 *
 * La app trae una instantánea de precios generada con `npm run precios`. Sirve
 * para funcionar sin red y para que las pruebas sean deterministas, pero
 * envejece: entre dos versiones de Prism pueden pasar meses y los precios
 * cambian antes.
 *
 * Esta ruta baja el catálogo público (sin clave, sin datos del usuario) y
 * devuelve la parte que a Prism le sirve, con su fecha. Si falla —sin red, el
 * repo movido, el formato cambiado— se devuelve la instantánea empaquetada y
 * se dice que es esa: nunca se inventa un precio ni se deja la pantalla vacía.
 *
 * Es el mismo patrón que el radar de modelos gratis: petición pública desde el
 * servidor local, caché en memoria, y el guardián delante para que el servidor
 * de nadie sirva de amplificador anónimo.
 */
const FUENTE = PRECIOS_FUENTE;
const TTL = 24 * 60 * 60 * 1000; // los precios no cambian cada hora

/** De cómo llama LiteLLM al proveedor a cómo lo llama Prism. Igual que en
 * `scripts/precios.mjs`: si aquí y allí divergen, la instantánea y lo vivo
 * dejarían de ser comparables. */
const PROVEEDORES: Record<string, string> = {
  anthropic: "anthropic",
  openai: "openai",
  gemini: "gemini",
  groq: "groq",
  mistral: "mistral",
  deepseek: "deepseek",
  xai: "xai",
  nvidia_nim: "nvidia",
  cerebras: "cerebras",
  moonshot: "kimi",
  openrouter: "openrouter",
  zai: "zai",
};

interface Precio {
  in: number;
  out?: number;
  cr?: number;
  cw?: number;
  p: string;
}

let cache: { at: number; precios: Record<string, Precio>; fecha: string } | null = null;

function filtrar(crudo: Record<string, unknown>): Record<string, Precio> {
  const out: Record<string, Precio> = {};
  for (const [clave, v] of Object.entries(crudo)) {
    if (!v || typeof v !== "object") continue;
    const m = v as Record<string, unknown>;
    const proveedor = PROVEEDORES[String(m.litellm_provider)];
    if (!proveedor) continue;
    if (m.mode != null && m.mode !== "chat") continue;
    const num = (x: unknown) =>
      typeof x === "number" && Number.isFinite(x) && x > 0 ? x : undefined;
    const entrada = num(m.input_cost_per_token);
    if (entrada == null) continue;
    out[clave] = {
      in: entrada,
      out: num(m.output_cost_per_token),
      cr: num(m.cache_read_input_token_cost),
      cw: num(m.cache_creation_input_token_cost),
      p: proveedor,
    };
  }
  return out;
}

export async function GET(req: Request) {
  const guard = guardRequest(req);
  if (!guard.ok) return guardResponse(guard);

  if (cache && Date.now() - cache.at < TTL) {
    return NextResponse.json({
      precios: cache.precios,
      fecha: cache.fecha,
      fuente: FUENTE,
      vivo: true,
      cached: true,
    });
  }

  try {
    const res = await fetch(FUENTE, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const precios = filtrar((await res.json()) as Record<string, unknown>);
    // Un catálogo que de pronto trae cuatro modelos es un catálogo roto, y
    // servirlo dejaría la pantalla diciendo «sin dato» en casi todo. Con menos
    // de la mitad de lo que ya traíamos, nos quedamos con lo empaquetado.
    if (Object.keys(precios).length < Object.keys(PRECIOS).length / 2) {
      throw new Error("catálogo sospechosamente corto");
    }
    const fecha = new Date().toISOString().slice(0, 10);
    cache = { at: Date.now(), precios, fecha };
    return NextResponse.json({ precios, fecha, fuente: FUENTE, vivo: true, cached: false });
  } catch {
    return NextResponse.json({
      precios: PRECIOS,
      fecha: PRECIOS_FECHA,
      fuente: FUENTE,
      vivo: false,
      cached: false,
    });
  }
}
