/** Prism AI — Sacar el texto legible de una página HTML.
 *
 * Lo usa la herramienta `read_url` del agente. Mandarle al modelo el HTML en
 * crudo es tirar su contexto: entre `<script>`, `<style>` y la maraña de
 * `<div class="...">`, el texto útil suele ser menos de la décima parte.
 *
 * Se hace con expresiones regulares y no con el DOM a propósito: así es puro,
 * corre igual en el navegador y en un test, y no depende de que exista
 * `document`.
 */

/** Tope de lo que se le entrega al modelo. Una página larga puede tener
 *  cientos de miles de caracteres, y con modelos de 8.000 tokens eso no es
 *  «mucho contexto»: es la petición entera rechazada. */
export const MAX_TEXTO_URL = 8_000;

const ENTIDADES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  laquo: "«",
  raquo: "»",
  // Vocales acentuadas y eñe. No son un extra: media web en español las
  // escribe así, y sin esto al modelo le llegaba «art&iacute;culo».
  aacute: "á",
  eacute: "é",
  iacute: "í",
  oacute: "ó",
  uacute: "ú",
  Aacute: "Á",
  Eacute: "É",
  Iacute: "Í",
  Oacute: "Ó",
  Uacute: "Ú",
  ntilde: "ñ",
  Ntilde: "Ñ",
  uuml: "ü",
  Uuml: "Ü",
  iexcl: "¡",
  iquest: "¿",
  ordf: "ª",
  ordm: "º",
  deg: "°",
  euro: "€",
  copy: "©",
  reg: "®",
  trade: "™",
  middot: "·",
  bull: "•",
  rsquo: "'",
  lsquo: "'",
  ldquo: "\u201c",
  rdquo: "\u201d",
};

function decodificar(texto: string): string {
  return texto
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    // OJO con las mayúsculas: `&Aacute;` y `&aacute;` son entidades DISTINTAS
    // (Á y á), así que primero se busca tal cual y solo después en minúsculas.
    .replace(/&([a-z]+);/gi, (m, e: string) => ENTIDADES[e] ?? ENTIDADES[e.toLowerCase()] ?? m);
}

/** Título de la página, si lo declara. */
export function tituloDeHtml(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const t = m ? decodificar(m[1]).replace(/\s+/g, " ").trim() : "";
  return t || null;
}

/**
 * Convierte HTML en texto legible.
 *
 * El orden importa: primero se tiran los bloques que NO son contenido
 * (`script`, `style`, `noscript`, `svg`, `template`) con su contenido dentro,
 * y solo después se quitan las etiquetas. Al revés, el código JavaScript se
 * quedaría suelto en medio del texto.
 */
export function htmlATexto(html: string, tope = MAX_TEXTO_URL): string {
  let t = html;
  t = t.replace(/<!--[\s\S]*?-->/g, " ");
  t = t.replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1\s*>/gi, " ");
  // los saltos estructurales se conservan como saltos de línea
  t = t.replace(/<\/(p|div|section|article|li|tr|h[1-6]|br)\s*>/gi, "\n");
  t = t.replace(/<br\s*\/?>/gi, "\n");
  t = t.replace(/<[^>]+>/g, " ");
  t = decodificar(t);
  t = t
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  // más de dos líneas en blanco seguidas no aportan nada
  t = t.replace(/\n{3,}/g, "\n\n");
  if (t.length <= tope) return t;
  return t.slice(0, tope) + `\n\n[…recortado: la página tenía ${t.length} caracteres]`;
}
