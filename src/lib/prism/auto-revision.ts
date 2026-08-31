/** Prism AI — Que el agente pruebe su propio código.
 *
 * `PLAN-V4` §3: «Hoy el agente escribe código y te pregunta a ti si funciona.»
 * Se arregló a medias — el agente ejecuta el proyecto cuando el modelo soporta
 * `tools` y llama a `run_project`—, pero **la mayoría de los modelos gratis no
 * soportan `tools`**. Esos van por el camino XML, y ahí el agente seguía
 * entregando código sin comprobarlo. O sea: el arreglo llegaba justo a los
 * modelos para los que Prism NO existe.
 *
 * Aquí está la decisión de cuándo revisar y qué decirle al modelo. La
 * ejecución la hace `sandbox-runner` (necesita un iframe), y el cableado vive
 * en `chat-app`. Esto es puro y se prueba sin navegador.
 */
import type { RunOutcome } from "./tool-runner";
import { filesFromAnswer } from "./answer-files";
import { pickEntryPath } from "./sandbox";

/** Cuántas veces se le devuelven los errores. Dos rondas arreglan lo típico
 * (una variable mal escrita, un id que no existe); a la tercera el modelo
 * suele estar dando vueltas y solo gasta cuota. */
export const MAX_REVISIONES = 2;

export interface ProyectoRevisable {
  /** archivos listos para `runProjectInMemory` */
  files: Record<string, string>;
  /** el HTML por el que se entra */
  entry: string;
}

/**
 * ¿Hay aquí un proyecto que se pueda ejecutar?
 *
 * Solo se revisa lo que se puede ABRIR: hace falta un HTML de entrada. Un
 * fragmento de CSS o una función de Python sueltos no se ejecutan en un
 * iframe, y fingir que se revisan sería peor que no revisar.
 */
export function proyectoDeLaRespuesta(content: string): ProyectoRevisable | null {
  const archivos = filesFromAnswer(content);
  if (!archivos.length) return null;
  const entry = pickEntryPath(archivos.map((a) => a.path));
  if (!entry) return null;
  const files: Record<string, string> = {};
  for (const a of archivos) files[a.path] = a.text;
  return { files, entry };
}

/** ¿El resultado de la ejecución pide una corrección? */
export function hayQueCorregir(r: RunOutcome): boolean {
  // `ejecutado`, no `ok`: `ok` significa «sin errores», así que con `ok` esto
  // no habría corregido NUNCA — justo al revés de lo que hace falta.
  if (!r.ejecutado) return false; // no llegó a correr: no es culpa del modelo
  return r.errors > 0;
}

/**
 * Lo que se le manda al modelo con los errores de SU código.
 *
 * Se le da el error tal cual salió de la consola, no una interpretación
 * nuestra: es el dato, y el modelo sabe leerlo. Y se le pide el archivo
 * completo porque un parche suelto rompe la vista previa, que necesita un
 * documento entero.
 */
export function promptDeCorreccion(r: RunOutcome, entry: string): string {
  const errores = r.errorLines.slice(0, 4).map((l) => `- ${l}`).join("\n");
  const logs = r.logLines.length
    ? `\n\nLa consola también dijo:\n${r.logLines.slice(0, 4).map((l) => `- ${l}`).join("\n")}`
    : "";
  return `He ejecutado tu código en el navegador y ha dado ${r.errors} ${
    r.errors === 1 ? "error" : "errores"
  } de consola. Esto es lo que salió, tal cual:

${errores}${logs}

Corrígelo y vuelve a entregar **${entry} completo** (y los demás archivos que toques), dentro de su bloque de código. No expliques el error: arréglalo. Si un error no es tuyo —viene de un recurso externo que aquí no carga— dilo en una línea y sigue.`;
}

/** Frase corta para el aviso en pantalla. Sin números inventados: se dice lo
 *  que devolvió la ejecución. */
export function resumenRevision(r: RunOutcome): string {
  if (!r.ejecutado) return r.reason ?? "No se pudo ejecutar el proyecto.";
  if (r.errors > 0) {
    return `${r.errors} ${r.errors === 1 ? "error" : "errores"} de consola al ejecutarlo.`;
  }
  const qa = r.qaFindings ? ` · ${r.qaFindings} avisos de QA visual` : "";
  return `Ejecutado sin errores de consola${qa}.`;
}

/** Regla para la memoria de fallos. Solo se apunta lo VERIFICABLE: esto ha
 *  salido de ejecutar el código, no de una impresión. */
export function reglaDeFallo(r: RunOutcome): { titulo: string; regla: string } | null {
  if (!hayQueCorregir(r)) return null;
  const primero = r.errorLines[0]?.slice(0, 120) ?? "error de consola";
  return {
    titulo: `El código entregado dio ${r.errors} ${r.errors === 1 ? "error" : "errores"} al ejecutarlo: ${primero}`,
    regla:
      "Antes de entregar una página, repasa que los ids y selectores que usa el JavaScript existan en el HTML, y que no queden variables ni funciones sin definir.",
  };
}
