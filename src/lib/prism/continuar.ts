/** Prism AI — Respuestas que se cortan a mitad del código.
 *
 * El caso real: pides una web larga, el modelo llega a su techo de tokens de
 * salida y el stream termina dentro del bloque de código. Prism lo daba por
 * respuesta buena: la cerca ``` quedaba sin cerrar, la vista previa recibía un
 * documento incompleto y no cargaba, y no había ni aviso ni forma de seguir.
 *
 * El modo agente ya tenía su propia detección (`agentStalled`), pero solo mira
 * las etiquetas XML del bucle. Fuera del agente —que es como se pide una web
 * la mayoría de las veces— no había nada.
 *
 * Aquí solo se decide QUÉ está cortado y CÓMO pedir la continuación. Sin red y
 * sin React, para poder fijarlo con pruebas.
 */

export type MotivoCorte =
  /** el bloque ``` se abrió y nunca se cerró */
  | "cerca-abierta"
  /** el bloque cerró, pero el documento HTML se quedó sin `</html>` */
  | "html-sin-cerrar"
  | null;

export interface CorteInfo {
  cortada: boolean;
  motivo: MotivoCorte;
  /** lenguaje declarado en la cerca abierta ("html", "js"…), "" si no lo dijo */
  lang: string;
  /** últimas líneas de lo escrito: se le devuelven al modelo para que empalme
   *  justo ahí en vez de empezar de cero */
  cola: string;
}

const SIN_CORTE: CorteInfo = { cortada: false, motivo: null, lang: "", cola: "" };

/** Cuántas líneas del final se le enseñan al modelo para empalmar. */
const LINEAS_COLA = 8;

function cola(texto: string): string {
  const lineas = texto.replace(/\s+$/, "").split("\n");
  return lineas.slice(-LINEAS_COLA).join("\n");
}

/**
 * ¿Se cortó esta respuesta a mitad?
 *
 * Solo se miran señales objetivas: una cerca sin pareja, o un documento HTML
 * sin su cierre. Nada de adivinar por «parece que termina raro» — un falso
 * positivo aquí gasta cuota del usuario pidiendo continuar algo completo.
 *
 * Se llama con el stream YA TERMINADO; durante el streaming todo parece
 * cortado.
 */
export function respuestaCortada(content: string): CorteInfo {
  if (!content.trim()) return SIN_CORTE;

  // Cercas de apertura/cierre: las que están a principio de línea.
  const marcas = [...content.matchAll(/^[ \t]*```([^\n`]*)$/gm)];
  if (marcas.length % 2 === 1) {
    const abierta = marcas[marcas.length - 1];
    const lang = (abierta[1] ?? "").trim().toLowerCase();
    const desde = (abierta.index ?? 0) + abierta[0].length;
    return { cortada: true, motivo: "cerca-abierta", lang, cola: cola(content.slice(desde)) };
  }

  // La cerca cerró, pero el documento no. Pasa cuando el modelo cierra el
  // bloque por costumbre aunque le hayan cortado el contenido.
  const abreDoc = /<!doctype\s+html|<html[\s>]/i.test(content);
  if (abreDoc && !/<\/html\s*>/i.test(content)) {
    return { cortada: true, motivo: "html-sin-cerrar", lang: "html", cola: cola(content) };
  }

  return SIN_CORTE;
}

/**
 * Instrucción para que el modelo empalme exactamente donde lo dejó.
 *
 * Lo importante es lo que se le PROHÍBE: repetir lo ya escrito (duplicaría la
 * página entera), abrir otra cerca (rompería el bloque en dos y la vista
 * previa volvería a fallar) y saludar antes de seguir.
 */
export function continuarCodigoPrompt(info: CorteInfo): string {
  const cierre =
    info.motivo === "html-sin-cerrar"
      ? "Te faltó cerrar el documento."
      : "Te cortaste dentro del bloque de código.";
  return `Tu respuesta anterior se cortó por longitud. ${cierre}

Continúa EXACTAMENTE donde lo dejaste. Estas son las últimas líneas que escribiste:

${info.cola}

Reglas:
- Sigue desde el siguiente carácter. NO repitas nada de lo anterior.
- NO abras un bloque de código nuevo y NO escribas \`\`\` al empezar.
- NO saludes ni expliques: continúa el código directamente.
- Cierra el documento al terminar.`;
}

/**
 * Pega la continuación al texto anterior.
 *
 * Los modelos casi siempre desobedecen algo: reabren la cerca, o repiten el
 * último trozo. Se limpia aquí para que quede UN bloque de código válido, que
 * es lo que la vista previa necesita.
 */
export function unirContinuacion(previo: string, nuevo: string): string {
  let trozo = nuevo;

  // 1. Cerca reabierta al principio, con o sin lenguaje.
  trozo = trozo.replace(/^\s*```[^\n`]*\n?/, "");

  // 2. Preámbulo de cortesía antes del código.
  trozo = trozo.replace(/^\s*(?:claro|por supuesto|continúo|continuo|sigo)[^\n]*\n+/i, "");

  // 3. Repetición del final anterior: se busca el solape más largo para no
  //    dejar líneas duplicadas en mitad del documento.
  const finPrevio = previo.slice(-2000);
  const maxSolape = Math.min(finPrevio.length, trozo.length);
  let solape = 0;
  for (let n = maxSolape; n >= 24; n--) {
    if (finPrevio.endsWith(trozo.slice(0, n))) {
      solape = n;
      break;
    }
  }
  trozo = trozo.slice(solape);

  if (!trozo.trim()) return previo;
  // Sin separador: se empalma en el punto exacto del corte.
  return previo + trozo;
}
