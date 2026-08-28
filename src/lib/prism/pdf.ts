"use client";
/** Prism AI — Extracción de texto de PDFs en local con pdf.js (pdfjs-dist).
 * El texto extraído viaja como contexto del mensaje: nunca sale hacia
 * ningún servidor aparte, solo hacia el modelo que tú elijas.
 */

const MAX_PAGES = 40;
const MAX_CHARS = 120_000;

/** Extrae el texto de un PDF (dinámico: solo carga la librería al usarlo) */
export async function extractPdfText(file: File, maxPages = MAX_PAGES): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  try {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();
  } catch {
    /* sin workerSrc cae al modo fake worker */
  }

  const data = await file.arrayBuffer();
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;
  const pages = Math.min(doc.numPages, maxPages);
  const parts: string[] = [];
  let total = 0;

  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((it) => ("str" in it ? (it as { str: string }).str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) {
      parts.push(`— Página ${i} —\n${text}`);
      total += text.length;
      if (total > MAX_CHARS) {
        parts.push(`(texto truncado a ${MAX_CHARS} caracteres)`);
        break;
      }
    }
  }
  await task.destroy();

  if (!parts.length) {
    throw new Error("El PDF no contiene texto seleccionable (¿es un escaneo?)");
  }
  return parts.join("\n\n").slice(0, MAX_CHARS);
}
