/** Prism AI — Búsqueda web para el agente (tool `search_web`).
 *
 * `read_url` lee una página EXACTA que el modelo ya conoce. El hueco era
 * encontrar la página: «¿cuál es la sintaxis de X en 2026?», «¿qué API
 * da el tiempo sin clave?». Esta trae resultados de búsqueda reales.
 *
 * Motor: el HTML de DuckDuckGo (`html.duckduckgo.com`), que no necesita
 * clave ni registrarse. Todo pasa por `/api/proxy`, que ya tiene el escudo
 * anti-SSRF de `net-guard.ts` y deja la petición en el registro visible.
 *
 * El PARSEADOR es puro (regex, sin DOM): así se puede testear en Node sin
 * navegador y no depende de jsdom. Es deliberadamente conservador: si el
 * HTML cambia, devuelve 0 resultados y el agente lo lee como «prueba otros
 * términos», nunca como datos inventados.
 */

/** Un resultado de búsqueda tal como se le enseña al modelo. */
export interface ResultadoWeb {
  titulo: string;
  url: string;
  resumen: string;
}

/** Máximo de resultados que se devuelven al modelo: más solo gasta
 * contexto sin decidir nada por él. */
export const MAX_RESULTADOS = 5;

/** Igual que read_url: una búsqueda que no contesta en este tiempo no
 * merece bloquear el bucle del agente. */
export const TIMEOUT_BUSQUEDA_MS = 15_000;

/** URL del buscador para una consulta. Exportada para tests. */
export function urlBusquedaDdg(consulta: string): string {
  return `https://html.duckduckgo.com/html/?q=${encodeURIComponent(consulta)}`;
}

/** Entidades HTML mínimas que aparecen en títulos y resúmenes. */
function decodificarEntidades(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** Quita las etiquetas de dentro de un título/resumen (DDG marca las
 * coincidencias con <b>). */
function sinEtiquetas(s: string): string {
  return decodificarEntidades(s.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

/** DDG envuelve los enlaces orgánicos en un redirect propio
 * `//duckduckgo.com/l/?uddg=<url codificada>&rut=...`. Hay que decodificar
 * `uddg` o el modelo recibe un enlace al redirect, no a la página. */
export function urlReal(href: string): string {
  const limpio = href.replace(/&amp;/g, "&");
  const m = /[?&]uddg=([^&]+)/.exec(limpio);
  if (!m) return limpio;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return limpio;
  }
}

/** ¿Es un resultado de anuncio? DDG los marca con clases `result--ad` y
 * enlaces a y.js. El agente no debe leer publicidad como si fuera
 * documentación. */
function esAnuncio(href: string): boolean {
  return href.includes("duckduckgo.com/y.js") || href.includes("/ad_domain");
}

/** Saca los resultados de una página de resultados de DDG.
 *
 * Dos pasadas en orden (enlaces `result__a` y resúmenes
 * `result__snippet`) y se emparejan por posición: es más robusto que
 * parsear los bloques `<div class="result">` completos, que cambian más
 * a menudo. */
export function parsearResultadosDdg(html: string, max = MAX_RESULTADOS): ResultadoWeb[] {
  const enlaces = [...html.matchAll(
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
  )];
  const resumenes = [...html.matchAll(
    /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g
  )];
  const fuera: ResultadoWeb[] = [];
  for (let i = 0; i < enlaces.length && fuera.length < max; i++) {
    const href = urlReal(enlaces[i][1]);
    const titulo = sinEtiquetas(enlaces[i][2]);
    if (!titulo || !href || esAnuncio(href)) continue;
    // http(s) solamente: DDG a veces lista enlaces internos (mailto:, /help)
    if (!/^https?:\/\//i.test(href)) continue;
    fuera.push({
      titulo,
      url: href,
      resumen: resumenes[i] ? sinEtiquetas(resumenes[i][1]) : "",
    });
  }
  return fuera;
}

/** Ejecuta la búsqueda contra el proxy. No lanza: devuelve `{ok:false}`
 * con el motivo para que el modelo decida (reintentar, cambiar términos
 * o pasar de la búsqueda y decir que no lo sabe). */
export async function buscarEnWeb(
  consulta: string,
  deps: { fetch?: typeof fetch } = {}
): Promise<{ ok: true; resultados: ResultadoWeb[] } | { ok: false; error: string }> {
  const hacer = deps.fetch ?? fetch;
  const destino = urlBusquedaDdg(consulta);
  let res: Response;
  try {
    res = await hacer("/api/proxy", {
      method: "GET",
      headers: {
        "x-target-url": destino,
        accept: "text/html",
      },
      signal: AbortSignal.timeout(TIMEOUT_BUSQUEDA_MS),
    });
  } catch (e) {
    const abortada = e instanceof DOMException && e.name === "TimeoutError";
    return {
      ok: false,
      error: abortada
        ? `El buscador no respondió en ${TIMEOUT_BUSQUEDA_MS / 1000} s.`
        : "No se pudo contactar con el buscador.",
    };
  }
  if (!res.ok) {
    let detalle = "";
    try {
      const j = (await res.json()) as { error?: string; detalle?: string };
      detalle = [j.error, j.detalle].filter(Boolean).join(" — ");
    } catch {
      /* sin cuerpo legible */
    }
    return { ok: false, error: `El buscador devolvió ${res.status}${detalle ? `: ${detalle}` : ""}.` };
  }
  const html = await res.text();
  const resultados = parsearResultadosDdg(html);
  if (!resultados.length) {
    return {
      ok: false,
      error:
        "La búsqueda respondió pero sin resultados legibles. Prueba otros términos o usa read_url con una URL que conozcas.",
    };
  }
  return { ok: true, resultados };
}
