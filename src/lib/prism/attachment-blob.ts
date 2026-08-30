"use client";
/** Prism AI — Almacén IndexedDB para los binarios de los adjuntos.
 *
 * Hasta la v3.13 los adjuntos se guardaban como `dataUrl` base64 dentro del
 * store de zustand, y el store entero vivía en localStorage. LocalStorage
 * tiene un tope de ~5 MB en la mayoría de los navegadores; un PDF o un par
 * de imágenes bastan para llenarlo. Y lo grave no es que falle el adjunto:
 * cuando `persist` de zustand no puede escribir, **no se guarda nada** —
 * ni conversaciones, ni claves, ni ajustes — y falla en silencio.
 *
 * Aquí se mueven solo los binarios (el `dataUrl`). El resto del attachment
 * (id, name, mediaType, size) sigue en el store, junto con un `blobId` que
 * apunta a la entrada de IndexedDB. IndexedDB no tiene el techo de los 5 MB
 * y tolera archivos de varios MB sin problema.
 *
 * Toda función es resistente: si IndexedDB está apagado (modo privado, SSR,
 * falta de permiso), devuelve `null`/`false` sin lanzar. El llamador cae al
 * comportamiento anterior (mantener el `dataUrl` en el attachment) y nada
 * se pierde — es el principio del PLANV4: «si algo sale mal, se conserva
 * lo viejo».
 */

const DB_NAME = "prism-attachments";
const STORE = "blobs";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function isBrowser(): boolean {
  return typeof indexedDB !== "undefined" && typeof window !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  if (!isBrowser()) return Promise.reject(new Error("IndexedDB no disponible"));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("No se pudo abrir IndexedDB"));
    req.onblocked = () => reject(new Error("IndexedDB bloqueado por otra pestaña"));
  });
  // Si la apertura falla, reseteamos la caché para que el próximo intento vuelva a probar.
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

/** Guarda un `dataUrl` bajo la clave `id`. No lanza: si IndexedDB falla,
 * devuelve `false` y el llamador decide si conserva el `dataUrl` en el
 * propio attachment (lo que hace `fileToAttachment`, para no perder el
 * adjunto recién añadido). */
export async function putBlob(id: string, dataUrl: string): Promise<boolean> {
  try {
    await withStore("readwrite", (s) => s.put(dataUrl, id));
    return true;
  } catch {
    return false;
  }
}

/** Recupera un `dataUrl` por su `id`, o `null` si no existe o no se pudo
 * leer. No lanza: la UI tiene que poder seguir aunque IDB esté caído. */
export async function getBlob(id: string): Promise<string | null> {
  try {
    const v = await withStore("readonly", (s) => s.get(id));
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}

/** Borra una entrada (cuando se borra un mensaje o una conversación).
 * Fire-and-forget en el store; si falla, queda como huérfano — el usuario
 * puede purgar con «Borrar todos los datos» si le importa. */
export async function deleteBlob(id: string): Promise<void> {
  try {
    await withStore("readwrite", (s) => s.delete(id));
  } catch {
    /* noop */
  }
}

/** Borra todo (cuando se hace «Borrar todos los datos» desde Ajustes). */
export async function clearAllBlobs(): Promise<void> {
  try {
    await withStore("readwrite", (s) => s.clear());
  } catch {
    /* noop */
  }
}

/** Dado un attachment, resuelve su `dataUrl`: si lo tiene en memoria lo
 * devuelve tal cual; si no, lo busca en IndexedDB por `blobId`. Devuelve
 * `null` si no se puede recuperar (entrada huérfana o IDB caído) — el
 * llamador debe omitir el adjunto en ese caso. */
export async function resolveAttachmentDataUrl(a: {
  id: string;
  dataUrl?: string;
  blobId?: string;
}): Promise<string | null> {
  if (a.dataUrl) return a.dataUrl;
  if (a.blobId) return getBlob(a.blobId);
  return null;
}

/** Migración tolerante de adjuntos viejos.
 *
 * Recorre todas las sesiones del store; para cada adjunto que tenga
 * `dataUrl` pero no `blobId`, lo copia a IndexedDB y, si tuvo éxito,
 * sustituye en el store el `dataUrl` por `blobId`. Si algo falla (IDB
 * caído, escritura del store rechazada por cuota), el adjunto se queda
 * como estaba: no se pierde nada.
 *
 * Es idempotente: un adjunto ya migrado tiene `blobId` y no se toca.
 * Por eso puede correr en cada arranque sin coste.
 *
 * Devuelve el número de adjuntos movidos a IndexedDB (para telemetría /
 * debug; hoy no se muestra al usuario).
 */
export async function migrateLegacyAttachments(): Promise<number> {
  if (!isBrowser()) return 0;
  // Import dinámico para evitar un ciclo de dependencias con el store
  // (el store importa types; este módulo no quiere tirar del store al cargar).
  const { usePrism } = await import("./store");
  const sessions = usePrism.getState().sessions;

  // 1. Recolección síncrona de los adjuntos pendientes de migrar.
  const pendientes: { id: string; dataUrl: string }[] = [];
  for (const s of sessions) {
    for (const m of s.messages) {
      if (!m.attachments) continue;
      for (const a of m.attachments) {
        if (!a.blobId && a.dataUrl) pendientes.push({ id: a.id, dataUrl: a.dataUrl });
      }
    }
  }
  if (!pendientes.length) return 0;

  // 2. Copia a IDB en paralelo. Si un adjunto no se puede copiar, se queda
  //    con su `dataUrl` original y no se marca como migrado.
  const okIds = new Set<string>();
  await Promise.all(
    pendientes.map(async (p) => {
      if (await putBlob(p.id, p.dataUrl)) okIds.add(p.id);
    })
  );
  if (!okIds.size) return 0;

  // 3. Reescribimos el store: los adjuntos migrados ganan `blobId = id` y
  //    pierden `dataUrl`. La escritura la hace zustand/persist cuando
  //    `setState` vuelve a serializar; si localStorage rechaza por cuota,
  //    el `dataUrl` sigue en el store en memoria y no se pierde nada.
  let movidos = 0;
  const finalSessions = sessions.map((s) => ({
    ...s,
    messages: s.messages.map((m) => {
      if (!m.attachments?.length) return m;
      let touched = false;
      const atts = m.attachments.map((a) => {
        if (!a.dataUrl || a.blobId) return a;
        if (!okIds.has(a.id)) return a;
        touched = true;
        movidos++;
        return { id: a.id, name: a.name, mediaType: a.mediaType, size: a.size, blobId: a.id };
      });
      return touched ? { ...m, attachments: atts } : m;
    }),
  }));

  if (movidos > 0) {
    usePrism.setState({ sessions: finalSessions });
  }
  return movidos;
}
