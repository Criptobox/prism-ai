/** Prism AI — Pestañas de conversación (idea D2 del PLAN-V7): lógica pura.
 *
 * La UI vive en `convo-tabs.tsx`; aquí solo las decisiones, para poder
 * testearlas sin navegador:
 *
 *  - abrir una conversación la añade al final de las pestañas abiertas;
 *  - hay un tope (como un navegador: no infinitas);
 *  - cerrar la pestaña ACTIVA activa la vecina (la que cae en su hueco),
 *    cerrar una inactiva no cambia la activa.
 */

/** Tope de pestañas abiertas a la vez. Al abrir una más, se cae la más
 * vieja (la primera de la lista). 8 da margen de sobra para el uso real
 * sin comerse la barra en pantallas estrechas. */
export const MAX_TABS = 8;

/** Añade `id` a las pestañas abiertas si no está. Si ya está, no hace
 * nada (no reordena: la pestaña no se mueve al usarla, como en un
 * navegador). Con el tope lleno, se cae la más vieja. */
export function abrirTab(tabs: readonly string[], id: string): string[] {
  if (tabs.includes(id)) return [...tabs];
  if (tabs.length >= MAX_TABS) return [...tabs.slice(1), id];
  return [...tabs, id];
}

/** Cierra la pestaña `id` y decide cuál queda activa.
 *
 * `siguiente` solo cambia si cerraste la ACTIVA: entonces toma la
 * vecina que cae en su posición (a la derecha si la había, si no, la de
 * la izquierda). Si era la única pestaña, `siguiente` es null → el
 * lienzo vuelve al estado de bienvenida. Cerrar una inactiva devuelve
 * `siguiente: null` y el llamador no debe tocar la activa. */
export function cerrarTab(
  tabs: readonly string[],
  id: string,
  activoId: string | null
): { tabs: string[]; siguiente: string | null; cambioActivo: boolean } {
  const idx = tabs.indexOf(id);
  if (idx === -1) return { tabs: [...tabs], siguiente: null, cambioActivo: false };
  const resto = tabs.filter((t) => t !== id);
  if (activoId !== id) {
    return { tabs: resto, siguiente: null, cambioActivo: false };
  }
  const siguiente = resto[Math.min(idx, resto.length - 1)] ?? null;
  return { tabs: resto, siguiente, cambioActivo: true };
}
