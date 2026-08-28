"use client";
/** Prism AI — Salud de modelos: circuit breaker ligero + LKGP (inspirado en OmniRoute).
 *
 * Tres ideas tomadas del router y adaptadas al navegador:
 *  1. Cooldown por modelo: tras un 429/5xx el modelo se «enfría» unos segundos y el
 *     failover/Auto lo saltan automáticamente (Retry-After se respeta si llega).
 *  2. Backoff exponencial: cada fallo consecutivo duplica el enfriamiento (con tope).
 *  3. LKGP (Last-Known-Good Path): se recuerda el último modelo que respondió bien
 *     y Auto lo pone el primero de la cadena.
 *
 * Persistencia propia (`prism-health-v1`) para no tocar el store principal ni la bóveda.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface HealthEntry {
  /** epoch ms hasta el que el modelo está en cooldown (0 = sin cooldown) */
  until: number;
  /** fallos consecutivos (para el backoff) */
  consecutive: number;
  /** último código HTTP visto (0 = red) */
  lastStatus: number;
  /** motivo corto para el badge */
  reason?: string;
}

interface HealthState {
  entries: Record<string, HealthEntry>;
  lastGood: { key: string; at: number } | null;
  recordSuccess: (modelKey: string) => void;
  recordFailure: (modelKey: string, status: number, retryAfterMs?: number) => void;
  /** limpia solo las entradas caducadas (housekeeping ligero) */
  prune: () => void;
  clearAll: () => void;
}

const CAP_MS = 15 * 60_000; // tope de enfriamiento: 15 min

/** Enfriamiento base según el tipo de fallo (ms) */
function baseCooldown(status: number): number {
  if (status === 429) return 60_000; // límite de peticiones
  if (status === 402) return 5 * 60_000; // cuota/saldo agotado
  if (status === 401 || status === 403) return 0; // clave inválida: no es transitorio
  if (status === 0) return 15_000; // red caída
  if (status >= 500 || status === 408) return 15_000; // proveedor caído
  return 5_000; // otro 4xx
}

export const useHealth = create<HealthState>()(
  persist(
    (set, get) => ({
      entries: {},
      lastGood: null,

      recordSuccess: (modelKey) =>
        set((st) => {
          const { [modelKey]: _drop, ...rest } = st.entries;
          return { entries: rest, lastGood: { key: modelKey, at: Date.now() } };
        }),

      recordFailure: (modelKey, status, retryAfterMs) =>
        set((st) => {
          const prev = st.entries[modelKey];
          const consecutive = (prev?.consecutive ?? 0) + 1;
          let base = baseCooldown(status);
          if (status === 429 && retryAfterMs && retryAfterMs > 0) {
            // Retry-After del proveedor manda en el primer enfriamiento
            base = Math.max(base, retryAfterMs);
          }
          if (base === 0) {
            // 401/403: marcamos el motivo pero sin cooldown (el usuario debe arreglar la clave)
            return {
              entries: {
                ...st.entries,
                [modelKey]: {
                  until: 0,
                  consecutive,
                  lastStatus: status,
                  reason: "clave inválida",
                },
              },
              lastGood: st.lastGood?.key === modelKey ? null : st.lastGood,
            };
          }
          const backoff = Math.min(CAP_MS, base * Math.pow(2, consecutive - 1));
          const reason =
            status === 429
              ? "límite de peticiones"
              : status === 402
                ? "cuota agotada"
                : status === 0
                  ? "sin conexión"
                  : status >= 500
                    ? "error del proveedor"
                    : `error ${status}`;
          return {
            entries: {
              ...st.entries,
              [modelKey]: {
                until: Date.now() + backoff,
                consecutive,
                lastStatus: status,
                reason,
              },
            },
          };
        }),

      prune: () =>
        set((st) => {
          const now = Date.now();
          const out: Record<string, HealthEntry> = {};
          let changed = false;
          for (const [k, e] of Object.entries(st.entries)) {
            if (e.until > now) out[k] = e;
            else changed = true;
          }
          return changed ? { entries: out } : {};
        }),

      clearAll: () => set({ entries: {}, lastGood: null }),
    }),
    {
      name: "prism-health-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (st) => ({ entries: st.entries, lastGood: st.lastGood }),
    }
  )
);

/** ¿Está este modelo en cooldown? Devuelve los ms restantes (0 = disponible). */
export function cooldownRemaining(entry: HealthEntry | undefined, now = Date.now()): number {
  if (!entry?.until) return 0;
  return Math.max(0, entry.until - now);
}

/** Extrae el código HTTP de un error (ProviderError o el formato «Proveedor 429: …») */
export function statusFromError(err: unknown): number {
  if (err && typeof err === "object" && "status" in err) {
    const s = (err as { status?: unknown }).status;
    if (typeof s === "number" && s > 0) return s;
  }
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const m = msg.match(/\b(\d{3})\b/);
  return m ? Number(m[1]) : 0;
}

/** Extrae Retry-After en ms si el error lo trae (cabecera del proveedor) */
export function retryAfterFromError(err: unknown): number | undefined {
  if (err && typeof err === "object" && "retryAfterMs" in err) {
    const v = (err as { retryAfterMs?: unknown }).retryAfterMs;
    if (typeof v === "number" && v > 0) return v;
  }
  return undefined;
}
