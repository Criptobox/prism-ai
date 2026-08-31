/** Prism AI — Los fallos que salen cuando TÚ usas la página generada.
 *
 * El barrido automático (v3.29) pulsa botones a ciegas, en el orden del DOM y
 * sin escribir en los campos. Sirve para lo evidente, pero tiene tres límites
 * que solo el uso real resuelve: **tu orden**, **tus datos** y **los enlaces
 * que tú eliges**.
 *
 * Y hasta ahora eso no se recogía: la vista previa en vivo no llevaba el
 * puente de consola, así que un error al pulsar moría dentro del iframe sin
 * que se enterara nadie.
 *
 * Aquí se decide qué se guarda de esos errores y cómo se le cuenta al modelo.
 * Puro, sin React.
 */
import { esErrorDelEntorno } from "./auto-revision";

/** Cuántos errores distintos se recuerdan. Más no aporta: si una página tiene
 * ocho fallos distintos, lo que hace falta es rehacerla, no una lista. */
export const MAX_ERRORES_VIVOS = 5;

export interface ErrorEnVivo {
  texto: string;
  /** qué tocaste justo antes, si se supo */
  gesto?: string;
  /** cuántas veces ha salido este mismo error */
  veces: number;
  cuando: number;
}

/**
 * Añade un error a la lista.
 *
 * Dos reglas:
 *  · Los del entorno no entran. La vista previa corre sin `allow-same-origin`,
 *    así que `localStorage` lanza `SecurityError` ahí dentro — y una página
 *    generada lo usa constantemente. Sin este filtro, avisaríamos de un fallo
 *    que no existe cada vez que alguien guarda algo.
 *  · El mismo error repetido SUBE el contador, no añade una línea. Un fallo
 *    dentro de un bucle o de un `mousemove` llenaría la lista en un segundo.
 */
export function registrarError(
  lista: ErrorEnVivo[],
  texto: string,
  gesto?: string,
  ahora = Date.now()
): ErrorEnVivo[] {
  const limpio = texto.trim();
  if (!limpio || esErrorDelEntorno(limpio)) return lista;
  const i = lista.findIndex((e) => e.texto === limpio);
  if (i >= 0) {
    const copia = [...lista];
    // el gesto se actualiza: interesa el ÚLTIMO camino que lo provocó
    copia[i] = { ...copia[i], veces: copia[i].veces + 1, gesto: gesto ?? copia[i].gesto, cuando: ahora };
    return copia;
  }
  if (lista.length >= MAX_ERRORES_VIVOS) return lista;
  return [...lista, { texto: limpio, gesto, veces: 1, cuando: ahora }];
}

/** Frase del aviso. Con el gesto delante cuando se sabe: «al pulsar Guardar»
 *  dice dónde mirar, un error suelto no. */
export function resumenErroresVivos(lista: ErrorEnVivo[]): string {
  if (!lista.length) return "";
  if (lista.length === 1) {
    const e = lista[0];
    const veces = e.veces > 1 ? ` (×${e.veces})` : "";
    return e.gesto ? `Error al pulsar «${e.gesto}»${veces}` : `Error al usarla${veces}`;
  }
  return `${lista.length} errores al usarla`;
}

/** Lo que se le manda al modelo. Va el error tal cual y lo que se estaba
 *  haciendo: el modelo necesita saber por dónde entrar. */
export function promptDeErroresVivos(lista: ErrorEnVivo[], entry: string): string {
  const detalle = lista
    .map((e) => {
      const donde = e.gesto ? ` (al pulsar «${e.gesto}»)` : "";
      const veces = e.veces > 1 ? ` ×${e.veces}` : "";
      return `- ${e.texto}${donde}${veces}`;
    })
    .join("\n");
  return `He estado usando la página que hiciste y ha dado ${
    lista.length === 1 ? "este error" : "estos errores"
  }:

${detalle}

Arréglalo y vuelve a entregar **${entry} completo** (y los demás archivos que toques). No expliques el error: corrígelo.`;
}
