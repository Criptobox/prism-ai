/** Prism AI — Store del Modo Repaso (zustand + localStorage).
 *
 * Vive en SU propia clave (`prism-repaso-v1`) y no dentro del store principal:
 * es el mismo camino que `prism-usage-v1`. Si mañana las tarjetas crecen o
 * cambian de forma, el resto de la app no se entera y no hay migración que
 * pueda romper las conversaciones (regla 3.6 del contrato: cuando persist
 * falla, no se guarda nada y falla en silencio — cuantos menos datos en el
 * mismo saco, menos se pierde).
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Calificacion, PropuestaTarjeta, TarjetaRepaso } from "./repaso";
import { fechaHoy, programar } from "./repaso";

/** El generador de ids del store principal vive en `store.ts`, pero importarlo
 * desde aquí arrastraría todo el store (sesiones, providers, branches) a cada
 * lectura de tarjetas. Tres líneas copiadas pesan menos que ese acoplamiento. */
function uidRepaso(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** Tope de biblioteca: con SM-2 una tarjeta madura puede vivir años. Si
 * alguien llega aquí, borra lo que no repasa — el aviso está en el diálogo. */
const MAX_TARJETAS = 2000;

interface RepasoState {
  tarjetas: TarjetaRepaso[];
  /** Guarda propuestas nuevas. Los frentes ya existentes se saltan (no se
   * re-crean ni resetean): pedir tarjetas dos veces de la misma conversación
   * no debe borrar tu progreso. Devuelve cuántas entraron y cuántas se
   * saltaron, para el toast. */
  añadir: (propuestas: readonly PropuestaTarjeta[], origen?: string) => { guardadas: number; duplicadas: number };
  /** Aplica SM-2 con la calificación del usuario. */
  calificar: (id: string, q: Calificacion) => void;
  borrar: (id: string) => void;
  /** Reinicia el progreso de TODAS las tarjetas (no borra ninguna). */
  reiniciar: () => void;
}

function clave(frente: string): string {
  return frente.toLowerCase().replace(/\s+/g, " ").trim();
}

export const useRepaso = create<RepasoState>()(
  persist(
    (set) => ({
      tarjetas: [],

      añadir: (propuestas, origen) => {
        const hoy = fechaHoy();
        let guardadas = 0;
        let duplicadas = 0;
        set((st) => {
          const existentes = new Set(st.tarjetas.map((t) => clave(t.frente)));
          const nuevas: TarjetaRepaso[] = [];
          for (const p of propuestas) {
            if (existentes.has(clave(p.frente))) {
              duplicadas++;
              continue;
            }
            existentes.add(clave(p.frente));
            nuevas.push({
              id: uidRepaso(),
              frente: p.frente,
              dorso: p.dorso,
              repeticiones: 0,
              facilidad: 2.5, // el valor de partida del SM-2 original
              intervaloDias: 0,
              vencimiento: hoy, // las nuevas salen hoy mismo en la cola
              creada: Date.now(),
              origen,
            });
            guardadas++;
          }
          // Si alguien se pasa del tope, entran las nuevas y fuera las más viejas.
          const todas = [...st.tarjetas, ...nuevas];
          return { tarjetas: todas.slice(Math.max(0, todas.length - MAX_TARJETAS)) };
        });
        return { guardadas, duplicadas };
      },

      calificar: (id, q) =>
        set((st) => {
          const hoy = fechaHoy();
          return {
            tarjetas: st.tarjetas.map((t) =>
              t.id === id ? { ...t, ...programar(t, q, hoy) } : t
            ),
          };
        }),

      borrar: (id) => set((st) => ({ tarjetas: st.tarjetas.filter((t) => t.id !== id) })),

      reiniciar: () =>
        set((st) => ({
          tarjetas: st.tarjetas.map((t) => ({
            ...t,
            repeticiones: 0,
            facilidad: 2.5,
            intervaloDias: 0,
            vencimiento: fechaHoy(),
          })),
        })),
    }),
    {
      name: "prism-repaso-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (st) => ({ tarjetas: st.tarjetas }),
    }
  )
);
