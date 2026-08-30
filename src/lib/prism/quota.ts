"use client";
/** Prism AI — Cuota real por proveedor: el medidor honesto.
 *
 * Los porcentajes de cuota solo se pueden saber donde el proveedor los reporta.
 * Inventar un «82%» en una pantalla es peor que no tener pantalla: te acostumbras
 * a confiar en un número que nadie midió. Así que hay TRES estados, y se dice la
 * verdad en cada uno:
 *
 *  1. MEDIDA      — el proveedor manda cabeceras `x-ratelimit-*` en CADA respuesta
 *                   (Groq, Cerebras). Barra real, con la hora de reposición.
 *  2. CONSULTADA  — hay un endpoint aparte que da uso y tope de la clave
 *                   (OpenRouter: GET /api/v1/key). Se pregunta al abrir el panel,
 *                   no en bucle.
 *  3. SIN DATO    — no se inventa nada. Se muestra lo que sí sabemos: cuándo fue
 *                   el último 429, cuántos fallos seguidos lleva y si está
 *                   enfriándose ahora (eso lo mide health.ts con CUALQUIER
 *                   proveedor, porque no depende de que él colabore).
 *
 * Persistencia propia (`prism-quota-v1`), igual que salud y uso.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/** Una ventana de límite medida (peticiones, tokens, o la que mande el proveedor) */
export interface QuotaWindow {
  remaining: number;
  limit: number;
  /** epoch ms en que se repone la ventana (0 = el proveedor no lo dijo) */
  resetAt: number;
}

/** Datos consultados aparte (OpenRouter /api/v1/key): uso y tope de la clave */
export interface ConsultedQuota {
  used: number;
  /** null = clave sin tope (solo límites de tasa) */
  limit: number | null;
  /** etiqueta de unidad, ej. «créditos» */
  unit: string;
  /** epoch ms de la última consulta */
  at: number;
}

export type QuotaKind = "medida" | "consultada";

/** Lo que sabemos de un proveedor. Si `kind` no está definido, no hay dato. */
export interface ProviderQuota {
  kind: QuotaKind;
  /** ventanas medidas por cabeceras, indexadas por cubo («requests», «tokens»…) */
  windows?: Record<string, QuotaWindow>;
  consulted?: ConsultedQuota;
  /** epoch ms de la última actualización de este dato */
  at: number;
}

interface QuotaState {
  byProvider: Record<string, ProviderQuota>;
  /** guarda ventanas medidas a partir de cabeceras x-ratelimit-* */
  recordWindows: (providerId: string, windows: Record<string, QuotaWindow>) => void;
  /** guarda el resultado de una consulta puntual (OpenRouter) */
  recordConsulted: (
    providerId: string,
    data: { used: number; limit: number | null; unit?: string }
  ) => void;
  /** olvida un proveedor (p. ej. al cambiar la clave) */
  clear: (providerId: string) => void;
  clearAll: () => void;
}

const MAX_PROVIDERS = 24;

export const useQuota = create<QuotaState>()(
  persist(
    (set) => ({
      byProvider: {},

      recordWindows: (providerId, windows) =>
        set((st) => {
          const buckets = Object.keys(windows);
          if (!buckets.length) return {};
          const prev = st.byProvider[providerId];
          return {
            byProvider: {
              ...st.byProvider,
              [providerId]: {
                kind: "medida",
                windows: { ...prev?.windows, ...windows },
                at: Date.now(),
              },
            },
          };
        }),

      recordConsulted: (providerId, data) =>
        set((st) => {
          const prev = st.byProvider[providerId];
          // una consulta no borra ventanas medidas si llegaron después
          const windows =
            prev?.kind === "medida" && prev.at > (prev?.consulted?.at ?? 0)
              ? prev.windows
              : undefined;
          return {
            byProvider: {
              ...st.byProvider,
              [providerId]: {
                kind: "consultada",
                consulted: { ...data, unit: data.unit ?? "créditos", at: Date.now() },
                ...(windows ? { windows } : {}),
                at: Date.now(),
              },
            },
          };
        }),

      clear: (providerId) =>
        set((st) => {
          if (!st.byProvider[providerId]) return {};
          const { [providerId]: _drop, ...rest } = st.byProvider;
          return { byProvider: rest };
        }),

      clearAll: () => set({ byProvider: {} }),
    }),
    {
      name: "prism-quota-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (st) => ({ byProvider: st.byProvider }),
      // housekeeping al rehidratar: no acumular proveedores que ya no existen
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const keys = Object.keys(state.byProvider);
        if (keys.length > MAX_PROVIDERS) {
          const keep = keys
            .sort((a, b) => (state.byProvider[b]?.at ?? 0) - (state.byProvider[a]?.at ?? 0))
            .slice(0, MAX_PROVIDERS);
          const out: Record<string, ProviderQuota> = {};
          for (const k of keep) out[k] = state.byProvider[k];
          state.byProvider = out;
        }
      },
    }
  )
);

/* ------------------------------------------------------------------ */
/* parseo de cabeceras (puro, testeable)                              */
/* ------------------------------------------------------------------ */

/** Extrae segundos de un valor tipo «2m 59.31s», «1h0m», «45s» o «299» (s). */
export function parseResetDuration(v: string): number {
  const s = String(v).trim().toLowerCase();
  if (!s) return 0;
  // formato compuesto «2m 59.31s» / «1h 0m 5s»
  const comp = s.match(/^(?:(\d+(?:\.\d+)?)h)?\s*(?:(\d+(?:\.\d+)?)m)?\s*(?:(\d+(?:\.\d+)?)s)?$/);
  if (comp) {
    const [h, m, sec] = [comp[1], comp[2], comp[3]].map((x) => (x ? Number(x) : 0));
    const total = h * 3600 + m * 60 + sec;
    if (total > 0) return Math.round(total * 1000);
  }
  const plain = Number(s);
  if (Number.isFinite(plain) && plain > 0) return Math.round(plain * 1000); // segundos pelados
  return 0;
}

export interface ParsedWindows {
  windows: Record<string, QuotaWindow>;
}

/**
 * Parsea cabeceras `x-ratelimit-*` de cualquier proveedor que las mande.
 * Esquema estándar (Groq, Cerebras, NIM…):
 *   x-ratelimit-limit-requests / x-ratelimit-remaining-requests / x-ratelimit-reset-requests
 *   x-ratelimit-limit-tokens   / x-ratelimit-remaining-tokens   / x-ratelimit-reset-tokens
 * Devuelve null si no hay datos utilizables (¡nunca se inventa una ventana!).
 */
export function parseRateLimitHeaders(
  headers: Record<string, string>
): ParsedWindows | null {
  const h: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    h[k.toLowerCase().trim()] = String(v).trim();
  }
  const buckets = new Set<string>();
  for (const k of Object.keys(h)) {
    const m = k.match(/^x-ratelimit-limit-([a-z-]+)$/);
    if (m && h[k]) buckets.add(m[1]);
  }
  if (!buckets.size) return null;
  const windows: Record<string, QuotaWindow> = {};
  const now = Date.now();
  for (const bucket of buckets) {
    const limit = Number(h[`x-ratelimit-limit-${bucket}`]);
    const remainingRaw = h[`x-ratelimit-remaining-${bucket}`];
    const remaining = remainingRaw != null && remainingRaw !== "" ? Number(remainingRaw) : limit;
    if (!Number.isFinite(limit) || limit <= 0) continue;
    if (!Number.isFinite(remaining) || remaining < 0) continue;
    const resetRaw = h[`x-ratelimit-reset-${bucket}`];
    const resetMs = resetRaw ? parseResetDuration(resetRaw) : 0;
    windows[bucket] = {
      remaining,
      limit,
      resetAt: resetMs > 0 ? now + resetMs : 0,
    };
  }
  return Object.keys(windows).length ? { windows } : null;
}

/** De un `Headers` real, extrae solo las cabeceras de cuota (minúsculas). */
export function quotaHeadersFrom(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((v, k) => {
    const lk = k.toLowerCase();
    if (lk.startsWith("x-ratelimit") || lk === "retry-after") out[lk] = v;
  });
  return out;
}

/** Punto de captura: se llama tras CADA respuesta del proveedor (chat, prueba…). */
export function recordQuotaHeaders(providerId: string, headers: Headers): void {
  try {
    const parsed = parseRateLimitHeaders(quotaHeadersFrom(headers));
    if (parsed) useQuota.getState().recordWindows(providerId, parsed.windows);
  } catch {
    /* el medidor nunca rompe el chat */
  }
}

/** Consulta puntual a OpenRouter: uso y tope de la clave. */
export interface OpenRouterKeyData {
  used: number;
  limit: number | null;
}

/** Parsea el cuerpo de GET /api/v1/key (puro, testeable). */
export function parseOpenRouterKey(body: unknown): OpenRouterKeyData | null {
  const d = (body as { data?: { usage?: unknown; limit?: unknown } })?.data;
  if (!d || typeof d !== "object") return null;
  const used = Number(d.usage);
  const limit = d.limit == null ? null : Number(d.limit);
  if (!Number.isFinite(used)) return null;
  return {
    used,
    limit: limit != null && Number.isFinite(limit) ? limit : null,
  };
}

/* ------------------------------------------------------------------ */
/* resumen de un vistazo, para la cabecera                            */
/* ------------------------------------------------------------------ */

export interface ResumenCuota {
  /** cuánto queda, 0-100 */
  pct: number;
  /** qué ventana es la más apretada («requests», «tokens»…) */
  cubo: string;
}

/**
 * La ventana MÁS APRETADA de un proveedor, para enseñarla en la cabecera.
 *
 * Solo mira las ventanas MEDIDAS, las que el proveedor manda en sus cabeceras.
 * Lo consultado (OpenRouter) se queda fuera a propósito: es un saldo de la
 * clave, no un límite de tasa, y mezclarlos daría un porcentaje que no
 * significa lo mismo según el proveedor. Sin ventanas medidas devuelve null y
 * la cabecera no enseña nada — que es la única respuesta honesta cuando no hay
 * dato.
 *
 * Se elige la más apretada porque es la que te va a cortar: si te quedan 900
 * peticiones pero 2 de tokens, tu problema son los tokens.
 */
export function resumenCuota(q: ProviderQuota | undefined): ResumenCuota | null {
  if (!q?.windows) return null;
  let peor: ResumenCuota | null = null;
  for (const [cubo, w] of Object.entries(q.windows)) {
    if (!w || w.limit <= 0) continue;
    const pct = Math.max(0, Math.min(100, Math.round((w.remaining / w.limit) * 100)));
    if (!peor || pct < peor.pct) peor = { pct, cubo };
  }
  return peor;
}

/** Color del chip: verde con holgura, ámbar justo, rojo agotándose. */
export function tonoCuota(pct: number): "ok" | "justo" | "critico" {
  if (pct <= 10) return "critico";
  if (pct <= 30) return "justo";
  return "ok";
}
