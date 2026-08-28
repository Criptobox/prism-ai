/** Prism AI — Módulos ES dentro del Sandbox.
 *
 * Un proyecto moderno reparte el código en archivos que se importan entre sí:
 *
 *     <script type="module" src="js/app.js"></script>
 *     // js/app.js
 *     import { saludo } from "./util.js";
 *
 * Dentro del iframe el documento es un `srcdoc` sin origen propio, así que las
 * rutas relativas no apuntan a ningún sitio y el navegador no puede resolver
 * «./util.js». La solución no necesita empaquetador:
 *
 *  1. Cada módulo del proyecto recibe un especificador propio, «prism:<ruta>».
 *  2. Dentro de cada módulo se reescriben los import/export relativos a ese
 *     especificador (recursivamente, sea cual sea la profundidad).
 *  3. Se emite un <script type="importmap"> que asocia cada «prism:<ruta>» con
 *     una URL data: que lleva el código ya reescrito.
 *
 * Como el mapa se declara entero de antemano, los ciclos de importación y las
 * importaciones dinámicas funcionan igual que en un servidor de verdad.
 *
 * Lo que NO se puede resolver son los especificadores «desnudos» (import React
 * from "react"): eso exigiría instalar dependencias, y el Sandbox no instala
 * nada. Se devuelven en `bare` para poder avisar en vez de fallar en silencio.
 */

import { decodeText, extOf, resolvePath } from "./sandbox";

/** Prefijo de los especificadores que se inventan para el import map. */
export const MODULE_SCHEME = "prism:";

export interface ModuleGraph {
  /** especificador «prism:<ruta>» → URL data: con el código reescrito */
  imports: Record<string, string>;
  /** rutas que se importaron pero no están en el proyecto */
  missing: string[];
  /** especificadores desnudos (paquetes de npm) que no se pueden resolver */
  bare: string[];
  /** número de módulos incluidos en el mapa */
  count: number;
}

const MODULE_EXT = new Set(["js", "mjs"]);
const MAX_MODULES = 300;

/** ¿La ruta puede ser un módulo del proyecto? */
export function isModulePath(path: string): boolean {
  return MODULE_EXT.has(extOf(path));
}

/** Un especificador es relativo si empieza por ./ ../ o / */
export function isRelativeSpecifier(spec: string): boolean {
  return spec.startsWith("./") || spec.startsWith("../") || spec.startsWith("/");
}

/**
 * Encuentra los especificadores de un módulo: import/export estáticos e
 * import() dinámico. Trabaja sobre el texto tal cual — es suficiente porque
 * solo se tocan las comillas del especificador, no la estructura del código.
 */
const STATIC_SPEC =
  /(\bimport\s+(?:[\w*{}\n\r\t, $]+\s+from\s+)?|(?:\bexport\s+(?:\*|\{[^}]*\})\s+from\s+))(["'])([^"']+)\2/g;
const DYNAMIC_SPEC = /(\bimport\s*\(\s*)(["'])([^"']+)\2(\s*\))/g;

/** Resuelve un especificador relativo contra el proyecto, probando las
 * terminaciones habituales que el navegador NO adivina pero la gente escribe. */
export function resolveModule(
  fromPath: string,
  spec: string,
  has: (p: string) => boolean
): string | null {
  const baseDir = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : "";
  const target = resolvePath(baseDir, spec.split("#")[0].split("?")[0]);
  const candidatos = [target, `${target}.js`, `${target}.mjs`, `${target}/index.js`];
  return candidatos.find(has) ?? null;
}

/** Reescribe los especificadores relativos de un módulo a «prism:<ruta>».
 * `onMissing` recibe la ruta YA resuelta contra la raíz del proyecto, que es
 * la que hay que enseñar: «./nada.js» desde js/app.js se ve como «js/nada.js». */
export function rewriteSpecifiers(
  path: string,
  code: string,
  has: (p: string) => boolean,
  onMissing: (resolvedPath: string) => void,
  onBare: (spec: string) => void
): string {
  const baseDir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  const swap = (spec: string): string | null => {
    if (!isRelativeSpecifier(spec)) {
      // http(s):// y data: los resuelve el navegador solo; el resto es un paquete
      if (!/^(https?:|data:|blob:)/i.test(spec)) onBare(spec);
      return null;
    }
    const resolved = resolveModule(path, spec, has);
    if (!resolved) {
      onMissing(resolvePath(baseDir, spec.split("#")[0].split("?")[0]));
      return null;
    }
    return MODULE_SCHEME + resolved;
  };
  code = code.replace(STATIC_SPEC, (whole, head: string, q: string, spec: string) => {
    const next = swap(spec);
    return next ? `${head}${q}${next}${q}` : whole;
  });
  code = code.replace(DYNAMIC_SPEC, (whole, head: string, q: string, spec: string, tail: string) => {
    const next = swap(spec);
    return next ? `${head}${q}${next}${q}${tail}` : whole;
  });
  return code;
}

/** Codifica texto UTF-8 como URL data: apta para un módulo. */
export function toModuleDataUrl(code: string): string {
  const bytes = new TextEncoder().encode(code);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:text/javascript;base64,${btoa(bin)}`;
}

/** Sintaxis que delata un módulo ES (y no un script clásico). */
const ESM_SYNTAX =
  /(^|[\n;}])\s*(?:import\s*[({'"*]|import\s+[\w${]|export\s+(?:default|const|let|var|function|class|async|\*|\{))/;

export function looksLikeModule(code: string): boolean {
  return ESM_SYNTAX.test(code);
}

/** Especificadores que importa un módulo, en orden de aparición. */
export function specifiersOf(code: string): string[] {
  const out: string[] = [];
  for (const m of code.matchAll(STATIC_SPEC)) out.push(m[3]);
  for (const m of code.matchAll(DYNAMIC_SPEC)) out.push(m[3]);
  return out;
}

/**
 * Construye el import map del proyecto recorriendo el grafo de verdad.
 *
 * Solo entran los archivos que participan como módulos: los que llevan sintaxis
 * ESM, los que arrancan desde un <script type="module" src> (`roots`) y todo lo
 * que estos importan, directa o indirectamente. Un proyecto clásico sin
 * módulos no genera mapa alguno y se sigue inlineando como siempre — así no se
 * duplica en base64 un JS de medio mega para nada.
 */
export function buildModuleGraph(
  files: Map<string, Uint8Array>,
  roots: string[] = []
): ModuleGraph {
  const has = (p: string) => files.has(p);
  const code = new Map<string, string>();
  for (const [p, d] of files) {
    if (!isModulePath(p)) continue;
    try {
      code.set(p, decodeText(d));
    } catch {
      /* binario disfrazado de .js */
    }
  }

  // semillas: las que pide el HTML y las que ya se ven como módulo
  const included = new Set<string>();
  const queue: string[] = [];
  const add = (p: string) => {
    if (!code.has(p) || included.has(p) || included.size >= MAX_MODULES) return;
    included.add(p);
    queue.push(p);
  };
  for (const r of roots) add(r);
  for (const [p, c] of code) if (looksLikeModule(c)) add(p);

  // cierre transitivo: lo que importan los ya incluidos entra también
  while (queue.length) {
    const path = queue.shift() as string;
    for (const spec of specifiersOf(code.get(path) as string)) {
      if (!isRelativeSpecifier(spec)) continue;
      const target = resolveModule(path, spec, has);
      if (target) add(target);
    }
  }

  const missing = new Set<string>();
  const bare = new Set<string>();
  const imports: Record<string, string> = {};
  for (const path of included) {
    const rewritten = rewriteSpecifiers(
      path,
      code.get(path) as string,
      has,
      (target) => missing.add(target),
      (spec) => bare.add(spec)
    );
    imports[MODULE_SCHEME + path] = toModuleDataUrl(rewritten);
  }

  return { imports, missing: [...missing], bare: [...bare], count: included.size };
}

/** Etiqueta <script type="importmap"> lista para insertar en el <head>. */
export function importMapTag(graph: ModuleGraph): string {
  if (!graph.count) return "";
  // «/» en el JSON cerraría la etiqueta si apareciera como «</script>»
  const json = JSON.stringify({ imports: graph.imports }).replace(/<\//g, "<\\/");
  return `<script type="importmap">${json}</script>`;
}
