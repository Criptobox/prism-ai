/** Prism AI — Registro de peticiones con «Copiar como cURL»
 * (inspirado en los Request Logs de OrcaRouter: «Grade, model, latency — copy as cURL»).
 *
 * Anillo en MEMORIA (no se persiste en localStorage): las últimas 10 peticiones
 * que Prism envió a proveedores, con su cuerpo saneado (sin imágenes base64,
 * contenidos recortados) y las claves SIEMPRE redactadas a «TU_API_KEY».
 */

export interface RequestLogEntry {
  id: string;
  ts: number;
  providerId: string;
  providerName: string;
  modelId: string;
  url: string;
  method: string;
  /** cabeceras con claves redactadas (seguro para copiar/compartir) */
  headers: Record<string, string>;
  /** cuerpo JSON saneado (sin data URLs, contenidos truncados) */
  body: string;
  ok: boolean | null;
  status: number;
  ms: number;
}

const MAX_ENTRIES = 10;
const MAX_BODY = 4000;
const MAX_CONTENT = 800;

const ring: RequestLogEntry[] = [];
const listeners = new Set<() => void>();
/** snapshot estable para useSyncExternalStore (solo cambia al mutar el anillo) */
let snapshot: RequestLogEntry[] = [];

function rebuild() {
  snapshot = [...ring]; // el anillo ya está en orden «más reciente primero» (unshift)
  for (const fn of listeners) fn();
}

export function subscribeRequests(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getRecentRequests(): RequestLogEntry[] {
  return snapshot;
}

export function clearRecentRequests(): void {
  ring.length = 0;
  rebuild();
}

/** Registra el inicio de una petición; devuelve la función para cerrarla */
export function beginRequest(init: {
  providerId: string;
  providerName: string;
  modelId: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}): (result: { ok: boolean; status: number; ms: number }) => void {
  const id = Math.random().toString(36).slice(2, 9);
  const entry: RequestLogEntry = {
    id,
    ts: Date.now(),
    ...init,
    headers: redactHeaders(init.headers),
    body: sanitizeBody(init.body),
    ok: null,
    status: 0,
    ms: 0,
  };
  ring.unshift(entry);
  if (ring.length > MAX_ENTRIES) ring.length = MAX_ENTRIES;
  rebuild();
  return ({ ok, status, ms }) => {
    entry.ok = ok;
    entry.status = status;
    entry.ms = ms;
    rebuild();
  };
}

/** Sustituye cualquier clave por TU_API_KEY (Authorization, x-api-key, x-goog-api-key…) */
export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const SECRET = /^(authorization|x-api-key|x-goog-api-key|api-key|x-prism-code)$/i;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = SECRET.test(k) ? "TU_API_KEY" : v;
  }
  return out;
}

/** Quita imágenes base64 y recorta contenidos largos del body */
export function sanitizeBody(body: string): string {
  try {
    const parsed = JSON.parse(body);
    const walk = (node: unknown): unknown => {
      if (typeof node === "string") {
        return node.length > MAX_CONTENT
          ? node.replace(/data:[a-z/+.-]+;base64,[\s\S]*/g, "data:…[imagen omitida]").slice(0, MAX_CONTENT) + "…"
          : node.replace(/data:[a-z/+.-]+;base64,[A-Za-z0-9+/=]+/g, "data:…[imagen omitida]");
      }
      if (Array.isArray(node)) return node.map(walk);
      if (node && typeof node === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(node as Record<string, unknown>)) out[k] = walk(v);
        return out;
      }
      return node;
    };
    const clean = JSON.stringify(walk(parsed), null, 2);
    return clean.length > MAX_BODY ? clean.slice(0, MAX_BODY) + "\n…[recortado]" : clean;
  } catch {
    return body.length > MAX_BODY ? body.slice(0, MAX_BODY) + "…[recortado]" : body;
  }
}

/** Construye un comando curl reproducible (con TU_API_KEY como marcador) */
export function buildCurl(entry: RequestLogEntry): string {
  const parts = [`curl -X ${entry.method} '${entry.url}'`];
  const hasContentType = Object.keys(entry.headers).some(
    (k) => k.toLowerCase() === "content-type"
  );
  for (const [k, v] of Object.entries(entry.headers)) {
    parts.push(`  -H '${k}: ${v}'`);
  }
  if (!hasContentType) parts.push(`  -H 'Content-Type: application/json'`);
  if (entry.body) {
    parts.push(`  -d '${entry.body.replace(/'/g, "'\\''")}'`);
  }
  return parts.join(" \\\n");
}
