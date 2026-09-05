/** Prism AI — Store de la Caza de ofertas (zustand + localStorage).
 *
 * Vive en SU propia clave (`prism-ofertas-v1`) y no dentro del store
 * principal, por la misma razón que `prism-repaso-v1` y `prism-usage-v1`:
 * si algo sale mal aquí, las conversaciones y las claves no se enteran
 * (regla 3.6 del contrato: cuando persist falla, no se guarda nada y falla
 * en silencio — cuantos menos datos en el mismo saco, menos se pierde).
 *
 * Qué recuerda entre visitas:
 * - favoritas: las estrellas, para el filtro y para priorizar avisos.
 * - conocidasIds: ids ya vistos en una comprobación — es la línea base del
 *   diff que decide qué es «nuevo».
 * - avisadasIds: ids a punto de expirar que YA avisaron — sin esto, el aviso
 *   de «termina pronto» se repetiría cada día hasta que caducara.
 * - nuevasIds: novedades pendientes de ver — alimenta la insignia de la
 *   barra lateral y se vacía al abrir el diálogo.
 * - ofertasFeed: las ofertas validadas de la fuente propia, para no depender
 *   de que la URL siga viva en cada arranque.
 * - ajustes: avisos del navegador, margen de días y URL de la fuente.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Oferta } from "./ofertas";

interface AjustesOfertas {
  /** notificaciones del navegador, además del toast de la app */
  notificaciones: boolean;
  /** avisar cuando falten este número de días o menos */
  diasAviso: number;
  /** fuente JSON propia (opcional) */
  feedUrl: string;
}

interface OfertasState {
  favoritas: string[];
  conocidasIds: string[];
  nuevasIds: string[];
  avisadasIds: string[];
  ofertasFeed: Oferta[];
  ultimaComprobacion: string | null;
  ajustes: AjustesOfertas;

  alternarFavorita: (id: string) => void;
  /** Abrió el diálogo: la insignia de novedades se limpia. */
  marcarVistas: () => void;
  /** Guarda el resultado de una comprobación: nueva línea base, novedades
   * para la insignia y expiraciones ya avisadas. */
  registrarComprobacion: (r: { idsActuales: string[]; nuevas: string[]; porExpirar: string[]; hoy: string }) => void;
  /** Reemplaza las ofertas de la fuente propia tras validarlas. */
  guardarFeed: (ofertas: Oferta[]) => void;
  setAjustes: (parcial: Partial<AjustesOfertas>) => void;
}

function sinDuplicados(lista: readonly string[]): string[] {
  return [...new Set(lista)];
}

export const useOfertas = create<OfertasState>()(
  persist(
    (set) => ({
      favoritas: [],
      conocidasIds: [],
      nuevasIds: [],
      avisadasIds: [],
      ofertasFeed: [],
      ultimaComprobacion: null,
      ajustes: { notificaciones: false, diasAviso: 3, feedUrl: "" },

      alternarFavorita: (id) =>
        set((st) => ({
          favoritas: st.favoritas.includes(id)
            ? st.favoritas.filter((f) => f !== id)
            : [...st.favoritas, id],
        })),

      marcarVistas: () => set({ nuevasIds: [] }),

      registrarComprobacion: ({ idsActuales, nuevas, porExpirar, hoy }) =>
        set((st) => {
          const desconocidas = nuevas.filter((id) => !st.conocidasIds.includes(id));
          return {
            conocidasIds: sinDuplicados([...st.conocidasIds, ...idsActuales]),
            // las novedades se acumulan hasta que el diálogo las marque vistas
            nuevasIds: sinDuplicados([...st.nuevasIds, ...desconocidas]),
            avisadasIds: sinDuplicados([...st.avisadasIds, ...porExpirar]),
            ultimaComprobacion: hoy,
          };
        }),

      guardarFeed: (ofertas) => set({ ofertasFeed: ofertas }),

      setAjustes: (parcial) => set((st) => ({ ajustes: { ...st.ajustes, ...parcial } })),
    }),
    {
      name: "prism-ofertas-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (st) => ({
        favoritas: st.favoritas,
        conocidasIds: st.conocidasIds,
        nuevasIds: st.nuevasIds,
        avisadasIds: st.avisadasIds,
        ofertasFeed: st.ofertasFeed,
        ultimaComprobacion: st.ultimaComprobacion,
        ajustes: st.ajustes,
      }),
    }
  )
);
