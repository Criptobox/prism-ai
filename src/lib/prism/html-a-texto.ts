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

/* ------------------------------------------------------------------ */
/* Quedarse con una zona de la página (parámetro `selector` de read_url) */
/* ------------------------------------------------------------------ */

/** Lo que se acepta como selector, en un sitio para poder decírselo al modelo
 * y al usuario con las mismas palabras que usa el código. */
export const SELECTORES_SOPORTADOS =
  "una etiqueta (main), un id (#precios), una clase (.PricingTable) o etiqueta + id/clase (section#precios, div.card)";

/** Etiquetas que se cierran solas: no abren subárbol y por tanto nunca son un
 * contenedor válido para quedarse con «lo de dentro». */
const VACIAS_HTML = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

export interface SeleccionHtml {
  /** el HTML de la zona encontrada, o null si no se encontró */
  html: string | null;
  /** por qué no se pudo: sintaxis no soportada, o sin coincidencia */
  error: string | null;
}

interface SelectorSimple {
  tag: string | null;
  id: string | null;
  clase: string | null;
}

/** Analiza el selector. Devuelve null si usa sintaxis que aquí NO se sabe
 * resolver: combinadores (`div p`, `a > b`), atributos, pseudoclases, comas. */
function parsearSelector(sel: string): SelectorSimple | null {
  const s = sel.trim();
  if (!s) return null;
  // Un selector simple: opcionalmente etiqueta, y después UN #id o UNA .clase.
  const m = /^([a-zA-Z][a-zA-Z0-9-]*)?(?:([#.])([A-Za-z0-9_-]+))?$/.exec(s);
  if (!m) return null;
  const [, tag, tipo, nombre] = m;
  if (!tag && !nombre) return null;
  return {
    tag: tag ? tag.toLowerCase() : null,
    id: tipo === "#" ? nombre : null,
    clase: tipo === "." ? nombre : null,
  };
}

/** ¿Esta etiqueta de apertura casa con el selector? */
function casa(apertura: string, sel: SelectorSimple): boolean {
  if (sel.id) {
    const m = /\sid\s*=\s*("([^"]*)"|'([^']*)'|([^\s">]+))/i.exec(apertura);
    const valor = m ? (m[2] ?? m[3] ?? m[4] ?? "") : "";
    if (valor !== sel.id) return false;
  }
  if (sel.clase) {
    const m = /\sclass\s*=\s*("([^"]*)"|'([^']*)'|([^\s">]+))/i.exec(apertura);
    const valor = m ? (m[2] ?? m[3] ?? m[4] ?? "") : "";
    if (!valor.split(/\s+/).includes(sel.clase)) return false;
  }
  return true;
}

/**
 * Devuelve el HTML del primer elemento que casa con el selector.
 *
 * A propósito NO usa el DOM: los unitarios corren en Node y `read_url` tiene
 * que dar el mismo resultado ahí que en el navegador. Y a propósito solo
 * entiende selectores simples: un motor CSS a medio hacer que acierta el 80 %
 * de las veces es peor que uno que dice claramente qué sabe hacer. Si el
 * selector no se soporta, o no casa, se devuelve un error — nunca la página
 * entera fingiendo que se hizo caso.
 *
 * El cierre se busca contando aperturas y cierres de la MISMA etiqueta, así
 * que un `div` dentro de otro `div` no corta antes de tiempo.
 */
export function extraerSeleccion(html: string, selector: string): SeleccionHtml {
  const sel = parsearSelector(selector);
  if (!sel) {
    return {
      html: null,
      error: `El selector «${selector}» no se soporta. Aquí solo valen: ${SELECTORES_SOPORTADOS}. Sin combinadores (\`div p\`), ni atributos, ni comas.`,
    };
  }
  const tag = sel.tag;
  // Sin etiqueta (#precios) hay que probar con cualquiera; con etiqueta, solo
  // con esa. El barrido es el mismo: recorrer las aperturas y quedarse con la
  // primera que cumpla las tres condiciones.
  const re = tag
    ? new RegExp(`<${tag}(\\s[^>]*)?>`, "gi")
    : /<([a-zA-Z][a-zA-Z0-9-]*)(\s[^>]*)?>/g;

  for (let m = re.exec(html); m; m = re.exec(html)) {
    const apertura = m[0];
    const nombre = (tag ?? m[1]).toLowerCase();
    if (VACIAS_HTML.has(nombre)) continue;
    if (!casa(apertura, sel)) continue;

    // `<section id="x"/>`: el elemento se cierra en su propia etiqueta, así
    // que el subárbol ES la etiqueta. Sin esto el contador nunca llegaba a
    // cero y se devolvía media página.
    if (/\/>$/.test(apertura)) return { html: apertura, error: null };

    // Contar aperturas y cierres de ESTA etiqueta hasta cerrar el subárbol.
    const anidada = new RegExp(`<(/?)${nombre}(?:\\s[^>]*?)?(/?)>`, "gi");
    anidada.lastIndex = m.index;
    let nivel = 0;
    for (let n = anidada.exec(html); n; n = anidada.exec(html)) {
      // `<div/>` abre y cierra en la misma etiqueta: ni sube ni baja el nivel.
      if (n[2] === "/") continue;
      nivel += n[1] === "/" ? -1 : 1;
      if (nivel === 0) {
        return { html: html.slice(m.index, n.index + n[0].length), error: null };
      }
    }
    // Etiqueta abierta y nunca cerrada (HTML roto, y hay mucho): se entrega
    // desde ahí hasta el final en vez de fallar. Es lo que haría un navegador.
    return { html: html.slice(m.index), error: null };
  }

  return {
    html: null,
    error: `Ningún elemento de la página casa con «${selector}». Vuelve a pedirla sin selector para ver qué hay, o prueba otro.`,
  };
}
