/** Prism AI — Evidence Mode (plan técnico §5): cuando el modelo afirma
 * algo sobre el código del usuario, muestra la fuente (archivo + línea)
 * o admite que no hay evidencia suficiente.
 *
 * Dos mitades:
 *   1. Prompt: instrucción para que cite `archivo:línea` cuando el
 *      contexto se lo permita (viaja en el bloque del agente).
 *   2. Post-procesado: parsear las citas de la respuesta y renderizarlas
 *      como chips clicables que abren el archivo en el Sandbox.
 *
 * Si el modelo no puede citar evidencia sobre el repo, el prompt le pide
 * decirlo explícitamente — el aviso lo pinta la UI cuando toca.
 *
 * El parser es tolerante: caza `index.html:42`, `src/app.js:10-15`,
 * `` `styles.css`:12 `` y variantes con «línea 42 de index.html». Ignora
 * URLs (`http://a:8080`), horas (`12:30`) y frases con números sueltos.
 */

/** Una cita de evidencia detectada en una respuesta. */
export interface Cita {
  /** ruta del archivo, tal cual la escribió el modelo (normalizada) */
  path: string;
  /** línea inicial (1-indexada) */
  linea: number;
  /** línea final si cita un rango (10-15), si no = linea */
  hasta: number;
}

const RX_CITA =
  /`?([\w./-]+\.(?:html?|css|js|jsx|ts|tsx|json|md|svg|py|mjs|cjs))`?\s*:\s*(\d{1,5})(?:\s*[-–]\s*(\d{1,5}))?/g;
const RX_VERBAL =
  /(?:l[íi]nea\s+(\d{1,5})(?:\s*[-–a]\s*(\d{1,5}))?\s+(?:de|del archivo|en)\s+`?([\w./-]+\.(?:html?|css|js|jsx|ts|tsx|json|md|svg|py|mjs|cjs))`?)/gi;

/** Extrae las citas de un texto del modelo. Sin duplicados (mismo path +
 * misma línea), máximo 12 — un muro de chips no ayuda a nadie. */
export function citasDe(texto: string): Cita[] {
  if (!texto) return [];
  const out: Cita[] = [];
  const clave = (c: Cita) => `${c.path}:${c.linea}`;

  const push = (path: string, lineaS: string, hastaS?: string) => {
    const linea = Number(lineaS);
    if (!Number.isFinite(linea) || linea < 1 || linea > 99999) return;
    let hasta = hastaS ? Number(hastaS) : linea;
    if (!Number.isFinite(hasta) || hasta < linea) hasta = linea;
    // paths que empiezan por «/» se normalizan a relativos (los proyectos
    // del Sandbox son relativos)
    const p = path.replace(/^\.?\//, "");
    const c: Cita = { path: p, linea, hasta };
    if (!out.some((x) => clave(x) === clave(c))) out.push(c);
  };

  // filtrar URLs antes: `http://a:8080` no es una cita
  const limpio = texto.replace(/https?:\/\/[^\s`)]+/g, "");

  let m: RegExpExecArray | null;
  RX_CITA.lastIndex = 0;
  while ((m = RX_CITA.exec(limpio))) push(m[1], m[2], m[3]);
  RX_VERBAL.lastIndex = 0;
  while ((m = RX_VERBAL.exec(limpio))) push(m[3], m[1], m[2]);

  return out.slice(0, 12);
}

/** ¿Hay al menos una cita? (para pintar el chip de evidencia). */
export function tieneEvidencia(texto: string): boolean {
  return citasDe(texto).length > 0;
}

/** La instrucción que viaja al modelo (dentro del bloque del agente). */
export const INSTRUCCION_EVIDENCIA = [
  "## EVIDENCIA OBLIGATORIA sobre el código",
  "Cuando afirmes algo sobre archivos del proyecto del usuario, cita la fuente como «archivo:línea»",
  "(ej.: «el bug está en app.js:42» o «el estilo se define en styles.css:10-15»).",
  "Si no tienes el contenido del archivo a la vista y no puedes leerlo, dilo EXPLÍCITAMENTE:",
  "«No tengo evidencia suficiente en el repo para afirmar eso.» Está prohibido inventar líneas,",
  "nombres de funciones o contenido que no hayas leído.",
].join("\n");

/** El aviso cuando el modelo habla del repo SIN citar nada. La UI decide
 * si lo muestra (solo cuando la respuesta parece análisis de código). */
export const AVISO_SIN_EVIDENCIA =
  "Sin evidencia citada en el repo: verifica estas afirmaciones antes de actuar sobre ellas.";
