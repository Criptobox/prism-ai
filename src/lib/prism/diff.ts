/** Prism AI — Diff por líneas, sin dependencias.
 *
 * Antes de exportar un ZIP o de subir a GitHub conviene ver QUÉ has cambiado,
 * no solo cuántos archivos. Esto produce el diff unificado de siempre —
 * contexto, «+» y «−»— calculado en el navegador.
 *
 * El algoritmo es el de Myers en su forma sencilla: se recortan el prefijo y el
 * sufijo comunes (que en un archivo editado es casi todo) y sobre lo que queda
 * se hace una LCS por programación dinámica. Con un tope de tamaño para no
 * bloquear la pestaña en un archivo generado de 20 000 líneas.
 */

export type DiffOp = "igual" | "mas" | "menos";

export interface DiffLine {
  op: DiffOp;
  /** número de línea en el original (1-based); null en las añadidas */
  antes: number | null;
  /** número de línea en el nuevo (1-based); null en las borradas */
  despues: number | null;
  text: string;
}

export interface DiffHunk {
  /** primera línea del bloque en el original y en el nuevo (1-based) */
  desdeAntes: number;
  desdeDespues: number;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  hunks: DiffHunk[];
  added: number;
  removed: number;
  /** true si el archivo es demasiado grande para diferenciarlo con detalle */
  tooBig: boolean;
  /** true si no hay ningún cambio */
  unchanged: boolean;
}

/** Por encima de esto no se calcula el diff detallado: solo el recuento. */
const MAX_LINES = 4000;
/** Líneas de contexto alrededor de cada cambio. */
const CONTEXT = 3;

function splitLines(s: string): string[] {
  // un salto final no cuenta como línea vacía extra
  const lines = s.split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** Subsecuencia común más larga entre dos listas de líneas. */
function lcsOps(a: string[], b: string[]): DiffOp[] {
  const n = a.length;
  const m = b.length;
  // tabla (n+1) x (m+1) de longitudes
  const tabla: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      tabla[i][j] =
        a[i] === b[j] ? tabla[i + 1][j + 1] + 1 : Math.max(tabla[i + 1][j], tabla[i][j + 1]);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push("igual");
      i++;
      j++;
    } else if (tabla[i + 1][j] >= tabla[i][j + 1]) {
      ops.push("menos");
      i++;
    } else {
      ops.push("mas");
      j++;
    }
  }
  while (i < n) {
    ops.push("menos");
    i++;
  }
  while (j < m) {
    ops.push("mas");
    j++;
  }
  return ops;
}

/** Diff completo entre dos textos, línea a línea. */
export function diffLines(antes: string, despues: string): DiffLine[] {
  const a = splitLines(antes);
  const b = splitLines(despues);

  // prefijo y sufijo comunes: en una edición normal son casi todo el archivo
  let ini = 0;
  while (ini < a.length && ini < b.length && a[ini] === b[ini]) ini++;
  let fin = 0;
  while (
    fin < a.length - ini &&
    fin < b.length - ini &&
    a[a.length - 1 - fin] === b[b.length - 1 - fin]
  ) {
    fin++;
  }

  const medioA = a.slice(ini, a.length - fin);
  const medioB = b.slice(ini, b.length - fin);
  const ops = lcsOps(medioA, medioB);

  const out: DiffLine[] = [];
  let la = 1;
  let lb = 1;
  for (let k = 0; k < ini; k++) {
    out.push({ op: "igual", antes: la++, despues: lb++, text: a[k] });
  }
  let ia = 0;
  let ib = 0;
  for (const op of ops) {
    if (op === "igual") {
      out.push({ op, antes: la++, despues: lb++, text: medioA[ia++] });
      ib++;
    } else if (op === "menos") {
      out.push({ op, antes: la++, despues: null, text: medioA[ia++] });
    } else {
      out.push({ op, antes: null, despues: lb++, text: medioB[ib++] });
    }
  }
  for (let k = a.length - fin; k < a.length; k++) {
    out.push({ op: "igual", antes: la++, despues: lb++, text: a[k] });
  }
  return out;
}

/** Agrupa las líneas en bloques con contexto, descartando lo que no cambió. */
export function toHunks(lines: DiffLine[], context = CONTEXT): DiffHunk[] {
  const interesante = lines.map((l) => l.op !== "igual");
  const conservar = lines.map((_, i) =>
    interesante.slice(Math.max(0, i - context), i + context + 1).some(Boolean)
  );

  const hunks: DiffHunk[] = [];
  let actual: DiffLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (conservar[i]) {
      actual.push(lines[i]);
    } else if (actual.length) {
      hunks.push(nuevoHunk(actual));
      actual = [];
    }
  }
  if (actual.length) hunks.push(nuevoHunk(actual));
  return hunks;
}

function nuevoHunk(lines: DiffLine[]): DiffHunk {
  const primeraAntes = lines.find((l) => l.antes !== null)?.antes ?? 1;
  const primeraDespues = lines.find((l) => l.despues !== null)?.despues ?? 1;
  return { desdeAntes: primeraAntes, desdeDespues: primeraDespues, lines };
}

/** Diff de un archivo, listo para pintar. */
export function fileDiff(path: string, antes: string, despues: string): FileDiff {
  if (antes === despues) {
    return { path, hunks: [], added: 0, removed: 0, tooBig: false, unchanged: true };
  }
  const na = splitLines(antes).length;
  const nb = splitLines(despues).length;
  if (na > MAX_LINES || nb > MAX_LINES) {
    return {
      path,
      hunks: [],
      added: Math.max(0, nb - na),
      removed: Math.max(0, na - nb),
      tooBig: true,
      unchanged: false,
    };
  }
  const lines = diffLines(antes, despues);
  return {
    path,
    hunks: toHunks(lines),
    added: lines.filter((l) => l.op === "mas").length,
    removed: lines.filter((l) => l.op === "menos").length,
    tooBig: false,
    unchanged: false,
  };
}

/** Un archivo que entra o sale del proyecto entero. */
export function wholeFileDiff(path: string, text: string, modo: "nuevo" | "borrado"): FileDiff {
  return modo === "nuevo" ? fileDiff(path, "", text) : fileDiff(path, text, "");
}
