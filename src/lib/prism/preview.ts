/** Prism AI — Extracción de HTML para la vista previa en vivo.
 * Detecta bloques ```html cerrados O EN CURSO (streaming) y documentos sueltos.
 */

const FENCE_RE = /```([^\n`]*)\n([\s\S]*?)(?:```|$)/g;

function looksLikeDocument(code: string): boolean {
  return /<!doctype\s+html|<html[\s>]/i.test(code);
}

function looksLikeMarkup(code: string): boolean {
  return /<(?:html|body|head|main|section|article|div|canvas|svg|table|form)[\s>]/i.test(code);
}

/**
 * Devuelve el HTML renderizable de una respuesta (el más reciente si hay varios),
 * o null si no hay nada que parezca una página.
 */
export function extractPreviewHtml(content: string | null | undefined): string | null {
  if (!content) return null;

  let lastDoc: string | null = null;
  let lastMarkup: string | null = null;

  FENCE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FENCE_RE.exec(content))) {
    const lang = (m[1] ?? "").trim().toLowerCase();
    const code = (m[2] ?? "").trim();
    if (code.length < 20) continue;
    if (looksLikeDocument(code)) {
      lastDoc = code; // sigue iterando: el último documento gana
      continue;
    }
    if ((lang === "html" || lang === "htm") && looksLikeMarkup(code)) {
      lastMarkup = code;
    }
  }

  if (lastDoc) return lastDoc;
  if (lastMarkup) return lastMarkup;

  // Documento sin cerca (doctype suelto en el texto)
  const idx = content.search(/<!doctype\s+html|<html[\s>]/i);
  if (idx >= 0) {
    let html = content.slice(idx).trim();
    const fenceEnd = html.lastIndexOf("```");
    if (fenceEnd > 300) html = html.slice(0, fenceEnd);
    return html.trim() || null;
  }
  return null;
}
