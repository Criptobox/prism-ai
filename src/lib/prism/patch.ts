/** Prism AI — Edición por parches: bloques SEARCH/REPLACE que el modelo
 * devuelve y este lado aplica (Pilar 1 del plan de escalado).
 *
 * La causa #1 de fallos en cualquier agente de código es pedirle que
 * reescriba el archivo entero: alarga la salida, multiplica los tokens y
 * una sola alucinación a mitad de camino corrompe lo que ya funcionaba.
 * Un parche pequeño consume una fracción de la salida y, si no aplica
 * limpio, se reintenta con más contexto — no se reescribe nada.
 *
 * Formato elegido: bloques SEARCH/REPLACE (mismo criterio que Aider) por
 * ser más tolerantes a los errores del modelo que el diff unificado y más
 * fáciles de validar ANTES de aplicar:
 *
 *   <<<<<<< SEARCH
 *   [fragmento exacto del archivo original]
 *   =======
 *   [fragmento nuevo]
 *   >>>>>>> REPLACE
 *
 * Este módulo es puro: parsea, valida y aplica sobre strings. Ni React,
 * ni store, ni archivos reales. La tool `apply_patch` (tool-runner.ts) es
 * la que lo conecta con el proyecto del Sandbox.
 */

/** Un parche: qué buscar y con qué sustituirlo. */
export interface Parche {
  search: string;
  replace: string;
}

/** Un bloque tal como vino del texto del modelo, con su posición. Solo
 * hace falta para enseñarle al modelo DÓNDE se equivocó. */
export interface BloqueCrudo extends Parche {
  /** 1-indexado: nº de bloque en el orden en que llegó. */
  indice: number;
}

/** Fallo al aplicar un bloque, con el motivo legible por el modelo. */
export interface FalloParche {
  indice: number;
  motivo: string;
}

export interface ResultadoAplicado {
  ok: boolean;
  /** El archivo ya parcheado. Si `ok` es false, el original SIN tocar. */
  resultado: string;
  /** Bloques aplicados con éxito. */
  aplicados: number;
  /** Los que fallaron y por qué (para el reintento con más contexto). */
  fallos: FalloParche[];
}

const MARCA_SEARCH = "<<<<<<< SEARCH";
const MARCA_MID = "=======";
const MARCA_REPLACE = ">>>>>>> REPLACE";

/** ¿El texto contiene al menos un bloque SEARCH/REPLACE? Para decidir si
 * una respuesta del modelo es un parche o algo más, sin parsear en vano. */
export function pareceParche(texto: string): boolean {
  return texto.includes(MARCA_SEARCH) && texto.includes(MARCA_REPLACE);
}

/** Extrae los bloques SEARCH/REPLACE de un texto del modelo.
 *
 * Tolerante a las tres maneras en que los modelos se equivocan con el
 * formato sin que por eso el parche sea inservible:
 *   · marcadores con longitud variable de flechas (`<<<<<<<` o `<<<<<<<**`)
 *   · texto extra en la línea de cabecera («<<<<<<< SEARCH — botón»)
 *   · separador con más o menos `=`, siempre que sean ≥ 7 y la línea entera
 *
 * No se traga nada que pueda ser un bloque a medias: si abre SEARCH y no
 * cierra REPLACE, ese bloque no se devuelve (un parche parcial aplicado
 * a ciegas corrompe más de lo que arregla).
 */
export function parsearParches(texto: string): Parche[] {
  const out: Parche[] = [];
  if (!texto) return out;
  const lineas = texto.split("\n");

  const esSearch = (l: string) => /^<{7,}\s*SEARCH\b/.test(l);
  const esMid = (l: string) => /^={7,}\s*$/.test(l);
  const esReplace = (l: string) => /^>{7,}\s*REPLACE\b/.test(l);

  let search: string[] | null = null;
  let replace: string[] | null = null;

  for (const linea of lineas) {
    if (search === null) {
      if (esSearch(linea)) search = [];
      continue;
    }
    if (replace === null) {
      if (esSearch(linea)) {
        // SEARCH anidado: el bloque anterior quedó abierto y muerto.
        search = [];
        continue;
      }
      if (esMid(linea)) {
        replace = [];
        continue;
      }
      search.push(linea);
      continue;
    }
    if (esReplace(linea)) {
      out.push({ search: search.join("\n"), replace: replace.join("\n") });
      search = null;
      replace = null;
      continue;
    }
    replace.push(linea);
  }
  // Bloque abierto al terminar el texto: incompleto, se descarta entero.
  return out;
}

/** Quita la primera línea de un bloque si viene con la ruta del archivo
 * («index.html» solo en la primera línea del SEARCH). Algunos modelos la
 * añaden porque la usan los formatos de diff reales; aquí el `path` viaja
 * aparte, así que esa línea nunca casaría y el parche entero fallaría. */
export function limpiarParche(p: Parche): Parche {
  const limpiar = (s: string): string => {
    const lineas = s.split("\n");
    const primera = lineas[0]?.trim() ?? "";
    if (
      lineas.length > 1 &&
      primera &&
      !primera.includes(" ") &&
      (/\.(html?|css|js|jsx|ts|tsx|json|md|svg|txt|py|mjs|cjs)$/i.test(primera) ||
        primera.startsWith("./") ||
        primera.startsWith("/"))
    ) {
      lineas.shift();
    }
    return lineas.join("\n");
  };
  return { search: limpiar(p.search), replace: limpiar(p.replace) };
}

/** Cuenta cuántas veces aparece `aguja` en `pajar`. Igual que en
 * tool-runner: literal, sin regex (el fragmento es texto, no patrón). */
function contar(pajar: string, aguja: string): number {
  if (!aguja) return 0;
  let n = 0;
  let i = pajar.indexOf(aguja);
  while (i !== -1) {
    n++;
    i = pajar.indexOf(aguja, i + aguja.length);
  }
  return n;
}

/** Coincidencia flexible: casa ignorando la sangría al borde de línea.
 *
 * Único reintento permitido antes de pedir más contexto. El modelo acierta
 * el contenido pero a veces reproduce el bloque con otra indentación (tab
 * vs. espacios, o le sobra un nivel). Normalizar ambos lados a "sin sangría
 * en el borde" lo salva sin abrir la puerta a falsos positivos graves. */
function coincidenciaFlexible(actual: string, search: string): string | null {
  const lineasActual = actual.split("\n");
  const patron = search
    .split("\n")
    .map((l) => l.trim())
    .filter((l, i, arr) => !(l === "" && (i === 0 || i === arr.length - 1)));
  if (!patron.length) return null;

  const normaliza = (l: string) => l.trim();
  for (let i = 0; i <= lineasActual.length - patron.length; i++) {
    let j = 0;
    while (j < patron.length && normaliza(lineasActual[i + j]) === patron[j]) j++;
    if (j === patron.length) {
      // found: sustituye esas líneas conservando la sangría real de la
      // PRIMERA línea del original (así el reemplazo hereda el estilo local)
      const sangria = lineasActual[i].match(/^\s*/)?.[0] ?? "";
      const cuerpoReemplazo = search.split("\n");
      // la primera línea del reemplazo hereda la sangría del original; el
      // resto se respeta tal cual el modelo lo escribió
      cuerpoReemplazo[0] = sangria + cuerpoReemplazo[0].trim();
      return [
        ...lineasActual.slice(0, i),
        ...cuerpoReemplazo,
        ...lineasActual.slice(i + patron.length),
      ].join("\n");
    }
  }
  return null;
}

/** Aplica una lista de parches sobre el contenido de UN archivo.
 *
 * Reglas:
 *   · Los bloques se aplican EN ORDEN, cada uno sobre el resultado del
 *     anterior (dos parches que tocan lo mismo funcionan como espera el
 *     modelo que los escribió).
 *   · Un bloque cuyo `search` aparece más de una vez falla a propósito:
 *     no se adivina cuál era. (Equivale a la regla de `edit_file`.)
 *   · Si falla el exacto, UN reintento flexible por sangría. Si también
 *     falla, se anota el fallo y se sigue con los demás — mejor entregar
 *     los que aplican limpio y decir los que no, que descartar todo.
 *   · Si ALGUNO falla, `ok` es false y el modelo recibe el porqué de cada
 *     uno: reintenta solo los rotos, con más contexto, no desde cero.
 */
export function aplicarParches(actual: string, parches: readonly Parche[]): ResultadoAplicado {
  let resultado = actual;
  let aplicados = 0;
  const fallos: FalloParche[] = [];

  parches.forEach((crudo, i) => {
    const p = limpiarParche(crudo);
    if (!p.search.trim()) {
      fallos.push({ indice: i + 1, motivo: "El bloque SEARCH está vacío." });
      return;
    }
    const veces = contar(resultado, p.search);
    if (veces === 1) {
      resultado = resultado.replace(p.search, p.replace);
      aplicados++;
      return;
    }
    if (veces > 1) {
      fallos.push({
        indice: i + 1,
        motivo: `El fragmento SEARCH aparece ${veces} veces. Usa un fragmento más largo que sea único.`,
      });
      return;
    }
    // 0 exactas: UN reintento flexible por sangría
    const flexible = coincidenciaFlexible(resultado, p.search);
    if (flexible !== null) {
      resultado = flexible;
      aplicados++;
      return;
    }
    fallos.push({
      indice: i + 1,
      motivo:
        "El fragmento SEARCH no está en el archivo (ni casando por sangría). El archivo puede haber cambiado: léelo de nuevo y copia el fragmento EXACTO.",
    });
  });

  return { ok: fallos.length === 0, resultado, aplicados, fallos };
}

/** El mensaje que se devuelve al modelo cuando algo falló. Le dice qué
 * aplicar, qué no y cómo arreglarlo sin reescribir el archivo entero. */
export function mensajeResultado(path: string, r: ResultadoAplicado, charsOriginales?: number): string {
  const largo = charsOriginales !== undefined
    ? ` El archivo pasa de ${charsOriginales} a ${r.resultado.length} caracteres.`
    : "";
  if (r.ok) {
    return `«${path}» parcheado: ${r.aplicados} bloque(s) aplicado(s).${largo}`;
  }
  const detalle = r.fallos
    .map((f) => `- Bloque ${f.indice}: ${f.motivo}`)
    .join("\n");
  return [
    `«${path}»: ${r.aplicados} bloque(s) aplicado(s), ${r.fallos.length} falló/fallaron:`,
    detalle,
    "NO reescribas el archivo entero: repite apply_patch SOLO con los bloques que fallaron, con el SEARCH copiado byte a byte del archivo actual.",
  ].join("\n");
}
