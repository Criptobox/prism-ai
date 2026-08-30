/** Tests del almacén IndexedDB de adjuntos (v3.14).
 *
 * En node no hay `indexedDB`; montamos un mock mínimo basado en `Map` que
 * imita la API de `IDBObjectStore` con callbacks asíncronos. No reproduce
 * la semántica de transacciones ni de cursor — solo lo justo para probar
 * `putBlob`, `getBlob`, `deleteBlob` y `clearAllBlobs`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ── Mock mínimo de IndexedDB ───────────────────────────────────────────
type Store = Map<string, string>;

function makeIdbMock() {
  const data = new Map<string, string>();
  const store: Store = data;

  function makeObjectStore() {
    return {
      put(value: string, key: string) {
        const req = {
          onsuccess: null as null | (() => void),
          onerror: null as null | (() => void),
          result: undefined as unknown,
        };
        queueMicrotask(() => {
          store.set(key, value);
          req.result = key;
          req.onsuccess?.();
        });
        return req;
      },
      get(key: string) {
        const req = {
          onsuccess: null as null | (() => void),
          onerror: null as null | (() => void),
          result: undefined as unknown,
        };
        queueMicrotask(() => {
          req.result = store.get(key) ?? undefined;
          req.onsuccess?.();
        });
        return req;
      },
      delete(key: string) {
        const req = {
          onsuccess: null as null | (() => void),
          onerror: null as null | (() => void),
          result: undefined as unknown,
        };
        queueMicrotask(() => {
          store.delete(key);
          req.onsuccess?.();
        });
        return req;
      },
      clear() {
        const req = {
          onsuccess: null as null | (() => void),
          onerror: null as null | (() => void),
          result: undefined as unknown,
        };
        queueMicrotask(() => {
          store.clear();
          req.onsuccess?.();
        });
        return req;
      },
    };
  }

  // `tx.objectStore(name)` es un MÉTODO del transaction; aquí devolvemos
  // siempre el mismo ObjectStore (solo hay uno: "blobs").
  const db = {
    objectStoreNames: { contains: () => true } as unknown as DOMStringList,
    transaction: () => ({ objectStore: () => makeObjectStore() }),
  };

  // El request se crea NUEVO en cada `open()` y el `onsuccess` se programa
  // en ese mismo instante — así el callback del usuario ya está asignado
  // cuando el microtask se dispara. Si lo programamos en `makeIdbMock`
  // (en el `beforeEach`), se dispara antes de que el test llame a `open`,
  // y `onsuccess` aún es `null`.
  const idb = {
    open: () => {
      const openReq = {
        onupgradeneeded: null as null | (() => void),
        onsuccess: null as null | (() => void),
        onerror: null as null | (() => void),
        result: db,
        error: null as unknown,
      };
      queueMicrotask(() => openReq.onsuccess?.());
      return openReq;
    },
    _data: data,
  };
  return idb;
}

let originalIndexedDB: typeof indexedDB | undefined;
let originalWindow: typeof window | undefined;

beforeEach(() => {
  // Aislamos cada test: stubGlobal resetea entre tests con `vi.unstubAllGlobals`.
  // También reseteamos la caché `dbPromise` del módulo via vi.resetModules.
  vi.resetModules();
  originalIndexedDB = globalThis.indexedDB;
  originalWindow = globalThis.window;
  const mock = makeIdbMock() as unknown as typeof indexedDB;
  (globalThis as { indexedDB: typeof indexedDB }).indexedDB = mock;
  (globalThis as { window: typeof window }).window = globalThis as unknown as typeof window;
});

afterEach(() => {
  (globalThis as { indexedDB: typeof indexedDB | undefined }).indexedDB = originalIndexedDB;
  (globalThis as { window: typeof window | undefined }).window = originalWindow;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("putBlob/getBlob/deleteBlob/clearAllBlobs", () => {
  it("pone y recupera un dataUrl por su id", async () => {
    const { putBlob, getBlob } = await import("../../src/lib/prism/attachment-blob");
    const ok = await putBlob("att-1", "data:image/png;base64,AAAA");
    expect(ok).toBe(true);
    const v = await getBlob("att-1");
    expect(v).toBe("data:image/png;base64,AAAA");
  });

  it("getBlob devuelve null si la entrada no existe", async () => {
    const { getBlob } = await import("../../src/lib/prism/attachment-blob");
    expect(await getBlob("inexistente")).toBe(null);
  });

  it("deleteBlob borra la entrada", async () => {
    const { putBlob, getBlob, deleteBlob } = await import("../../src/lib/prism/attachment-blob");
    await putBlob("att-2", "data:image/png;base64,BBBB");
    await deleteBlob("att-2");
    expect(await getBlob("att-2")).toBe(null);
  });

  it("clearAllBlobs vacía el almacén", async () => {
    const { putBlob, getBlob, clearAllBlobs } = await import("../../src/lib/prism/attachment-blob");
    await putBlob("a", "data:1");
    await putBlob("b", "data:2");
    await clearAllBlobs();
    expect(await getBlob("a")).toBe(null);
    expect(await getBlob("b")).toBe(null);
  });

  it("putBlob no lanza si indexedDB.open falla: devuelve false", async () => {
    // IDB caído: simulamos que open lanza.
    globalThis.indexedDB = { open: () => { throw new Error("IDB no disponible"); } } as unknown as typeof indexedDB;
    const { putBlob } = await import("../../src/lib/prism/attachment-blob");
    const ok = await putBlob("x", "data:y");
    expect(ok).toBe(false);
  });
});

describe("resolveAttachmentDataUrl", () => {
  it("devuelve dataUrl del propio attachment si está presente", async () => {
    const { resolveAttachmentDataUrl } = await import("../../src/lib/prism/attachment-blob");
    const v = await resolveAttachmentDataUrl({
      id: "x",
      dataUrl: "data:image/png;base64,AAAA",
    });
    expect(v).toBe("data:image/png;base64,AAAA");
  });

  it("cae a IndexedDB por blobId cuando dataUrl no está", async () => {
    const { putBlob, resolveAttachmentDataUrl } = await import("../../src/lib/prism/attachment-blob");
    await putBlob("att-3", "data:image/jpeg;base64,CCCC");
    const v = await resolveAttachmentDataUrl({ id: "att-3", blobId: "att-3" });
    expect(v).toBe("data:image/jpeg;base64,CCCC");
  });

  it("devuelve null si no hay ni dataUrl ni blobId", async () => {
    const { resolveAttachmentDataUrl } = await import("../../src/lib/prism/attachment-blob");
    const v = await resolveAttachmentDataUrl({ id: "huerfano" });
    expect(v).toBe(null);
  });

  it("devuelve null si blobId apunta a una entrada borrada", async () => {
    const { resolveAttachmentDataUrl, putBlob, deleteBlob } = await import("../../src/lib/prism/attachment-blob");
    await putBlob("att-4", "data:1");
    await deleteBlob("att-4");
    const v = await resolveAttachmentDataUrl({ id: "att-4", blobId: "att-4" });
    expect(v).toBe(null);
  });
});

describe("migrateLegacyAttachments", () => {
  it("mueve dataUrl a IDB y deja blobId en el store", async () => {
    // El store es un mock: llamamos a `setState` y comprobamos que se
    // llama con sessions donde el attachment ya no tiene `dataUrl` y
    // tiene `blobId`.
    const sessions = [
      {
        id: "s1",
        title: "Sesión",
        createdAt: 1,
        updatedAt: 1,
        messages: [
          {
            id: "m1",
            role: "user",
            content: "hola",
            createdAt: 1,
            attachments: [
              {
                id: "att-5",
                name: "img.png",
                mediaType: "image/png",
                dataUrl: "data:image/png;base64,AAAA",
                size: 100,
              },
            ],
          },
        ],
      },
    ];
    const setState = vi.fn();
    vi.doMock("../../src/lib/prism/store", () => ({ usePrism: { getState: () => ({ sessions }), setState } }));
    const { migrateLegacyAttachments, getBlob } = await import("../../src/lib/prism/attachment-blob");
    const n = await migrateLegacyAttachments();
    expect(n).toBe(1);
    // La entrada IDB existe
    expect(await getBlob("att-5")).toBe("data:image/png;base64,AAAA");
    // El store fue actualizado sin dataUrl y con blobId
    expect(setState).toHaveBeenCalledTimes(1);
    const arg = setState.mock.calls[0][0];
    const att = arg.sessions[0].messages[0].attachments[0];
    expect(att.dataUrl).toBeUndefined();
    expect(att.blobId).toBe("att-5");
    expect(att.size).toBe(100);
    expect(att.name).toBe("img.png");
  });

  it("es idempotente: no hace nada si los adjuntos ya tienen blobId", async () => {
    const sessions = [
      {
        id: "s1",
        title: "Sesión",
        createdAt: 1,
        updatedAt: 1,
        messages: [
          {
            id: "m1",
            role: "user",
            content: "hola",
            createdAt: 1,
            attachments: [
              {
                id: "att-6",
                name: "img.png",
                mediaType: "image/png",
                blobId: "att-6",
                size: 100,
              },
            ],
          },
        ],
      },
    ];
    const setState = vi.fn();
    vi.doMock("../../src/lib/prism/store", () => ({ usePrism: { getState: () => ({ sessions }), setState } }));
    const { migrateLegacyAttachments } = await import("../../src/lib/prism/attachment-blob");
    const n = await migrateLegacyAttachments();
    expect(n).toBe(0);
    expect(setState).not.toHaveBeenCalled();
  });

  it("no pierde el adjunto si IDB falla: deja dataUrl y no marca blobId", async () => {
    // Simulamos que putBlob falla: la entrada no se crea. La migración
    // debe dejar el attachment como estaba.
    const sessions = [
      {
        id: "s1",
        title: "Sesión",
        createdAt: 1,
        updatedAt: 1,
        messages: [
          {
            id: "m1",
            role: "user",
            content: "hola",
            createdAt: 1,
            attachments: [
              {
                id: "att-7",
                name: "img.png",
                mediaType: "image/png",
                dataUrl: "data:image/png;base64,AAAA",
                size: 100,
              },
            ],
          },
        ],
      },
    ];
    // IDB caído: indexedDB.open lanza.
    globalThis.indexedDB = { open: () => { throw new Error("IDB no disponible"); } } as unknown as typeof indexedDB;
    const setState = vi.fn();
    vi.doMock("../../src/lib/prism/store", () => ({ usePrism: { getState: () => ({ sessions }), setState } }));
    const { migrateLegacyAttachments } = await import("../../src/lib/prism/attachment-blob");
    const n = await migrateLegacyAttachments();
    expect(n).toBe(0);
    expect(setState).not.toHaveBeenCalled();
  });
});
