"use client";
/** Prism AI — Métricas locales de uso (analytics lite inspirado en OmniRoute).
 * Todo vive en tu navegador (`prism-usage-v1`): peticiones, OK/fallos, latencia
 * media y p95, volumen y ahorro de compresión por modelo. Nada sale del dispositivo.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { TaskKind } from "./task-router";

/** Lo que un modelo gastó en un TIPO de encargo.
 *
 * Se guarda desde la v3.48. Lo registrado antes sigue ahí, pero sin
 * clasificar: el panel lo cuenta aparte en vez de repartirlo a ojo. */
export interface UsoTarea {
  llamadas: number;
  ok: number;
  charsIn: number;
  charsOut: number;
  /** suma de ms de las respuestas correctas, para la media por encargo */
  totalMs: number;
}

export interface ModelUsage {
  requests: number;
  ok: number;
  fail: number;
  /** suma de duraciones de las respuestas OK (ms) */
  totalMs: number;
  /** últimas duraciones OK para el p95 (tope 40) */
  ms: number[];
  /** caracteres enviados como contexto (antes de comprimir) */
  charsIn: number;
  /** caracteres recibidos del modelo */
  charsOut: number;
  /** caracteres de contexto ahorrados por la compresión */
  savedChars: number;
  lastUsed: number;
  /** desglose por tipo de encargo; ausente en lo registrado antes de la v3.48 */
  porTarea?: Partial<Record<TaskKind, UsoTarea>>;
}

interface UsageState {
  byModel: Record<string, ModelUsage>;
  /** peticiones por día (YYYY-MM-DD), últimos 30 días */
  days: Record<string, number>;
  record: (ev: {
    modelKey: string;
    ok: boolean;
    ms?: number;
    charsIn?: number;
    charsOut?: number;
    savedChars?: number;
    /** tipo de encargo, para poder decir en QUÉ se te va el gasto */
    tarea?: TaskKind;
  }) => void;
  reset: () => void;
}

const MS_CAP = 40;
const MAX_MODELS = 80;

function dayKey(ts = Date.now()): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function emptyUsage(): ModelUsage {
  return {
    requests: 0,
    ok: 0,
    fail: 0,
    totalMs: 0,
    ms: [],
    charsIn: 0,
    charsOut: 0,
    savedChars: 0,
    lastUsed: 0,
  };
}

/** Suma una llamada al desglose por encargo, sin tocar el resto. */
function conTarea(
  previo: Partial<Record<TaskKind, UsoTarea>> | undefined,
  tarea: TaskKind | undefined,
  ok: boolean,
  ms: number | undefined,
  charsIn: number,
  charsOut: number
): Partial<Record<TaskKind, UsoTarea>> | undefined {
  if (!tarea) return previo;
  const cur = previo?.[tarea] ?? { llamadas: 0, ok: 0, charsIn: 0, charsOut: 0, totalMs: 0 };
  return {
    ...previo,
    [tarea]: {
      llamadas: cur.llamadas + 1,
      ok: cur.ok + (ok ? 1 : 0),
      charsIn: cur.charsIn + charsIn,
      charsOut: cur.charsOut + charsOut,
      totalMs: cur.totalMs + (ok && ms ? ms : 0),
    },
  };
}

export const useUsage = create<UsageState>()(
  persist(
    (set, get) => ({
      byModel: {},
      days: {},

      record: ({ modelKey, ok, ms, charsIn, charsOut, savedChars, tarea }) =>
        set((st) => {
          const cur = st.byModel[modelKey] ?? emptyUsage();
          const next: ModelUsage = {
            requests: cur.requests + 1,
            ok: cur.ok + (ok ? 1 : 0),
            fail: cur.fail + (ok ? 0 : 1),
            totalMs: cur.totalMs + (ok && ms ? ms : 0),
            ms: ok && ms ? [...cur.ms, ms].slice(-MS_CAP) : cur.ms,
            charsIn: cur.charsIn + (charsIn ?? 0),
            charsOut: cur.charsOut + (charsOut ?? 0),
            savedChars: cur.savedChars + (savedChars ?? 0),
            lastUsed: Date.now(),
            porTarea: conTarea(cur.porTarea, tarea, ok, ms, charsIn ?? 0, charsOut ?? 0),
          };
          const byModel = { ...st.byModel, [modelKey]: next };
          // housekeeping: si hay demasiados modelos, quita los más viejos sin actividad
          const keys = Object.keys(byModel);
          if (keys.length > MAX_MODELS) {
            keys
              .sort((a, b) => (byModel[a].lastUsed ?? 0) - (byModel[b].lastUsed ?? 0))
              .slice(0, keys.length - MAX_MODELS)
              .forEach((k) => delete byModel[k]);
          }
          const d = dayKey();
          const days = { ...st.days, [d]: (st.days[d] ?? 0) + 1 };
          // conserva solo 30 días
          const cutoff = dayKey(Date.now() - 30 * 86_400_000);
          for (const k of Object.keys(days)) if (k < cutoff) delete days[k];
          return { byModel, days };
        }),

      reset: () => set({ byModel: {}, days: {} }),
    }),
    {
      name: "prism-usage-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (st) => ({ byModel: st.byModel, days: st.days }),
    }
  )
);

/** Latencia media (ms) de las respuestas correctas */
export function avgMs(u: ModelUsage): number {
  return u.ok > 0 && u.totalMs > 0 ? Math.round(u.totalMs / u.ok) : 0;
}

/** Percentil 95 de latencia (aprox con las últimas 40 muestras) */
export function p95Ms(u: ModelUsage): number {
  if (u.ms.length === 0) return 0;
  const sorted = [...u.ms].sort((a, b) => a - b);
  const idx = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  return Math.round(sorted[idx]);
}

export function fmtMs(v: number): string {
  if (!v) return "—";
  return v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${v} ms`;
}

export function fmtChars(v: number): string {
  if (!v) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(v);
}
