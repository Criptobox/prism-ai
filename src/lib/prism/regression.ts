/** Prism AI — Regresión visible: un antes y un después medidos.
 *
 * «Regression AI» no: comparar lo que YA se medía. Cada ejecución del Sandbox
 * deja una instantánea (errores de consola, avisos, hallazgos del QA móvil y
 * tamaño del HTML). Al volver a ejecutar tras un cambio, la comparación dice:
 *   · qué errores NUEVOS aparecieron (el cambio rompió algo)
 *   · qué errores DESAPARECIERON (el cambio los arregló)
 *   · qué pasó con el QA móvil a 320/390 px
 * y un veredicto en una línea. Si no hay datos de un lado, se dice — no se
 * inventa una comparación.
 *
 * Puro y testeable: la captura vive en sandbox-studio, aquí solo la matemática.
 */
import type { QAResult } from "./visual-qa";

export interface RunSnapshot {
  /** epoch ms de la ejecución */
  at: number;
  /** página ejecutada */
  entry: string;
  /** mensajes de consola en orden (nivel + texto) */
  logs: Array<{ level: string; text: string }>;
  /** medida de QA automática a ese ancho (null si el medidor no respondió) */
  qa: QAResult | null;
  /** tamaño del HTML servido (proxy de peso del proyecto) */
  htmlBytes: number;
}

export interface RegressionDiff {
  /** errores de consola que aparecieron en el después y no estaban en el antes */
  nuevos: string[];
  /** errores de consola que había en el antes y ya no están */
  arreglados: string[];
  /** avisos (warn) nuevos */
  avisosNuevos: string[];
  qa: {
    antes: QAResult | null;
    despues: QAResult | null;
    /** hallazgos que había antes y ya no están (mejora medida) */
    resueltos: string[];
    /** hallazgos nuevos (empeora medida) */
    regressed: string[];
  };
  html: { antes: number; despues: number };
  /** una línea honesta: «mejora», «empeora», «igual» o «sin datos suficientes» */
  veredicto: string;
  /** nivel para el color: ok | mal | igual | sin-datos */
  nivel: "ok" | "mal" | "igual" | "sin-datos";
}

function claveLog(l: { level: string; text: string }): string {
  return `${l.level}|${l.text.trim().slice(0, 200)}`;
}

/** Hallazgos legibles de una medida de QA (o [] si no respondió) */
function itemsQA(qa: QAResult | null): string[] {
  if (!qa || qa.noRespondio || qa.ok) return [];
  return qa.items.map((it) => `${it.tipo}: ${it.detalle.slice(0, 120)}`);
}

/** Compara dos ejecuciones del MISMO proyecto. Nunca lanza. */
export function compareRuns(before: RunSnapshot, after: RunSnapshot): RegressionDiff {
  const clavesAntes = new Set(before.logs.map(claveLog));
  const clavesDespues = new Set(after.logs.map(claveLog));

  const soloErrores = (claves: Set<string>) =>
    new Set([...claves].filter((k) => k.startsWith("error|")));
  const soloAvisos = (claves: Set<string>) =>
    new Set([...claves].filter((k) => k.startsWith("warn|")));

  const erroresAntes = soloErrores(clavesAntes);
  const erroresDespues = soloErrores(clavesDespues);
  const avisosAntes = soloAvisos(clavesAntes);

  const nuevos = [...erroresDespues].filter((k) => !erroresAntes.has(k)).map((k) => k.slice("error|".length));
  const arreglados = [...erroresAntes].filter((k) => !erroresDespues.has(k)).map((k) => k.slice("error|".length));
  const avisosNuevos = [...clavesDespues]
    .filter((k) => k.startsWith("warn|") && !avisosAntes.has(k))
    .map((k) => k.slice("warn|".length));

  // ——— QA móvil: comparar solo si los dos lados respondieron
  const itemsAntes = itemsQA(before.qa);
  const itemsDespues = itemsQA(after.qa);
  const setAntes = new Set(itemsAntes);
  const setDespues = new Set(itemsDespues);
  const qaResueltos = itemsAntes.filter((i) => !setDespues.has(i));
  const qaRegressed = itemsDespues.filter((i) => !setAntes.has(i));
  const qaComparable = before.qa != null && after.qa != null && !before.qa.noRespondio && !after.qa.noRespondio;

  // ——— veredicto
  let nivel: RegressionDiff["nivel"];
  let veredicto: string;
  if (nuevos.length) {
    nivel = "mal";
    veredicto = `El cambio rompió cosas: ${nuevos.length} error${nuevos.length === 1 ? "" : "es"} nuevo${nuevos.length === 1 ? "" : "s"} de consola.`;
  } else if (arreglados.length) {
    nivel = "ok";
    veredicto = `El cambio arregló ${arreglados.length} error${arreglados.length === 1 ? "" : "es"} y no rompió ninguno.`;
  } else if (qaComparable && qaRegressed.length) {
    nivel = "mal";
    veredicto = `Sin errores nuevos de consola, pero el QA móvil empeoró: ${qaRegressed.length} hallazgo${qaRegressed.length === 1 ? "" : "s"} nuevo${qaRegressed.length === 1 ? "" : "s"}.`;
  } else if (qaComparable && qaResueltos.length) {
    nivel = "ok";
    veredicto = `El QA móvil mejoró: ${qaResueltos.length} hallazgo${qaResueltos.length === 1 ? "" : "s"} resuelto${qaResueltos.length === 1 ? "" : "s"}.`;
  } else if (!before.logs.length && !after.logs.length && !qaComparable) {
    nivel = "sin-datos";
    veredicto = "Sin datos suficientes: ni la consola ni el QA móvil respondieron en esta comparación.";
  } else {
    nivel = "igual";
    veredicto = "Sin cambios medidos: los mismos errores (ninguno) y el mismo QA móvil.";
  }

  return {
    nuevos,
    arreglados,
    avisosNuevos,
    qa: {
      antes: before.qa,
      despues: after.qa,
      resueltos: qaResueltos,
      regressed: qaRegressed,
    },
    html: { antes: before.htmlBytes, despues: after.htmlBytes },
    veredicto,
    nivel,
  };
}

/** ¿Merece la pena ofrecer comparación? Dos instantáneas de la misma entrada. */
export function comparables(before: RunSnapshot | null, after: RunSnapshot | null): boolean {
  if (!before || !after) return false;
  return before.entry === after.entry;
}
