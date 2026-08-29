/** Prism AI — Saber que el servidor ya tiene una copia más nueva que la tuya.
 *
 * El problema real: el service worker se actualiza solo en segundo plano, pero
 * la pestaña que ya tienes abierta sigue ejecutando el JavaScript viejo hasta
 * que recargas. Con la app instalada en el móvil y abierta días, eso es
 * exactamente «he subido cambios y no los veo».
 *
 * La comprobación no pasa por el service worker a propósito: se le pregunta al
 * servidor qué copia está sirviendo ahora y se compara con la que lleva
 * incrustada esta página. Funciona igual con la app instalada, en una pestaña
 * normal y en desarrollo, y se puede probar de verdad — un service worker
 * actualizándose no hay forma honesta de simularlo en un test.
 */
import { compareSemver } from "./app-version";

export interface Copia {
  version: string;
  /** commit de 7 caracteres, vacío si la build no lo supo */
  commit: string;
}

/**
 * ¿La copia que sirve el servidor es distinta de la que corre en esta página?
 *
 * El commit manda: es lo único que cambia entre dos arreglos de la misma
 * versión, que es el caso normal. La versión solo decide cuando falta algún
 * commit, y entonces hace falta que sea MAYOR: un servidor que responde una
 * versión más vieja es un despliegue a medias o una caché intermedia, y avisar
 * ahí solo enseña a ignorar el aviso.
 */
export function hayCopiaNueva(actual: Copia, servida: Copia): boolean {
  if (actual.commit && servida.commit) return actual.commit !== servida.commit;
  if (!actual.version || !servida.version) return false;
  return compareSemver(servida.version, actual.version) > 0;
}

/**
 * ¿Toca preguntar otra vez?
 *
 * Se pregunta al volver a la pestaña y cada tanto, no en un bucle: la respuesta
 * solo cambia cuando hay un despliegue, y una app que se pasa el día pidiendo
 * al servidor gasta batería para nada.
 */
export function tocaComprobar(ahora: number, ultima: number, cada: number): boolean {
  if (ultima === 0) return true;
  return ahora - ultima >= cada;
}

/** Cada cuánto, como mucho, se vuelve a preguntar. */
export const CADA_MS = 15 * 60 * 1000;

export interface RespuestaVersion {
  version?: string;
  commit?: string;
}

/** Pregunta al servidor qué copia sirve. Devuelve null si no se pudo saber. */
export async function copiaServida(
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<Copia | null> {
  try {
    const res = await fetchImpl("/api/version", { cache: "no-store", signal });
    if (!res.ok) return null;
    const j = (await res.json()) as RespuestaVersion;
    if (!j.version) return null;
    return { version: String(j.version), commit: String(j.commit ?? "") };
  } catch {
    // sin red, o el servidor caído: no es momento de molestar con un aviso
    return null;
  }
}
