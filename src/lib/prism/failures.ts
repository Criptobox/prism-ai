"use client";
/** Prism AI — Memoria de fallos: `{ intento, resultado, regla }` que el agente
 * consulta antes de actuar.
 *
 * La idea: de todo lo que falla en una sesión, lo que sirve para la próxima vez
 * es lo VERIFICABLE — la revisión del Sandbox detectó una clave incrustada, el
 * build se rompió, el trabajo quedó a medias, la página se sale a 320 px. Eso se
 * convierte en una REGLA corta que entra en el system prompt del agente.
 *
 * Dos condiciones para que no se convierta en veneno:
 *  · las entradas CADUCAN solas (14 días) — una regla que ya no aplica no debe
 *    seguir condicionando al modelo;
 *  · se pueden borrar DE UNA EN UNA — quien decide lo que enseña al agente es el
 *    usuario, no el historial.
 *
 * Persistencia propia (`prism-failures-v1`). Máx. 40 entradas (las más usadas
 * y recientes sobreviven).
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type FailureScope = "sandbox" | "agente" | "vista";

export interface FailureEntry {
  id: string;
  /** epoch ms del último fallo con esta regla */
  at: number;
  scope: FailureScope;
  /** qué pasó, en una línea (el «intento» y su «resultado») */
  resultado: string;
  /** la regla que el agente debe respetar la próxima vez */
  regla: string;
  nivel: "error" | "warn";
  /** cuántas veces se ha visto este patrón (la repetición pesa más) */
  usos: number;
  /** epoch ms en que caduca sola */
  expiresAt: number;
}

interface FailuresState {
  entries: FailureEntry[];
  /** registra un fallo; si la regla ya existe, sube «usos» y refresca fechas */
  record: (
    scope: FailureScope,
    resultado: string,
    regla: string,
    nivel?: "error" | "warn"
  ) => void;
  /** borra UNA entrada (el usuario manda) */
  remove: (id: string) => void;
  clearAll: () => void;
  /** elimina caducadas y recorta al tope (housekeeping ligero) */
  sweep: () => void;
}

const TTL_MS = 14 * 86_400_000; // 14 días
const MAX_ENTRIES = 40;

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useFailures = create<FailuresState>()(
  persist(
    (set) => ({
      entries: [],

      record: (scope, resultado, regla, nivel = "error") =>
        set((st) => {
          const limpia = regla.trim();
          if (!limpia) return {};
          const now = Date.now();
          const existente = st.entries.find((e) => e.regla === limpia);
          if (existente) {
            // mismo patrón otra vez: no duplica, acentúa
            return {
              entries: st.entries.map((e) =>
                e.id === existente.id
                  ? { ...e, at: now, usos: e.usos + 1, expiresAt: now + TTL_MS }
                  : e
              ),
            };
          }
          const entrada: FailureEntry = {
            id: newId(),
            at: now,
            scope,
            resultado: resultado.trim().slice(0, 240),
            regla: limpia.slice(0, 220),
            nivel,
            usos: 1,
            expiresAt: now + TTL_MS,
          };
          // entra nueva: si se supera el tope, caen las más viejas y menos usadas
          const next = [entrada, ...st.entries].sort(
            (a, b) => b.usos - a.usos || b.at - a.at
          );
          return { entries: next.slice(0, MAX_ENTRIES) };
        }),

      remove: (id) =>
        set((st) => ({ entries: st.entries.filter((e) => e.id !== id) })),

      clearAll: () => set({ entries: [] }),

      sweep: () =>
        set((st) => {
          const now = Date.now();
          const vivas = st.entries.filter((e) => e.expiresAt > now);
          return vivas.length === st.entries.length
            ? {}
            : { entries: vivas.slice(0, MAX_ENTRIES) };
        }),
    }),
    {
      name: "prism-failures-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (st) => ({ entries: st.entries }),
      onRehydrateStorage: () => (state) => {
        // al arrancar: fuera las caducadas (una memoria de errores que crece sin
        // límite acaba envenenando el contexto con reglas que ya no aplican)
        state?.sweep();
      },
    }
  )
);

/* ------------------------------------------------------------------ */
/* reglas (puro, testeable)                                           */
/* ------------------------------------------------------------------ */

/** Diagnóstico mínimo que failures.ts necesita de sandbox-review (evita el acoplamiento) */
export interface DiagnosticoLike {
  family: string;
  level: string;
  message: string;
}

const REGLAS_POR_FAMILIA: Record<string, string> = {
  secreto:
    "Nunca incrustes claves API, tokens ni contraseñas en el código entregado; usa marcadores para que cada usuario ponga la suya.",
  privado:
    "No incluyas archivos privados (.env, *.pem, credenciales) en el proyecto que se comparte o sube.",
  ref: "No referencies archivos locales (css, js, imágenes) que no existen en el proyecto: crea los recursos que enlazas o usa rutas correctas.",
  sintaxis:
    "Entrega HTML, CSS y JS sintácticamente válidos: cierra llaves, paréntesis y comprueba el JSON antes de dar el paso por terminado.",
  html: "Toda página debe declarar <!DOCTYPE html>, <meta charset=\"utf-8\"> y <meta name=\"viewport\">, y añadir alt a las imágenes.",
  riesgo:
    "Evita eval, innerHTML con datos sin escapar, enlaces http:// y sentencias debugger en el código entregado.",
  git: "No generes archivos demasiado grandes ni rutas problemáticas (colisiones de mayúsculas, caracteres prohibidos en Windows).",
  proyecto:
    "El proyecto debe tener punto de entrada claro (index.html) y, si se va a compartir, README y .gitignore.",
};

/**
 * De un diagnóstico de la revisión (solo ERRORES — lo verificable) saca la regla
 * aprendida. Devuelve null para avisos y para familias sin regla útil: apuntar
 * «el modelo dijo algo raro» sería ruido, no memoria.
 */
export function reglaFromDiagnostico(d: DiagnosticoLike): string | null {
  if (d.level !== "error") return null;
  return REGLAS_POR_FAMILIA[d.family] ?? null;
}

/**
 * Reglas activas para el system prompt: caducadas fuera, deduplicadas, las más
 * usadas y recientes primero.
 */
export function reglasActivas(entries: FailureEntry[], now = Date.now()): string[] {
  const vivas = entries.filter((e) => e.expiresAt > now);
  const orden = [...vivas].sort((a, b) => b.usos - a.usos || b.at - a.at);
  const vistas = new Set<string>();
  const out: string[] = [];
  for (const e of orden) {
    if (vistas.has(e.regla)) continue;
    vistas.add(e.regla);
    out.push(e.regla);
  }
  return out;
}

/** Bloque para el system prompt del agente. Vacío si no hay reglas: no gasta tokens. */
export function renderReglasPrompt(reglas: string[], max = 8): string {
  const lista = reglas.slice(0, max);
  if (!lista.length) return "";
  return [
    "## Memoria de fallos — reglas aprendidas de errores reales",
    "En intentos anteriores se verificaron estos fallos. NO los repitas:",
    ...lista.map((r, i) => `${i + 1}. ${r}`),
    "Si una regla no aplica a esta tarea concreta, ignórala con juicio.",
  ].join("\n");
}

/** «caduca en 13 d» para la lista del panel */
export function caducaEn(expiresAt: number, now = Date.now()): string {
  const ms = expiresAt - now;
  if (ms <= 0) return "caducada";
  const d = Math.round(ms / 86_400_000);
  if (d >= 1) return `caduca en ${d} d`;
  const h = Math.round(ms / 3_600_000);
  if (h >= 1) return `caduca en ${h} h`;
  return `caduca en ${Math.max(1, Math.round(ms / 60_000))} min`;
}
