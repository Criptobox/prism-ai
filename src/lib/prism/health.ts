"use client";
/** Prism AI — Salud de modelos: circuit breaker ligero + LKGP (inspirado en OmniRoute).
 *
 * Cuatro ideas tomadas del router y adaptadas al navegador:
 *  1. Cooldown por modelo: tras un 429/5xx el modelo se «enfría» unos segundos y el
 *     failover/Auto lo saltan automáticamente (Retry-After se respeta si llega).
 *  2. Backoff exponencial: cada fallo consecutivo duplica el enfriamiento (con tope).
 *  3. LKGP (Last-Known-Good Path): se recuerda el último modelo que respondió bien
 *     y Auto lo pone el primero de la cadena.
 *  4. Cooldown POR PROVEEDOR cuando el corte es de cuota (429/402): las cuotas
 *     gratuitas son casi siempre por proveedor. Si Groq te corta, te corta con
 *     TODOS sus modelos: sin esto, el failover iba dando tumbos de modelo en
 *     modelo dentro del proveedor agotado, gastando reintentos y 429 adicionales.
 *     Un éxito de cualquier modelo del proveedor levanta el enfriamiento.
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
  /** enfriamiento a nivel de proveedor (cuota): la clave es el providerId */
  providerEntries: Record<string, HealthEntry>;
  lastGood: { key: string; at: number } | null;
  recordSuccess: (modelKey: string) => void;
  recordFailure: (modelKey: string, status: number, retryAfterMs?: number) => void;
  /** fallo de cuota del PROVEEDOR entero (429/402), con su propio backoff */
  recordProviderFailure: (
    providerId: string,
    status: number,
    retryAfterMs?: number
  ) => void;
  /** un éxito de cualquier modelo del proveedor levanta su enfriamiento */
  recordProviderSuccess: (providerId: string) => void;
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

/** Estados que delatan cuota de PROVEEDOR agotada (429 límite, 402 saldo) */
export function esFalloDeCuota(status: number): boolean {
  return status === 429 || status === 402;
}

export const useHealth = create<HealthState>()(
  persist(
    (set, get) => ({
      entries: {},
      providerEntries: {},
      lastGood: null,

      recordSuccess: (modelKey) =>
        set((st) => {
          const { [modelKey]: _drop, ...rest } = st.entries;
          // el proveedor del modelo exitoso dejó de estar agotado: se levanta su enfriamiento
          const pid = modelKey.slice(0, modelKey.indexOf("::"));
          const { [pid]: _dropP, ...restP } = st.providerEntries;
          const providerEntries =
            pid && _dropP ? restP : st.providerEntries;
          return { entries: rest, providerEntries, lastGood: { key: modelKey, at: Date.now() } };
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
            // un 429/402 también apunta al proveedor: las cuotas gratis son suyas
            ...(esFalloDeCuota(status)
              ? { providerEntries: escalarAProveedor(st.providerEntries, modelKey, status, retryAfterMs) }
              : {}),
          };
        }),

      recordProviderFailure: (providerId, status, retryAfterMs) =>
        set((st) => ({
          providerEntries: escalarAProveedor(st.providerEntries, `${providerId}::`, status, retryAfterMs),
        })),

      recordProviderSuccess: (providerId) =>
        set((st) => {
          const { [providerId]: _drop, ...rest } = st.providerEntries;
          return _drop ? { providerEntries: rest } : {};
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
          const pOut: Record<string, HealthEntry> = {};
          for (const [k, e] of Object.entries(st.providerEntries)) {
            if (e.until > now) pOut[k] = e;
            else changed = true;
          }
          return changed ? { entries: out, providerEntries: pOut } : {};
        }),

      clearAll: () => set({ entries: {}, providerEntries: {}, lastGood: null }),
    }),
    {
      name: "prism-health-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (st) => ({
        entries: st.entries,
        providerEntries: st.providerEntries,
        lastGood: st.lastGood,
      }),
    }
  )
);

/** Marca o agrava el enfriamiento del proveedor sacado de un modelKey `pid::mid`. */
function escalarAProveedor(
  prev: Record<string, HealthEntry>,
  modelKey: string,
  status: number,
  retryAfterMs?: number
): Record<string, HealthEntry> {
  const pid = modelKey.slice(0, modelKey.indexOf("::"));
  if (!pid) return prev;
  const e = prev[pid];
  const consecutive = (e?.consecutive ?? 0) + 1;
  let base = status === 402 ? 5 * 60_000 : 60_000; // 402 = saldo agotado: más largo
  if (status === 429 && retryAfterMs && retryAfterMs > base) base = retryAfterMs;
  const backoff = Math.min(CAP_MS, base * Math.pow(2, consecutive - 1));
  return {
    ...prev,
    [pid]: {
      until: Date.now() + backoff,
      consecutive,
      lastStatus: status,
      reason: status === 402 ? "cuota del proveedor agotada" : "cuota del proveedor",
    },
  };
}

/** ¿Está este modelo en cooldown? Devuelve los ms restantes (0 = disponible). */
export function cooldownRemaining(entry: HealthEntry | undefined, now = Date.now()): number {
  if (!entry?.until) return 0;
  return Math.max(0, entry.until - now);
}

/** ¿Está el PROVEEDOR entero enfriándose por cuota? (ms restantes, 0 = libre) */
export function providerCooldownRemaining(
  entry: HealthEntry | undefined,
  now = Date.now()
): number {
  return cooldownRemaining(entry, now);
}

/** Predicado listo para las cadenas Auto/failover: bloquea si el modelo O su
 * proveedor están enfriándose. Es la que evita dar tumbos dentro del proveedor
 * agotado. */
export function isBlockedProviderAware(
  entries: Record<string, HealthEntry>,
  providerEntries: Record<string, HealthEntry>,
  providerId: string,
  modelId: string,
  makeKey: (p: string, m: string) => string,
  now = Date.now()
): boolean {
  if (cooldownRemaining(entries[makeKey(providerId, modelId)], now) > 0) return true;
  return providerCooldownRemaining(providerEntries[providerId], now) > 0;
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
