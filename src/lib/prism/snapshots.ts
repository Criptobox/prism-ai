/** Prism AI — Puntos de restauración del proyecto (tool `git_snapshot`).
 *
 * El agente trabaja sobre el Sandbox y las regeneraciones ramifican los
 * MENSAJES, pero el proyecto en sí no tenía historia: después de una
 * optimización que rompe todo, «volver atrás» era rehacerlo a mano.
 *
 * Un snapshot aquí es una copia comprimida... no: una copia PLANA de los
 * archivos de texto (`path → contenido`) con su fecha y un mensaje. Sin
 * git de verdad ni dependencias: el Sandbox solo maneja texto y el
 * tamaño lo pone el tope de caracteres, que ya es la moneda del resto
 * de la app (compresión, límites de adjuntos).
 *
 * Persistencia: `localStorage` cuando existe (navegador) y un mapa en
 * memoria cuando no (tests en Node, SSR). Nunca sale del dispositivo.
 */

/** Un punto de restauración. */
export interface Snapshot {
  /** id corto y estable (s1, s2, …) */
  id: string;
  /** etiqueta humana: qué momento representa */
  mensaje: string;
  /** epoch ms */
  fecha: number;
  /** archivos del proyecto en ese momento */
  files: Record<string, string>;
}

/** Cuántos snapshots se conservan por proyecto. El tope existe porque
 * viven en localStorage (≈5 MB en muchos navegadores). */
export const MAX_SNAPSHOTS = 12;

/** Tope de texto total por snapshot. Un proyecto de demos/web cabe de
 * sobra; uno que lo supere no se rompe: la tool avisa y no lo crea. */
export const MAX_CHARS_SNAPSHOT = 2_000_000;

const CLAVE = "prism-snapshots-v1";

/** El almacenamiento por defecto: localStorage en el navegador, memoria
 * en Node/SSR. Nunca lanza aunque localStorage esté bloqueado (modo
 * privado de algunos navegadores). */
function storagePorDefecto(): Storage {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    /* bloqueado: cae al mapa */
  }
  return memoriaComoStorage();
}

/** Storage en memoria con la MISMA interfaz que localStorage, para tests
 * y para entornos sin navegador. */
export function memoriaComoStorage(): Storage {
  let datos = new Map<string, string>();
  return {
    get length() {
      return datos.size;
    },
    clear: () => {
      datos = new Map();
    },
    getItem: (k) => (datos.has(k) ? datos.get(k)! : null),
    key: (i) => Array.from(datos.keys())[i] ?? null,
    removeItem: (k) => {
      datos.delete(k);
    },
    setItem: (k, v) => {
      datos.set(k, v);
    },
  };
}

function leer(st: Storage): Snapshot[] {
  try {
    const crudo = st.getItem(CLAVE);
    if (!crudo) return [];
    const lista = JSON.parse(crudo) as Snapshot[];
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

function escribir(st: Storage, lista: Snapshot[]): void {
  // el JSON de un proyecto grande puede pasarse del límite de la cuota:
  // si setItem lanza, el snapshot no se rompe, solo no se guarda (la tool
  // lo avisa) y la lista anterior sigue intacta.
  st.setItem(CLAVE, JSON.stringify(lista.slice(0, MAX_SNAPSHOTS)));
}

/** ¿Cuánto texto tiene el proyecto? Para decidir si merece snapshot. */
export function charsDeFiles(files: Record<string, string>): number {
  return Object.values(files).reduce((n, t) => n + t.length, 0);
}

/** Crea (sin guardar) un snapshot. Devuelve null si el proyecto supera
 * el tope: mejor no guardar nada que guardar la mitad. */
export function crearSnapshot(
  files: Record<string, string>,
  mensaje: string,
  ahora = Date.now()
): Snapshot | null {
  if (!Object.keys(files).length) return null;
  if (charsDeFiles(files) > MAX_CHARS_SNAPSHOT) return null;
  return {
    id: `s${ahora.toString(36)}`,
    mensaje: mensaje.trim() || "sin mensaje",
    fecha: ahora,
    files: { ...files },
  };
}

/** Guarda un snapshot (el más nuevo primero) respetando el tope. */
export function guardarSnapshot(s: Snapshot, st: Storage = storagePorDefecto()): Snapshot[] {
  const lista = [s, ...leer(st)].slice(0, MAX_SNAPSHOTS);
  escribir(st, lista);
  return lista;
}

/** Lista los snapshots guardados (el más nuevo primero). */
export function listarSnapshots(st: Storage = storagePorDefecto()): Snapshot[] {
  return leer(st);
}

/** Devuelve un snapshot por id, o null si no existe. */
export function obtenerSnapshot(id: string, st: Storage = storagePorDefecto()): Snapshot | null {
  return leer(st).find((s) => s.id === id) ?? null;
}

/** Borra un snapshot por id. Devuelve la lista restante. */
export function borrarSnapshot(id: string, st: Storage = storagePorDefecto()): Snapshot[] {
  const lista = leer(st).filter((s) => s.id !== id);
  escribir(st, lista);
  return lista;
}
