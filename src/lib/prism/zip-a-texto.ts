/** Prism AI — Un ZIP entero, leído y puesto en el prompt.
 *
 * «Sube un zip y que lea todo lo de dentro» choca con la realidad del
 * producto: los modelos gratis de aquí tienen 8k de contexto y un proyecto
 * cualquiera pasa del millón de caracteres. Mandarlo entero no es generoso,
 * es que la petición falla.
 *
 * Así que se prioriza y **se dice lo que quedó fuera**. Un resumen que oculta
 * lo que no cupo es peor que uno corto: el modelo opina sobre un proyecto que
 * no ha visto y tú no sabes por qué se equivoca.
 *
 * El orden de la salida no es estético:
 *   1. El ÍNDICE de todo lo que hay dentro, con su tamaño. Completo siempre,
 *      aunque el contenido no quepa: el modelo debe saber la forma del
 *      proyecto aunque no haya leído cada archivo.
 *   2. El contenido de lo que cabe.
 *   3. Qué se quedó fuera y por qué.
 *
 * Nada de esto sale del dispositivo: el ZIP se abre en el navegador con el
 * mismo lector que usa el Sandbox.
 */

/** Techo del texto que viaja al modelo. Con 8k de contexto esto ya es mucho;
 *  el resto del prompt (instrucciones, historial) también ocupa. */
export const MAX_CHARS_ZIP = 60_000;
/** Techo por archivo: un solo minificado no puede comerse el presupuesto. */
export const MAX_CHARS_ARCHIVO = 12_000;

/** Un archivo del ZIP ya leído. `text: null` = no es texto (imagen, fuente…). */
export interface EntradaZip {
  path: string;
  size: number;
  text: string | null;
}

export interface ResumenZip {
  /** lo que se le manda al modelo */
  texto: string;
  /** archivos cuyo contenido entró entero */
  incluidos: string[];
  /** entraron, pero cortados por el techo por archivo */
  recortados: string[];
  /** son texto, pero ya no cabían */
  fuera: string[];
  /** no son texto: solo se nombran */
  binarios: string[];
  /** ruido descartado antes de repartir (dependencias, lockfiles, minificados) */
  ruido: string[];
  chars: number;
}

/**
 * Lo que no aporta nada a una revisión y se come el presupuesto.
 *
 * `node_modules` es el caso claro: son megas de código de otros. Un lockfile
 * son miles de líneas generadas. Un `.min.js` es ilegible hasta para un modelo.
 */
export function esRuido(path: string): boolean {
  const p = path.toLowerCase();
  return (
    /(^|\/)(node_modules|\.git|dist|build|\.next|vendor|__pycache__|\.venv)\//.test(p) ||
    /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|composer\.lock|cargo\.lock)$/.test(p) ||
    /\.min\.(js|css)$/.test(p) ||
    /\.map$/.test(p)
  );
}

/** Tamaño legible, para el índice. */
function tam(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Orden en el que se reparte el presupuesto.
 *
 * Primero lo que describe el proyecto (README, package.json, index), luego lo
 * menos hondo, y a igualdad, alfabético para que sea estable. Un archivo
 * enorme no adelanta a tres pequeños: se reparte por orden, no por tamaño.
 */
function prioridad(path: string): number {
  const nombre = path.split("/").pop()?.toLowerCase() ?? "";
  if (/^readme/.test(nombre)) return 0;
  if (/^(package\.json|pyproject\.toml|cargo\.toml|go\.mod|composer\.json)$/.test(nombre)) return 1;
  if (/^index\.(html?|js|ts|tsx|jsx|py)$/.test(nombre)) return 2;
  if (/^(main|app)\.(js|ts|tsx|jsx|py|go|rs|java)$/.test(nombre)) return 3;
  return 4;
}

/**
 * Convierte el contenido del ZIP en el texto que verá el modelo.
 *
 * `limite` y `limitePorArchivo` se pueden bajar (modo ahorro, contextos
 * pequeños) sin tocar nada más.
 */
export function zipATexto(
  nombreZip: string,
  entradas: EntradaZip[],
  limite = MAX_CHARS_ZIP,
  limitePorArchivo = MAX_CHARS_ARCHIVO
): ResumenZip {
  const utiles = entradas.filter((e) => !esRuido(e.path));
  const ruido = entradas.filter((e) => esRuido(e.path)).map((e) => e.path);
  const binarios = utiles.filter((e) => e.text === null).map((e) => e.path);
  const textos = utiles
    .filter((e): e is EntradaZip & { text: string } => e.text !== null)
    .sort(
      (a, b) =>
        prioridad(a.path) - prioridad(b.path) ||
        a.path.split("/").length - b.path.split("/").length ||
        a.path.localeCompare(b.path)
    );

  // 1. El índice va SIEMPRE entero: es la forma del proyecto
  const indice = entradas
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((e) => `- ${e.path} (${tam(e.size)})`)
    .join("\n");

  const partes: string[] = [
    `[Contenido de ${nombreZip}: ${entradas.length} archivo${entradas.length === 1 ? "" : "s"}]`,
    "",
    "## Índice completo",
    indice,
  ];

  const incluidos: string[] = [];
  const recortados: string[] = [];
  const fuera: string[] = [];
  let gastado = partes.join("\n").length;

  for (const e of textos) {
    const cabecera = `\n\n## ${e.path}\n\`\`\`\n`;
    const cierre = "\n```";
    const disponible = limite - gastado - cabecera.length - cierre.length;
    if (disponible <= 200) {
      // menos de eso no da ni para entender el archivo: mejor nombrarlo fuera
      fuera.push(e.path);
      continue;
    }
    const tope = Math.min(limitePorArchivo, disponible);
    const cortado = e.text.length > tope;
    const cuerpo = cortado
      ? `${e.text.slice(0, tope)}\n… [recortado: ${e.text.length - tope} caracteres más]`
      : e.text;
    partes.push(`${cabecera}${cuerpo}${cierre}`);
    gastado += cabecera.length + cuerpo.length + cierre.length;
    (cortado ? recortados : incluidos).push(e.path);
  }

  // 3. Lo que NO viajó, dicho con todas las letras
  const avisos: string[] = [];
  if (recortados.length) {
    avisos.push(`Recortados por tamaño: ${recortados.join(", ")}.`);
  }
  if (fuera.length) {
    avisos.push(
      `NO se ha incluido el contenido de ${fuera.length} archivo(s) de texto por falta de espacio: ${fuera.join(", ")}. Pídelos por su nombre si los necesitas.`
    );
  }
  if (binarios.length) {
    avisos.push(`Archivos no legibles como texto (${binarios.length}): ${binarios.join(", ")}.`);
  }
  if (ruido.length) {
    avisos.push(
      `Omitidos por ser dependencias, lockfiles o minificados (${ruido.length}): no aportan a una revisión.`
    );
  }
  if (avisos.length) partes.push("\n\n## Lo que NO viaja en este mensaje\n" + avisos.join("\n"));

  const texto = partes.join("\n");
  return { texto, incluidos, recortados, fuera, binarios, ruido, chars: texto.length };
}

/** Frase corta para el aviso de la interfaz. */
export function resumenZip(r: ResumenZip): string {
  const partes = [`${r.incluidos.length + r.recortados.length} archivo(s) leídos`];
  if (r.recortados.length) partes.push(`${r.recortados.length} recortado(s)`);
  if (r.fuera.length) partes.push(`${r.fuera.length} sin espacio`);
  if (r.binarios.length) partes.push(`${r.binarios.length} no son texto`);
  return partes.join(" · ");
}
