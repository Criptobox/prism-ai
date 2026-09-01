/** Prism AI — Modo presentación de la vista previa (U6, PLAN-V7).
 *
 * Convierte el HTML de la vista previa en una lista de diapositivas:
 * una por `<section>` si hay varias, o una por `<h2>` si no. Si no
 * encuentra nada, devuelve una sola con el documento entero.
 *
 * Lógica pura (sin React ni DOM) para poder probarla en Node, como
 * el resto de piezas que trocean texto antes de pintar (`project-map.ts`,
 * `passport.ts`). La UI la pinta `preview-panel.tsx`.
 */

/** Una diapositiva generada a partir del HTML. */
export interface Slide {
  /** número de diapositiva, 1-indexado */
  index: number;
  /** título corto, lo primero que se encontró (h1/h2/h3 o primer texto) */
  title: string;
  /** HTML del cuerpo de la diapositiva, listo para meter en un iframe */
  html: string;
}

/** Trocea un documento HTML completo en diapositivas.
 *
 * Estrategia, en orden de preferencia:
 *  1. Si hay ≥2 `<section>`, una diapositiva por sección.
 *  2. Si hay ≥2 `<h2>`, una diapositiva por bloque entre h2 y el
 *     siguiente h2 (incluido el propio h2).
 *  3. Si hay ≥2 `<h1>`, lo mismo con h1.
 *  4. Si no, una sola diapositiva con el documento entero.
 *
 * El parser es intencionadamente simple: lo que llega aquí ya es HTML
 * válido (lo escribió el modelo o lo editó el usuario). No valida nada,
 * solo trocea. Si el HTML es raro, la diapositiva sigue siendo abrible.
 */
export function slidesFromHtml(html: string): Slide[] {
  if (!html || !html.trim()) return [];

  // Caso 1: varias <section>
  const sections = collectBlocks(html, /<section\b[^>]*>/gi, /<\/section\s*>/gi, true);
  if (sections.length >= 2) return sections.map((s, i) => toSlide(i + 1, s, html));

  // Caso 2: varios <h2>
  const h2 = splitByHeader(html, "h2");
  if (h2.length >= 2) return h2.map((s, i) => toSlide(i + 1, s, html));

  // Caso 3: varios <h1>
  const h1 = splitByHeader(html, "h1");
  if (h1.length >= 2) return h1.map((s, i) => toSlide(i + 1, s, html));

  // Caso 4: una sola diapositiva con todo
  return [toSlide(1, html, html)];
}

/** Construye una diapositiva. El HTML del cuerpo va envuelto en una
 *  plantilla mínima para que el iframe tenga `<html>` completo y los
 *  estilos del original (si el original los traía en `<head>`, se
 *  conservan; si no, una base limpia). */
function toSlide(index: number, body: string, original: string): Slide {
  const head = extractHead(original);
  const title = extractTitle(body) || `Diapositiva ${index}`;
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${head}
<style>
  /* base cómoda para presentación: cuerpo centrado y grande */
  body{font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    margin:0;padding:5vmin 7vmin;line-height:1.5;color:#eceaf4;background:#0b0a12;
    display:flex;flex-direction:column;justify-content:center;min-height:100vh;
    box-sizing:border-box}
  h1,h2,h3{margin-top:0}
  img{max-width:100%;height:auto}
  @media(max-width:560px){body{padding:6vmin 4vmin}}
</style>
</head>
<body>
${body}
</body>
</html>`;
  return { index, title, html };
}

/** Saca el contenido del `<head>` del original (para conservar `<style>`
 *  y `<link>` del autor). Si no hay head, cadena vacía. */
function extractHead(html: string): string {
  const m = html.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i);
  return m ? m[1].trim() : "";
}

/** Saca un título corto para la diapositiva: el texto del primer h1/h2/h3,
 *  o los primeros 60 caracteres de texto plano. */
function extractTitle(body: string): string {
  const m = body.match(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i);
  if (m) return stripTags(m[1]).trim().slice(0, 80);
  const text = stripTags(body).trim();
  return text ? text.slice(0, 60) + (text.length > 60 ? "…" : "") : "";
}

/** Quita las etiquetas HTML y colapsa whitespace. */
function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Caso genérico: recoge bloques entre `openRe` y `closeRe`. Si
 *  `unwrap` es true, el contenido DEVUELTO no incluye las etiquetas
 *  de apertura/cierre (las diapositivas las reconstruyen). */
function collectBlocks(
  html: string,
  openRe: RegExp,
  closeRe: RegExp,
  unwrap: boolean
): string[] {
  const blocks: string[] = [];
  let pos = 0;
  // resetea regex con /g
  const open = new RegExp(openRe.source, openRe.flags);
  const close = new RegExp(closeRe.source, closeRe.flags);
  let m: RegExpExecArray | null;
  while ((m = open.exec(html)) !== null) {
    const start = m.index;
    const after = start + m[0].length;
    // busca el cierre más cercano tras la apertura
    close.lastIndex = after;
    const c = close.exec(html);
    if (!c) {
      // sin cierre: hasta el final
      const body = html.slice(start);
      blocks.push(unwrap ? stripOuterTag(body, m[0]) : body);
      break;
    }
    const end = c.index + c[0].length;
    const block = html.slice(start, end);
    blocks.push(unwrap ? stripOuterTag(block, m[0], c[0]) : block);
    pos = end;
    open.lastIndex = pos;
  }
  return blocks;
}

/** Quita la etiqueta de apertura y cierre de un bloque. */
function stripOuterTag(block: string, openTag: string, closeTag?: string): string {
  let s = block;
  if (s.startsWith(openTag)) s = s.slice(openTag.length);
  if (closeTag && s.endsWith(closeTag)) s = s.slice(0, -closeTag.length);
  return s.trim();
}

/** Trocea el HTML por apariciones de un encabezado (`h1`, `h2`...).
 *  Cada trozo EMPIEZA por el encabezado y va hasta el siguiente. */
function splitByHeader(html: string, tag: string): string[] {
  const re = new RegExp(`<${tag}\\b[^>]*>`, "gi");
  const indices: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    indices.push(m.index);
    if (m.index === re.lastIndex) re.lastIndex++; // evita bucle en match vacío
  }
  if (indices.length < 2) return [];
  const out: string[] = [];
  for (let i = 0; i < indices.length; i++) {
    const start = indices[i];
    const end = i + 1 < indices.length ? indices[i + 1] : html.length;
    out.push(html.slice(start, end).trim());
  }
  return out;
}
