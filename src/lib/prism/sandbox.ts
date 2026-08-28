/** Prism AI — Sandbox: ejecuta proyectos web estáticos (estilo Spck).
 * Del ZIP o del Repo Studio se construye un HTML autocontenido:
 *  - <link rel=stylesheet> locales → <style> inline (con @import y url() reescritos)
 *  - <script src> locales → inline (clásicos)
 *  - imágenes/audio/vídeo locales → data URLs
 *  - se inyecta un puente de consola (postMessage) para ver logs y errores
 * El resultado se ejecuta en un iframe sandbox SIN same-origin: tu app y tus
 * claves están siempre aisladas del proyecto ejecutado.
 */

import {
  buildModuleGraph,
  importMapTag,
  rewriteSpecifiers,
  MODULE_SCHEME,
} from "./sandbox-modules";

export const SANDBOX_ORIGIN = "prism-sandbox";

/** Semilla: archivos de texto (p. ej. desde Repo Studio) para abrir el Sandbox con contenido. */
export interface SandboxSeed {
  name: string;
  files: { path: string; content: string }[];
}

export interface RunBuildResult {
  html: string;
  entryPath: string;
  missing: string[];
  inlined: number;
  /** módulos ES incluidos en el import map (0 = el proyecto no usa módulos) */
  modules: number;
  /** paquetes de npm importados que el Sandbox no puede resolver */
  bareImports: string[];
}

const TEXT_EXT = new Set([
  "html", "htm", "css", "js", "mjs", "cjs", "json", "md", "txt", "svg", "xml",
  "csv", "ts", "tsx", "jsx", "yml", "yaml", "ini", "toml", "env", "gitignore",
]);
const IMAGE_MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", avif: "image/avif", svg: "image/svg+xml", ico: "image/x-icon",
  bmp: "image/bmp",
};
const AUDIO_MIME: Record<string, string> = {
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4",
};
const VIDEO_MIME: Record<string, string> = {
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
};
const MAX_ASSET = 3 * 1024 * 1024; // 3 MB por recurso inline
const MAX_INLINE = 120; // nº máximo de recursos inlineados

export function extOf(path: string): string {
  const i = path.lastIndexOf(".");
  return i < 0 ? "" : path.slice(i + 1).toLowerCase();
}

export function isTextPath(path: string): boolean {
  return TEXT_EXT.has(extOf(path));
}

export function isHtmlPath(path: string): boolean {
  const e = extOf(path);
  return e === "html" || e === "htm";
}

export function decodeText(data: Uint8Array): string {
  return new TextDecoder().decode(data);
}

export function encodeText(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/** Resuelve «rel» respecto al DIRECTORIO base ("" = raíz del proyecto).
 * Una ruta absoluta «/x» se ancla a la raíz del proyecto (como la raíz de un sitio web). */
export function resolvePath(baseDir: string, rel: string): string {
  const base = rel.startsWith("/") ? "" : baseDir.replace(/\/+$/, "");
  rel = rel.replace(/^\/+/, "");
  const parts = base ? base.split("/") : [];
  for (const seg of rel.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

/** Normaliza quitando query/hash. Devuelve null si es externo o especial. */
export function localRef(src: string): string | null {
  const s = src.trim();
  if (!s) return null;
  if (/^(https?:)?\/\//i.test(s) || /^(data|blob|mailto|tel|javascript):/i.test(s)) return null;
  if (s.startsWith("#")) return null;
  const clean = s.split("#")[0].split("?")[0].replace(/^\.\//, "");
  return clean || null;
}

/** Elige el HTML de entrada: el preferido, si no index.html superficial, si no el más superficial. */
export function pickEntryPath(paths: string[], preferred?: string | null): string | null {
  const htmls = paths.filter(isHtmlPath);
  if (!htmls.length) return null;
  if (preferred && htmls.includes(preferred)) return preferred;
  const depth = (p: string) => p.split("/").length;
  const atRootIndex = htmls.find((p) => depth(p) === 1 && /^index\.html?$/i.test(p.split("/").pop() ?? ""));
  if (atRootIndex) return atRootIndex;
  const sorted = [...htmls].sort((a, b) => depth(a) - depth(b) || a.localeCompare(b));
  return sorted[0] ?? null;
}

function mimeFor(path: string): string | null {
  const e = extOf(path);
  return IMAGE_MIME[e] ?? AUDIO_MIME[e] ?? VIDEO_MIME[e] ?? null;
}

function toDataUrl(data: Uint8Array, mime: string): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < data.length; i += chunk) {
    bin += String.fromCharCode(...data.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(bin)}`;
}

/* ---------- reescritura de CSS ---------- */

function rewriteCssUrls(css: string, baseDir: string, get: (p: string) => Uint8Array | undefined, res: RunBuildResult): string {
  // @import "x.css" / @import url(x.css)
  css = css.replace(/@import\s+(?:url\(\s*)?["']?([^"')]+)["']?\s*\)?\s*;/gi, (m, ref: string) => {
    const local = localRef(ref);
    if (!local) return m;
    const p = resolvePath(baseDir, local);
    const data = get(p);
    if (!data) {
      res.missing.push(p);
      return m;
    }
    res.inlined++;
    if (res.inlined > MAX_INLINE) return m;
    const inner = decodeText(data);
    const nested = rewriteCssUrls(inner, p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "", get, res);
    return `/* @import ${p} */\n${nested}`;
  });
  // url(...) → data URL
  css = css.replace(/url\(\s*["']?([^"')]+)["']?\s*\)/gi, (m, ref: string) => {
    const local = localRef(ref);
    if (!local) return m;
    const p = resolvePath(baseDir, local);
    const data = get(p);
    if (!data) {
      res.missing.push(p);
      return m;
    }
    const mime = mimeFor(p);
    if (!mime || data.length > MAX_ASSET) return m; // lo deja tal cual
    res.inlined++;
    return `url("${toDataUrl(data, mime)}")`;
  });
  return css;
}

/* ---------- puente de consola ---------- */

export const CONSOLE_BRIDGE = `(function(){
  var O=${JSON.stringify(SANDBOX_ORIGIN)};
  function send(level,args){
    try{
      var text=Array.prototype.map.call(args,function(a){
        if(typeof a==='string')return a;
        try{return JSON.stringify(a,function(k,v){return typeof v==='function'?'ƒ':v;});}catch(e){return String(a);}
      }).join(' ');
      if(text&&text.length>2000)text=text.slice(0,2000)+'…';
      parent.postMessage({source:O,level:level,text:text},'*');
    }catch(e){}
  }
  ['log','info','warn','error','debug'].forEach(function(level){
    var orig=console[level]?console[level].bind(console):function(){};
    console[level]=function(){send(level==='debug'?'log':level,arguments);orig.apply(null,arguments);};
  });
  window.addEventListener('error',function(e){send('error',[(e.message||'Error')+(e.lineno?' (línea '+e.lineno+')':'')]);});
  window.addEventListener('unhandledrejection',function(e){send('error',['Promesa rechazada: '+((e.reason&&(e.reason.message||e.reason))||'desconocida')]);});
})();`;

/* ---------- construcción del HTML ejecutable ---------- */

function attrRegex(tag: string, attr: string): RegExp {
  return new RegExp(`<${tag}\\b[^>]*\\b${attr}\\s*=\\s*["']([^"']*)["'][^>]*>`, "gi");
}

/** Elemento <script src="…"> completo, incluido su </script> de cierre: al
 * inlinear hay que sustituirlo entero o queda un cierre huérfano. */
const SCRIPT_ELEMENT = /(<script\b[^>]*\bsrc\s*=\s*["']([^"']*)["'][^>]*>)\s*<\/script\s*>/gi;

export function buildRunHtml(
  entryPath: string,
  files: Map<string, Uint8Array>
): RunBuildResult {
  const res: RunBuildResult = {
    html: "",
    entryPath,
    missing: [],
    inlined: 0,
    modules: 0,
    bareImports: [],
  };
  const entryData = files.get(entryPath);
  if (!entryData) {
    res.html =
      '<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:2rem">' +
      "<h2>No se encontró la entrada</h2><p>El archivo de entrada desapareció del proyecto.</p></body>";
    return res;
  }
  const get = (p: string) => files.get(p);
  const dirOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");

  let html = decodeText(entryData);
  const baseDir = dirOf(entryPath);

  // Grafo de módulos ES del proyecto: hace falta antes de tocar los <script>.
  // Los <script type="module" src> del HTML son las raíces del recorrido.
  const moduleRoots: string[] = [];
  for (const m of html.matchAll(SCRIPT_ELEMENT)) {
    if (!/\btype\s*=\s*["']module["']/i.test(m[1])) continue;
    const local = localRef(m[2]);
    if (local) moduleRoots.push(resolvePath(baseDir, local));
  }
  const graph = buildModuleGraph(files, moduleRoots);
  res.modules = graph.count;
  res.bareImports = [...graph.bare];
  res.missing.push(...graph.missing);

  // 1) <img>/<source>/<video>/<audio>/<track> src|poster → data URL.
  //    Va primero: así el barrido no vuelve a pasar por el CSS y el JS que se
  //    inlinean después (una cadena «src=...» dentro de un script no es un recurso).
  html = html.replace(
    /\b(src|poster)\s*=\s*["']([^"']+)["']/gi,
    (m, attrName: string, ref: string) => {
      const local = localRef(ref);
      if (!local) return m;
      const p = resolvePath(baseDir, local);
      const data = get(p);
      if (!data) {
        res.missing.push(p); // recurso local que no está en el proyecto
        return m;
      }
      const mime = mimeFor(p);
      if (!mime || data.length > MAX_ASSET) return m; // existe pero no se inlinea
      res.inlined++;
      return `${attrName}="${toDataUrl(data, mime)}"`;
    }
  );

  // 2) <link rel=stylesheet href=local> → <style>
  html = html.replace(attrRegex("link", "href"), (tag, ref: string) => {
    const lower = tag.toLowerCase();
    if (!/rel\s*=\s*["']?stylesheet/i.test(lower)) return tag;
    const local = localRef(ref);
    if (!local) return tag;
    const p = resolvePath(baseDir, local);
    const data = get(p);
    if (!data) {
      res.missing.push(p);
      return tag;
    }
    res.inlined++;
    if (res.inlined > MAX_INLINE) return tag;
    const css = rewriteCssUrls(decodeText(data), dirOf(p), get, res);
    return `<style data-prism-from="${p}">\n${css}\n</style>`;
  });

  // 3) <script src=local> → inline
  html = html.replace(SCRIPT_ELEMENT, (whole, tag: string, ref: string) => {
    const local = localRef(ref);
    if (!local) return whole;
    const p = resolvePath(baseDir, local);
    const data = get(p);
    if (!data) {
      res.missing.push(p);
      return whole;
    }
    res.inlined++;
    if (res.inlined > MAX_INLINE) return whole;
    const typeMatch = tag.match(/\btype\s*=\s*["']([^"']*)["']/i);
    const typeAttr = typeMatch ? ` type="${typeMatch[1]}"` : "";
    // Un módulo no se pega en línea: se pide por su especificador del import map,
    // para que sus propios import relativos sigan resolviéndose.
    if (/\bmodule\b/i.test(typeMatch?.[1] ?? "") && graph.count) {
      return `<script type="module" data-prism-from="${p}">\nimport ${JSON.stringify(MODULE_SCHEME + p)};\n</script>`;
    }
    // «</script>» dentro del código cerraría la etiqueta antes de tiempo
    const code = decodeText(data).replace(/<\/script/gi, "<\\/script");
    return `<script${typeAttr} data-prism-from="${p}">\n${code}\n</script>`;
  });

  // 3 bis) módulos escritos directamente en el HTML: se reescriben sus imports
  html = html.replace(
    /(<script\b[^>]*\btype\s*=\s*["']module["'][^>]*>)([\s\S]*?)(<\/script\s*>)/gi,
    (whole, open: string, body: string, close: string) => {
      if (/\bdata-prism-from=/.test(open) || !body.trim()) return whole;
      const next = rewriteSpecifiers(
        entryPath,
        body,
        (q) => files.has(q),
        (target) => res.missing.push(target),
        (spec) => res.bareImports.push(spec)
      );
      return `${open}${next}${close}`;
    }
  );

  // 4) el import map debe ir antes de que se cargue el primer módulo
  const mapTag = importMapTag(graph);
  if (mapTag) {
    if (/<head[^>]*>/i.test(html)) {
      html = html.replace(/<head[^>]*>/i, (m) => `${m}\n${mapTag}`);
    } else if (/<html[^>]*>/i.test(html)) {
      html = html.replace(/<html[^>]*>/i, (m) => `${m}\n${mapTag}`);
    } else {
      html = `${mapTag}\n${html}`;
    }
  }

  // 5) inyección del puente de consola
  if (/<\/head>/i.test(html)) {
    html = html.replace(/<\/head>/i, `<script>${CONSOLE_BRIDGE}</script>\n</head>`);
  } else if (/<body[^>]*>/i.test(html)) {
    html = html.replace(/<body[^>]*>/i, (m) => `${m}\n<script>${CONSOLE_BRIDGE}</script>`);
  } else {
    html = `<script>${CONSOLE_BRIDGE}</script>\n` + html;
  }

  res.html = html;
  res.missing = [...new Set(res.missing)];
  res.bareImports = [...new Set(res.bareImports)];
  return res;
}

/** Filtra basura típica de ZIPs (macOS, metadatos) */
export function isJunkPath(path: string): boolean {
  return path.startsWith("__MACOSX/") || /(^|\/)\.DS_Store$/i.test(path);
}

/* ---------- navegación por el proyecto ---------- */

/** Nodo del árbol de archivos que se pinta en el panel izquierdo del Sandbox. */
export interface TreeNode {
  /** nombre visible (solo el último segmento) */
  name: string;
  /** ruta completa; en las carpetas, sin barra final */
  path: string;
  dir: boolean;
  /** solo en carpetas: hijos ya ordenados (carpetas primero, luego alfabético) */
  children: TreeNode[];
  /** solo en carpetas: nº de archivos que contiene, incluidos los de subcarpetas */
  count: number;
}

/** Construye el árbol de carpetas a partir de la lista plana de rutas. */
export function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", dir: true, children: [], count: 0 };
  const dirs = new Map<string, TreeNode>([["", root]]);

  const dirNode = (path: string): TreeNode => {
    const existing = dirs.get(path);
    if (existing) return existing;
    const idx = path.lastIndexOf("/");
    const parent = dirNode(idx < 0 ? "" : path.slice(0, idx));
    const node: TreeNode = {
      name: idx < 0 ? path : path.slice(idx + 1),
      path,
      dir: true,
      children: [],
      count: 0,
    };
    parent.children.push(node);
    dirs.set(path, node);
    return node;
  };

  for (const p of [...paths].sort()) {
    const idx = p.lastIndexOf("/");
    const parent = dirNode(idx < 0 ? "" : p.slice(0, idx));
    parent.children.push({
      name: idx < 0 ? p : p.slice(idx + 1),
      path: p,
      dir: false,
      children: [],
      count: 0,
    });
  }

  const finish = (node: TreeNode): number => {
    node.children.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
    node.count = node.children.reduce((n, c) => n + (c.dir ? finish(c) : 1), 0);
    return node.count;
  };
  finish(root);
  return root.children;
}

/** Rutas de todas las carpetas que contienen a «path» (para desplegar el árbol). */
export function ancestorDirs(path: string): string[] {
  const parts = path.split("/");
  parts.pop();
  const out: string[] = [];
  let acc = "";
  for (const p of parts) {
    acc = acc ? `${acc}/${p}` : p;
    out.push(acc);
  }
  return out;
}
