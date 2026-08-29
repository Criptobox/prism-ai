/** Prism AI — Los archivos que hay dentro de una respuesta.
 *
 * La vista previa sabe sacar el HTML para pintarlo, y descargar bajaba solo
 * eso. Pero cuando el modelo entrega un proyecto —index.html, styles.css,
 * app.js— el resto se quedaba en el chat: para conservarlo había que ir bloque
 * por bloque copiando a mano.
 *
 * Aquí se recorren los bloques de código y se les pone nombre. Los modelos lo
 * dicen de muchas maneras distintas, así que se miran tres sitios en orden:
 * la línea de apertura de la cerca, el texto justo encima, y un comentario en
 * la primera línea del propio código. Si ninguna lo dice, se usa un nombre por
 * defecto según el lenguaje.
 *
 * Funciones puras: se prueban sin navegador.
 */

import { buildRunHtml, encodeText, pickEntryPath } from "./sandbox";

export interface AnswerFile {
  path: string;
  text: string;
  /** true si el nombre se dedujo por el lenguaje, no lo dijo la respuesta */
  inferido: boolean;
}

const CERCA = /```([^\n`]*)\n([\s\S]*?)(?:```|$)/g;

/** Nombre por defecto cuando la respuesta no da ninguno. */
const POR_LENGUAJE: Record<string, string> = {
  html: "index.html",
  htm: "index.html",
  css: "styles.css",
  js: "app.js",
  javascript: "app.js",
  jsx: "app.jsx",
  ts: "app.ts",
  typescript: "app.ts",
  tsx: "app.tsx",
  json: "data.json",
  py: "main.py",
  python: "main.py",
  sh: "script.sh",
  bash: "script.sh",
  sql: "query.sql",
  md: "README.md",
  markdown: "README.md",
  yml: "config.yml",
  yaml: "config.yml",
  svg: "image.svg",
  xml: "data.xml",
  java: "Main.java",
  go: "main.go",
  rs: "main.rs",
  php: "index.php",
  rb: "main.rb",
  c: "main.c",
  cpp: "main.cpp",
  cs: "Program.cs",
};

/** Lenguajes que no son un archivo: una consola no se descarga. */
const NO_SON_ARCHIVO = new Set(["", "text", "txt", "console", "shell", "output", "salida", "log", "diff"]);

const MAX_RUTA = 120;

/**
 * ¿Esto parece de verdad un nombre de archivo?
 *
 * Se rechaza lo que traiga espacios, rutas absolutas, «..» o pinta de URL:
 * el nombre acaba en un `download`, y aceptarlo todo llevaría a guardar
 * cosas como «https://ejemplo.com/index.html».
 */
export function esRutaPlausible(candidato: string): boolean {
  const r = candidato.trim();
  if (!r || r.length > MAX_RUTA) return false;
  if (/\s/.test(r)) return false;
  if (r.startsWith("/") || r.startsWith("\\")) return false;
  if (r.includes("..")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(r)) return false; // http:, data:, C:
  if (!/^[\w.@-]+(?:\/[\w.@-]+)*$/.test(r)) return false;
  const base = r.split("/").pop() ?? "";
  // tiene que tener extensión de verdad, y no ser solo un punto
  return /^[\w@-]+(?:\.[\w-]+)+$/.test(base);
}

/** Limpia adornos alrededor de un candidato: comillas, backticks, negritas, emoji. */
function desnudar(s: string): string {
  return s
    .replace(/[*_`~"']/g, "")
    .replace(/^[^\w./-]+/u, "")
    .replace(/[^\w./-]+$/u, "")
    .trim();
}

/** Nombre dicho en la propia línea de apertura: ```html:index.html, ```js title="app.js" */
function deLaCerca(info: string): string | null {
  const limpio = info.trim();
  if (!limpio) return null;

  const conAtributo = limpio.match(/(?:title|file|filename|name)\s*=\s*["']?([^"'\s]+)/i);
  if (conAtributo && esRutaPlausible(desnudar(conAtributo[1]))) return desnudar(conAtributo[1]);

  // ```html:index.html  y también ```html index.html
  for (const parte of limpio.split(/[:\s]+/).slice(1)) {
    const c = desnudar(parte);
    if (esRutaPlausible(c)) return c;
  }
  // ```index.html a secas
  const solo = desnudar(limpio.split(/\s+/)[0]);
  return solo.includes(".") && esRutaPlausible(solo) ? solo : null;
}

/** Nombre en el texto justo encima de la cerca: «**index.html**», «### app.js», «Archivo: x.css» */
function deArriba(previo: string): string | null {
  const lineas = previo.split("\n").map((l) => l.trim()).filter(Boolean);
  // solo las dos últimas: más arriba ya es prosa y el falso positivo es fácil
  for (const linea of lineas.slice(-2).reverse()) {
    if (linea.length > 200) continue;
    const sinPrefijo = linea.replace(/^(?:#{1,6}\s*|[-*]\s*)?(?:archivo|fichero|file)?\s*:?\s*/i, "");
    // se prueba token a token: «2. **src/app.js** (nuevo)» tiene que dar src/app.js
    for (const token of sinPrefijo.split(/\s+/)) {
      const c = desnudar(token);
      if (c.includes(".") && esRutaPlausible(c)) return c;
    }
  }
  return null;
}

/** Nombre en un comentario de la primera línea del código. */
function deDentro(codigo: string): string | null {
  const primera = codigo.split("\n", 1)[0].trim();
  const m = primera.match(/^(?:<!--|\/\/|\/\*|#|--)\s*(.+?)\s*(?:-->|\*\/)?$/);
  if (!m) return null;
  for (const token of m[1].split(/\s+/)) {
    const c = desnudar(token);
    if (c.includes(".") && esRutaPlausible(c)) return c;
  }
  return null;
}

/**
 * Saca los archivos de una respuesta. El último bloque con un mismo nombre
 * gana: cuando el modelo corrige un archivo, lo que vale es la última versión.
 */
export function filesFromAnswer(content: string | null | undefined): AnswerFile[] {
  if (!content) return [];

  const porRuta = new Map<string, AnswerFile>();
  const usadosPorDefecto = new Map<string, number>();

  CERCA.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CERCA.exec(content))) {
    const info = m[1] ?? "";
    const codigo = (m[2] ?? "").replace(/\s+$/, "");
    if (!codigo.trim()) continue;

    const lang = info.trim().split(/[:\s]+/)[0].toLowerCase();
    if (NO_SON_ARCHIVO.has(lang) && !deLaCerca(info)) continue;

    const previo = content.slice(0, m.index);
    const dicho = deLaCerca(info) ?? deArriba(previo) ?? deDentro(codigo);

    let ruta = dicho;
    let inferido = false;
    if (!ruta) {
      const base = POR_LENGUAJE[lang];
      if (!base) continue; // lenguaje desconocido y sin nombre: no se inventa
      inferido = true;
      const n = (usadosPorDefecto.get(base) ?? 0) + 1;
      usadosPorDefecto.set(base, n);
      ruta = n === 1 ? base : numerar(base, n);
    }

    porRuta.set(ruta, { path: ruta, text: codigo, inferido });
  }

  return [...porRuta.values()];
}

/** «app.js» + 2 → «app-2.js» */
function numerar(base: string, n: number): string {
  const punto = base.lastIndexOf(".");
  return punto <= 0 ? `${base}-${n}` : `${base.slice(0, punto)}-${n}${base.slice(punto)}`;
}

/**
 * El HTML listo para pintar en la vista previa.
 *
 * La vista previa renderizaba SOLO el bloque HTML. Si la respuesta reparte el
 * trabajo en varios archivos —lo normal en cuanto la página crece— el
 * `<link rel="stylesheet" href="styles.css">` y el `<script src="app.js">`
 * apuntan a archivos que dentro del `srcdoc` no existen, así que no cargan y la
 * página sale a medias: la cabecera y el pie se ven, y todo lo que pinta el JS
 * (la rejilla de productos, por ejemplo) no aparece. Al descargarla sí se veía
 * entera, porque ahí van los tres archivos juntos.
 *
 * Aquí se reutiliza el empaquetador del Sandbox, que ya resuelve eso: mete el
 * CSS y el JS hermanos dentro del propio HTML.
 *
 * El contenido de la entrada se sustituye por `html` a propósito: durante el
 * streaming eso es lo que se lleva escrito, y así la vista previa sigue
 * creciendo en vivo en vez de esperar al final.
 */
export function bundlePreview(html: string, files: AnswerFile[]): string {
  if (files.length < 2) return html; // un archivo suelto ya se pinta bien
  const entry = pickEntryPath(files.map((f) => f.path));
  if (!entry) return html;

  const mapa = new Map<string, Uint8Array>();
  for (const f of files) mapa.set(f.path, encodeText(f.text));
  mapa.set(entry, encodeText(html));

  try {
    return buildRunHtml(entry, mapa).html;
  } catch {
    // el empaquetador nunca debería tumbar la vista previa
    return html;
  }
}

/** Nombre de archivo seguro para una descarga, a partir de un texto cualquiera. */
export function nombreDescarga(titulo: string | null | undefined, extension: string): string {
  const base = (titulo ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const fecha = new Date().toISOString().slice(0, 10);
  return `${base || "prism"}-${fecha}.${extension}`;
}
