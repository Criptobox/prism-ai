/** Prism AI — Lo que TUS claves pueden usar hoy, gratis.
 *
 * El radar es en su mayor parte un catálogo escrito a mano, y solo la lista
 * `:free` de OpenRouter viene de la red. De ahí el «siempre pone lo mismo»:
 * porque literalmente lo es.
 *
 * Esto es la parte que sí cambia sola. Para cada proveedor que ya tienes
 * conectado se pide su lista de modelos —con tu clave, que es la única forma
 * de saber a qué tienes acceso de verdad— y se queda lo gratis que **todavía
 * no tienes añadido**. Eso sí es distinto cada semana, y es distinto para cada
 * persona.
 *
 * Aquí solo la decisión: a quién preguntar y qué quedarse. La red la pone el
 * llamador, para poder probar esto sin salir a internet.
 */
import type { ProviderId, ProviderConfig } from "./types";
import { makeModelKey } from "./types";
import { isFreeModel } from "./free-models";

export interface NovedadGratis {
  providerId: ProviderId;
  modelId: string;
  modelKey: string;
}

/** Cuántas novedades se enseñan. Es un radar, no un catálogo: veinte líneas
 * de modelos parecidos no se leen. */
export const MAX_NOVEDADES = 12;

/** Proveedores a los que se puede preguntar: conectados y con clave (o que no
 *  la necesitan, como un servidor local). */
export function proveedoresConsultables(
  providers: Partial<Record<ProviderId, ProviderConfig>>,
  sinClave: (id: ProviderId) => boolean
): ProviderId[] {
  return (Object.keys(providers) as ProviderId[]).filter((id) => {
    const cfg = providers[id];
    if (!cfg?.enabled) return false;
    return !!cfg.apiKey.trim() || sinClave(id);
  });
}

/**
 * Qué hay de nuevo y gratis en lo que devolvió cada proveedor.
 *
 * Se descarta lo que ya tienes añadido: el radar es para descubrir, y una
 * lista donde el 90% ya lo tienes no descubre nada.
 */
export function novedadesGratis(
  porProveedor: Array<{ providerId: ProviderId; modelos: string[]; yaTengo: string[] }>,
  limite = MAX_NOVEDADES
): NovedadGratis[] {
  const out: NovedadGratis[] = [];
  const vistos = new Set<string>();
  for (const p of porProveedor) {
    const tengo = new Set(p.yaTengo.map((m) => m.toLowerCase()));
    for (const modelId of p.modelos) {
      if (tengo.has(modelId.toLowerCase())) continue;
      if (!isFreeModel(p.providerId, modelId)) continue;
      const key = makeModelKey(p.providerId, modelId);
      if (vistos.has(key)) continue;
      vistos.add(key);
      out.push({ providerId: p.providerId, modelId, modelKey: key });
    }
  }
  // se reparte entre proveedores en vez de vaciar el primero: si uno devuelve
  // doscientos modelos, no puede dejar a los demás fuera de la lista
  return repartir(out, limite);
}

function repartir(todos: NovedadGratis[], limite: number): NovedadGratis[] {
  const porProv = new Map<ProviderId, NovedadGratis[]>();
  for (const n of todos) {
    const l = porProv.get(n.providerId) ?? [];
    l.push(n);
    porProv.set(n.providerId, l);
  }
  const out: NovedadGratis[] = [];
  let quedan = true;
  while (out.length < limite && quedan) {
    quedan = false;
    for (const [, lista] of porProv) {
      const n = lista.shift();
      if (!n) continue;
      quedan = true;
      out.push(n);
      if (out.length >= limite) break;
    }
  }
  return out;
}

/** Frase honesta del resultado. Sin novedades NO es un fallo: significa que ya
 *  tienes todo lo gratis de tus proveedores, que es una buena noticia. */
export function resumenNovedades(n: NovedadGratis[], consultados: number): string {
  if (!consultados) return "Conecta un proveedor para que el radar mire qué tienes disponible.";
  if (!n.length) {
    return `Nada nuevo en ${consultados} ${consultados === 1 ? "proveedor" : "proveedores"}: ya tienes añadido todo lo gratis que ofrecen.`;
  }
  return `${n.length} ${n.length === 1 ? "modelo gratis nuevo" : "modelos gratis nuevos"} en tus proveedores.`;
}
