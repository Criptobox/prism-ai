/** Prism AI — Separación de razonamiento tipo <think> (DeepSeek-R1, QwQ, GLM-Think…).
 * Algunos modelos emiten el chain-of-thought dentro del propio contenido con
 * etiquetas <think>…</think> en vez de usar el campo reasoning_content.
 * Aquí se separa para mostrarlo en el acordeón de «Razonamiento del modelo».
 */

export interface ThinkSplit {
  content: string;
  reasoning: string;
}

/** Une dos textos de razonamiento sin dejar dobles saltos raros */
function mergeReasoning(prev: string, next: string): string {
  if (!prev) return next;
  if (!next) return prev;
  return `${prev}\n${next}`;
}

/**
 * Extrae los bloques <think>…</think> del contenido (y un <think> sin cerrar
 * mientras está en streaming, que se considera todo razonamiento pendiente).
 * Pensado para llamarse repetidamente durante el streaming: es idempotente
 * sobre el texto acumulado.
 */
export function splitThinkTags(content: string, prevReasoning = ""): ThinkSplit {
  if (!content.includes("<think>")) {
    return { content, reasoning: prevReasoning };
  }

  let rest = content;
  let reasoning = prevReasoning;

  for (;;) {
    const open = rest.indexOf("<think>");
    if (open < 0) break;

    // texto normal antes del bloque
    reasoning = mergeReasoning(reasoning, rest.slice(0, open).trim());
    const afterOpen = rest.slice(open + 7); // "<think>".length
    const close = afterOpen.indexOf("</think>");

    if (close < 0) {
      // bloque sin cerrar (streaming en curso): todo el resto es razonamiento
      reasoning = mergeReasoning(reasoning, afterOpen.trim());
      return { content: "", reasoning };
    }
    reasoning = mergeReasoning(reasoning, afterOpen.slice(0, close).trim());
    rest = afterOpen.slice(close + 8); // "</think>".length
  }

  return { content: rest.trimStart(), reasoning };
}
