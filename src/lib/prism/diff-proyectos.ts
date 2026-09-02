/** Prism AI — Comparar dos estados del proyecto (tool `snapshot_diff`).
 *
 * El agente edita, escribe y restaura archivos durante una conversación, y al
 * final dice «listo». Para saber QUÉ tocó había que abrir la pestaña Cambios
 * del Sandbox a mano. Esto lo pone del lado del modelo: dos mapas de archivos
 * entran, un recuento honesto sale.
 *
 * Aquí NO hay git, y por eso la herramienta no se llama `diff_with_main` ni
 * acepta shas ni ramas: en Prism los puntos de restauración son los snapshots
 * de `snapshots.ts` (s1, s2…), guardados en el dispositivo. Prometer `main` o
 * `head~1` sería prometer algo que no existe.
 *
 * Puro: la aritmética de líneas la pone `diff.ts`, aquí solo se recorren los
 * dos mapas y se ordena el resultado.
 */
import { fileDiff, type FileDiff } from "./diff";

/** Archivos que se detallan en el resumen. Un proyecto grande puede tocar
 * cuarenta; con los que más cambian el modelo ya sabe por dónde van los tiros. */
export const MAX_ARCHIVOS_RESUMEN = 12;

export interface CambioArchivo {
  path: string;
  estado: "nuevo" | "borrado" | "modificado";
  added: number;
  removed: number;
  /** true si el archivo era demasiado grande para diferenciarlo en detalle */
  tooBig: boolean;
}

export interface DiffProyectos {
  /** solo los que cambiaron, ordenados por volumen de cambio (desc) */
  cambios: CambioArchivo[];
  nuevos: number;
  borrados: number;
  modificados: number;
  /** archivos presentes en los dos lados y con el mismo contenido */
  iguales: number;
  totalAdded: number;
  totalRemoved: number;
}

function contar(path: string, antes: string | undefined, despues: string | undefined): CambioArchivo | null {
  // Mismo contenido en los dos lados: no hay nada que contar.
  if (antes === despues) return null;
  const estado: CambioArchivo["estado"] =
    antes === undefined ? "nuevo" : despues === undefined ? "borrado" : "modificado";
  // Archivo nuevo o borrado: todas sus líneas son añadidas o quitadas, que es
  // justo lo que da `fileDiff` contra la cadena vacía. No hace falta un
  // camino aparte.
  const d: FileDiff = fileDiff(path, antes ?? "", despues ?? "");
  // Un archivo VACÍO que aparece o desaparece sale de `fileDiff` como
  // «sin cambios» (0 líneas contra 0 líneas). Aparecer o desaparecer sí es un
  // cambio, aunque no mueva ni una línea: se reporta igual, con sus ceros.
  if (d.unchanged && estado === "modificado") return null;
  return { path, estado, added: d.added, removed: d.removed, tooBig: d.tooBig };
}

/** Compara dos estados del proyecto (`path → contenido`). Nunca lanza. */
export function compararProyectos(
  antes: Record<string, string>,
  despues: Record<string, string>
): DiffProyectos {
  const paths = [...new Set([...Object.keys(antes), ...Object.keys(despues)])].sort();
  const cambios: CambioArchivo[] = [];
  let iguales = 0;
  for (const path of paths) {
    const c = contar(path, antes[path], despues[path]);
    if (c) cambios.push(c);
    else iguales++;
  }
  // Ordenar por cuánto cambió cada archivo: el modelo lee de arriba abajo y
  // lo que más se movió es lo que más probablemente explica el resultado.
  cambios.sort((a, b) => b.added + b.removed - (a.added + a.removed) || a.path.localeCompare(b.path));
  return {
    cambios,
    nuevos: cambios.filter((c) => c.estado === "nuevo").length,
    borrados: cambios.filter((c) => c.estado === "borrado").length,
    modificados: cambios.filter((c) => c.estado === "modificado").length,
    iguales,
    totalAdded: cambios.reduce((n, c) => n + c.added, 0),
    totalRemoved: cambios.reduce((n, c) => n + c.removed, 0),
  };
}

const MARCA: Record<CambioArchivo["estado"], string> = {
  nuevo: "+",
  borrado: "−",
  modificado: "M",
};

/** El diff en texto, para dárselo al modelo.
 *
 * `etiquetaAntes` y `etiquetaDespues` describen QUÉ se está comparando (un
 * snapshot, el proyecto actual). Sin ellas el modelo lee números sin saber en
 * qué dirección van, y ha pasado que los cuente al revés.
 */
export function resumenProyectos(
  d: DiffProyectos,
  etiquetaAntes: string,
  etiquetaDespues: string
): string {
  const out: string[] = [`Comparando ${etiquetaAntes} → ${etiquetaDespues}.`];
  if (!d.cambios.length) {
    out.push(`Sin diferencias: los ${d.iguales} archivos son idénticos.`);
    return out.join("\n");
  }
  out.push(
    `${d.cambios.length} archivo(s) distinto(s): ${d.modificados} modificado(s), ${d.nuevos} nuevo(s), ${d.borrados} borrado(s). ${d.iguales} sin tocar.`,
    ""
  );
  for (const c of d.cambios.slice(0, MAX_ARCHIVOS_RESUMEN)) {
    const detalle = c.tooBig
      ? "demasiado grande para el detalle, solo recuento"
      : `+${c.added} −${c.removed}`;
    out.push(`${MARCA[c.estado]} ${c.path}  ${detalle}`);
  }
  if (d.cambios.length > MAX_ARCHIVOS_RESUMEN) {
    out.push(`…y ${d.cambios.length - MAX_ARCHIVOS_RESUMEN} archivo(s) más.`);
  }
  out.push("", `Total: +${d.totalAdded} −${d.totalRemoved} líneas.`);
  return out.join("\n");
}
