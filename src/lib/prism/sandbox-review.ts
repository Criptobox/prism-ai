/** Prism AI — Revisión del proyecto del Sandbox.
 *
 * Analiza TODO el proyecto cargado (ZIP, repo local o semilla) y devuelve una
 * lista de problemas ordenados por gravedad, pensada para responder a una
 * pregunta concreta: «¿esto está listo para subirlo a GitHub?».
 *
 * Todo es estático y puro (sin DOM, sin red): se puede probar en Node y se
 * ejecuta entero en tu dispositivo. Nada del proyecto sale de aquí.
 *
 * Familias de comprobaciones:
 *   secreto    — claves de API, tokens y claves privadas incrustadas (lo más grave)
 *   privado    — archivos que no deberían acabar en un repo público (.env, *.pem…)
 *   ref        — enlaces locales rotos en HTML/CSS (href, src, url(), @import)
 *   sintaxis   — JSON inválido, llaves/paréntesis desbalanceados en JS y CSS
 *   html       — doctype, charset, viewport, title, lang, alt en imágenes
 *   riesgo     — eval, innerHTML, http:// sin cifrar, debugger
 *   git        — tamaños, colisiones de mayúsculas, rutas inválidas en Windows
 *   proyecto   — falta README, .gitignore, LICENSE o página de entrada
 *   estilo     — TODO/FIXME, console.log, BOM, CRLF
 */

import { extOf, isHtmlPath, isTextPath, localRef, resolvePath } from "./sandbox";

export type ReviewLevel = "error" | "warn" | "info";

export type ReviewFamily =
  | "secreto"
  | "privado"
  | "ref"
  | "sintaxis"
  | "html"
  | "riesgo"
  | "git"
  | "proyecto"
  | "estilo";

export interface Diagnostic {
  level: ReviewLevel;
  family: ReviewFamily;
  /** archivo al que apunta; "" = el proyecto entero */
  file: string;
  /** línea 1-based dentro del archivo, si aplica */
  line?: number;
  message: string;
  /** qué hacer para arreglarlo */
  hint?: string;
}

export interface ReviewReport {
  diagnostics: Diagnostic[];
  counts: Record<ReviewLevel, number>;
  /** archivos de texto analizados */
  scanned: number;
  /** total de archivos del proyecto */
  total: number;
  /** true si no hay ningún «error»: se puede subir con tranquilidad */
  ready: boolean;
}

/** Un archivo del proyecto tal y como lo ve la revisión. */
export interface ReviewFile {
  path: string;
  /** contenido de texto, o null si es binario */
  text: string | null;
  /** tamaño en bytes del archivo real */
  size: number;
}

const LEVEL_RANK: Record<ReviewLevel, number> = { error: 0, warn: 1, info: 2 };

/* ------------------------------------------------------------------ */
/* utilidades                                                          */
/* ------------------------------------------------------------------ */

/** Línea 1-based en la que cae el índice de carácter dado. */
export function lineAt(text: string, index: number): number {
  let line = 1;
  const end = Math.min(index, text.length);
  for (let i = 0; i < end; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/** Sustituye el interior de cadenas, plantillas, regex y comentarios por espacios
 * (misma longitud y mismos saltos de línea) para poder contar delimitadores sin
 * falsos positivos. */
export function maskJs(code: string): string {
  const out = code.split("");
  const blank = (from: number, to: number) => {
    for (let i = Math.max(0, from); i < to && i < out.length; i++) {
      if (out[i] !== "\n") out[i] = " ";
    }
  };
  let i = 0;
  let prevSignificant = "";
  while (i < code.length) {
    const c = code[i];
    const next = code[i + 1];
    if (c === "/" && next === "/") {
      let j = i + 2;
      while (j < code.length && code[j] !== "\n") j++;
      blank(i, j);
      i = j;
      continue;
    }
    if (c === "/" && next === "*") {
      const j = code.indexOf("*/", i + 2);
      const end = j < 0 ? code.length : j + 2;
      blank(i, end);
      i = end;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < code.length) {
        if (code[j] === "\\") {
          j += 2;
          continue;
        }
        if (code[j] === c) break;
        // una comilla sin cerrar no debe tragarse el resto del archivo
        if (c !== "`" && code[j] === "\n") break;
        j++;
      }
      blank(i + 1, j); // se conservan las comillas: no afectan al balance
      i = Math.min(j + 1, code.length);
      prevSignificant = c;
      continue;
    }
    if (c === "/" && (prevSignificant === "" || /[(,=:[!&|?{};+\-*%~^<>]/.test(prevSignificant))) {
      // posible literal de expresión regular
      let j = i + 1;
      let closed = false;
      let inClass = false;
      while (j < code.length) {
        const d = code[j];
        if (d === "\\") {
          j += 2;
          continue;
        }
        if (d === "\n") break;
        if (d === "[") inClass = true;
        else if (d === "]") inClass = false;
        else if (d === "/" && !inClass) {
          closed = true;
          break;
        }
        j++;
      }
      if (closed) {
        blank(i + 1, j);
        i = j + 1;
        prevSignificant = "/";
        continue;
      }
    }
    if (!/\s/.test(c)) prevSignificant = c;
    i++;
  }
  return out.join("");
}

/** Igual que maskJs pero para CSS: solo comentarios de bloque y cadenas. */
export function maskCss(code: string): string {
  const out = code.split("");
  const blank = (from: number, to: number) => {
    for (let i = Math.max(0, from); i < to && i < out.length; i++) {
      if (out[i] !== "\n") out[i] = " ";
    }
  };
  let i = 0;
  while (i < code.length) {
    const c = code[i];
    if (c === "/" && code[i + 1] === "*") {
      const j = code.indexOf("*/", i + 2);
      const end = j < 0 ? code.length : j + 2;
      blank(i, end);
      i = end;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < code.length) {
        if (code[j] === "\\") {
          j += 2;
          continue;
        }
        if (code[j] === c || code[j] === "\n") break;
        j++;
      }
      blank(i + 1, j);
      i = Math.min(j + 1, code.length);
      continue;
    }
    i++;
  }
  return out.join("");
}

/** Equilibrio de (), [] y {} sobre código ya enmascarado.
 * Devuelve el primer desequilibrio encontrado, o null si todo cuadra. */
export function findUnbalanced(
  masked: string
): { index: number; expected: string; found: string } | null {
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  const stack: { ch: string; index: number }[] = [];
  for (let i = 0; i < masked.length; i++) {
    const c = masked[i];
    if (c === "(" || c === "[" || c === "{") stack.push({ ch: c, index: i });
    else if (c === ")" || c === "]" || c === "}") {
      const top = stack.pop();
      if (!top) return { index: i, expected: "", found: c };
      if (top.ch !== pairs[c]) return { index: i, expected: top.ch, found: c };
    }
  }
  const left = stack.pop();
  return left ? { index: left.index, expected: left.ch, found: "" } : null;
}

/* ------------------------------------------------------------------ */
/* secretos                                                            */
/* ------------------------------------------------------------------ */

/** Prefijos inequívocos de credenciales reales de servicios conocidos. */
const SECRET_RULES: { name: string; re: RegExp }[] = [
  { name: "clave de OpenAI", re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/g },
  { name: "clave de Anthropic", re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { name: "clave de OpenRouter", re: /\bsk-or-v1-[A-Za-z0-9]{32,}/g },
  { name: "clave de Google", re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: "token de GitHub", re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/g },
  { name: "token de GitHub de permisos finos", re: /\bgithub_pat_[A-Za-z0-9_]{40,}\b/g },
  { name: "token de Slack", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g },
  { name: "clave de acceso de AWS", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "clave secreta de Stripe", re: /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}/g },
  { name: "token de Hugging Face", re: /\bhf_[A-Za-z0-9]{30,}\b/g },
  { name: "token de bot de Telegram", re: /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/g },
  { name: "clave privada", re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g },
];

/** Asignaciones genéricas del tipo apiKey = "…" con un valor que parece real. */
const GENERIC_SECRET =
  /\b(api[_-]?key|apikey|api[_-]?secret|access[_-]?token|auth[_-]?token|secret[_-]?key|client[_-]?secret|password|passwd|contrase(?:n|ñ)a)\b\s*[:=]\s*["'`]([^"'`\n]{8,})["'`]/gi;

/** Valores que claramente son un hueco por rellenar, no una credencial. */
const PLACEHOLDER = new RegExp(
  "^(?:" +
    "x+|\\*+|\\.+|-+|_+|0+|<.*>|\\{.*\\}|\\$\\{.*\\}|%[a-z_]+%" +
    "|(?:tu|su|mi|your|my|the)[-_ .a-z]*" +
    "|(?:pon|poner|cambia|cambiar|rellena|replace|change|insert|add)[-_ .a-z]*" +
    "|(?:example|ejemplo|sample|demo|dummy|fake|test|placeholder|changeme|todo|none|null" +
    "|undefined|empty|secret|password|apikey|api_key|token|clave|key|value|valor|string" +
    "|abc123|123456|password123)[-_.a-z0-9]*" +
    ")$",
  "i"
);

function looksPlaceholder(value: string): boolean {
  const v = value.trim();
  if (!v || PLACEHOLDER.test(v)) return true;
  if (/^(?:process\.env|import\.meta\.env|os\.environ|Deno\.env)\b/.test(v)) return true;
  if (v.includes("…") || v.includes("...")) return true;
  // sin variedad de caracteres es casi seguro un hueco («aaaaaaaa»)
  return new Set(v).size <= 3;
}

/** Entropía de Shannon por carácter: distingue un token real de una frase. */
export function entropy(s: string): number {
  if (!s.length) return 0;
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let h = 0;
  for (const n of freq.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/* ------------------------------------------------------------------ */
/* archivos que no deberían subirse                                    */
/* ------------------------------------------------------------------ */

const PRIVATE_RULES: { re: RegExp; level: ReviewLevel; what: string; hint: string }[] = [
  {
    re: /(^|\/)\.env(?!\.example|\.sample|\.template)([.\w-]*)$/i,
    level: "error",
    what: "variables de entorno con posibles credenciales",
    hint: "Añádelo a .gitignore y sube solo un .env.example con los valores vacíos.",
  },
  {
    re: /\.(pem|p12|pfx|jks|keystore)$/i,
    level: "error",
    what: "certificado o material criptográfico",
    hint: "Bórralo del proyecto y añádelo a .gitignore.",
  },
  {
    re: /(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/i,
    level: "error",
    what: "clave SSH privada",
    hint: "Bórrala del proyecto y, si alguna vez se subió, revócala.",
  },
  {
    re: /(^|\/)\.npmrc$/i,
    level: "warn",
    what: "configuración de npm (suele llevar _authToken)",
    hint: "Comprueba que no contiene tokens antes de subirlo.",
  },
  {
    re: /(^|\/)(\.git|node_modules|\.next|dist|build|vendor|__pycache__|\.venv)\//i,
    level: "warn",
    what: "carpeta generada o de dependencias",
    hint: "No hace falta en el repositorio: añádela a .gitignore.",
  },
  {
    re: /(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini)$/i,
    level: "info",
    what: "archivo basura del sistema operativo",
    hint: "Añádelo a .gitignore para que no viaje en los commits.",
  },
  {
    re: /\.(log|sqlite|sqlite3)$/i,
    level: "info",
    what: "registro o base de datos local",
    hint: "Suele ser ruido en el repositorio: considera ignorarlo.",
  },
  {
    re: /(^|\/)(\.idea|\.vscode)\//i,
    level: "info",
    what: "configuración personal del editor",
    hint: "Normalmente se ignora, salvo que el equipo la comparta a propósito.",
  },
];

/* ------------------------------------------------------------------ */
/* referencias locales                                                 */
/* ------------------------------------------------------------------ */

export interface RefHit {
  /** ruta ya resuelta respecto a la raíz del proyecto */
  target: string;
  /** texto original de la referencia */
  raw: string;
  index: number;
  attr: string;
}

const HTML_REF_ATTR = /\b(src|href|poster|data-src|srcset)\s*=\s*["']([^"']+)["']/gi;
const CSS_URL = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
const CSS_IMPORT = /@import\s+(?:url\(\s*)?["']?([^"')]+)["']?\s*\)?\s*;/gi;

/** Extrae las referencias locales de un HTML o CSS, ya resueltas a la raíz. */
export function extractRefs(path: string, text: string): RefHit[] {
  const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  const hits: RefHit[] = [];
  const add = (raw: string, index: number, attr: string) => {
    const local = localRef(raw);
    if (!local) return;
    hits.push({ target: resolvePath(dir, local), raw, index, attr });
  };
  const ext = extOf(path);
  if (ext === "html" || ext === "htm") {
    for (const m of text.matchAll(HTML_REF_ATTR)) {
      const attr = m[1].toLowerCase();
      if (attr === "srcset") {
        // «a.png 1x, b.png 2x» → cada candidato por separado
        for (const part of m[2].split(",")) add(part.trim().split(/\s+/)[0], m.index ?? 0, attr);
      } else {
        add(m[2], m.index ?? 0, attr);
      }
    }
    // <style> embebido dentro del HTML
    for (const m of text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
      const base = (m.index ?? 0) + m[0].indexOf(m[1]);
      for (const u of m[1].matchAll(CSS_URL)) add(u[1], base + (u.index ?? 0), "url()");
    }
  } else if (ext === "css") {
    for (const m of text.matchAll(CSS_IMPORT)) add(m[1], m.index ?? 0, "@import");
    for (const m of text.matchAll(CSS_URL)) add(m[1], m.index ?? 0, "url()");
  }
  return hits;
}

/* ------------------------------------------------------------------ */
/* revisión completa                                                   */
/* ------------------------------------------------------------------ */

const MAX_PER_RULE = 20; // no inundar el panel con el mismo aviso repetido
const BIG_FILE = 50 * 1024 * 1024; // GitHub avisa por encima de esto
const HUGE_FILE = 100 * 1024 * 1024; // GitHub lo rechaza
const WINDOWS_INVALID = /[<>:"|?*]/;

/** http:// que de verdad descarga algo. Quedan fuera el desarrollo local y los
 * identificadores de espacio de nombres y DTD (xmlns de los SVG, DOCTYPE…),
 * que nunca se piden por red aunque lo parezcan. */
const HTTP_INSECURE = new RegExp(
  "[\"'(]http://(?!" +
    "localhost|127\\.0\\.0\\.1|0\\.0\\.0\\.0|\\[::1\\]" +
    "|(?:www\\.)?w3\\.org/|purl\\.org/|ns\\.adobe\\.com/|schemas\\.[a-z]" +
    "|(?:www\\.)?inkscape\\.org/|sodipodi\\.sourceforge\\.net/|xml\\.apache\\.org/" +
    "|(?:www\\.)?openarchives\\.org/|creativecommons\\.org/ns" +
    ")",
  "g"
);

export function reviewProject(files: ReviewFile[]): ReviewReport {
  const diagnostics: Diagnostic[] = [];
  const paths = files.map((f) => f.path);
  const known = new Set(paths);
  const push = (d: Diagnostic) => diagnostics.push(d);

  /* --- comprobaciones a nivel de proyecto --- */
  if (files.length && !paths.some(isHtmlPath)) {
    push({
      level: "warn",
      family: "proyecto",
      file: "",
      message: "El proyecto no tiene ninguna página HTML.",
      hint: "El Sandbox ejecuta webs estáticas: añade un index.html para poder probarlo aquí.",
    });
  }
  if (files.length && !paths.some((p) => /^readme(\.md|\.txt)?$/i.test(p))) {
    push({
      level: "info",
      family: "proyecto",
      file: "",
      message: "No hay README en la raíz.",
      hint: "GitHub lo muestra como portada del repositorio: explica qué es y cómo se usa.",
    });
  }
  if (files.length && !known.has(".gitignore")) {
    push({
      level: "warn",
      family: "proyecto",
      file: "",
      message: "No hay .gitignore.",
      hint: "Sin él es fácil subir sin querer .env, node_modules o archivos temporales.",
    });
  }
  if (files.length && !paths.some((p) => /^licen[cs]e(\.md|\.txt)?$/i.test(p))) {
    push({
      level: "info",
      family: "proyecto",
      file: "",
      message: "No hay archivo de licencia.",
      hint: "Sin licencia nadie sabe con qué permisos puede usar tu código.",
    });
  }

  /* --- colisiones de mayúsculas (rompen el clon en Windows y macOS) --- */
  const byLower = new Map<string, string[]>();
  for (const p of paths) {
    const k = p.toLowerCase();
    byLower.set(k, [...(byLower.get(k) ?? []), p]);
  }
  for (const group of byLower.values()) {
    if (group.length > 1) {
      push({
        level: "error",
        family: "git",
        file: group[0],
        message: `Varios archivos con el mismo nombre salvo mayúsculas: ${group.join(", ")}.`,
        hint: "En Windows y macOS se pisan entre sí al clonar. Renombra uno.",
      });
    }
  }

  /* --- por archivo --- */
  let scanned = 0;
  const ruleCount = new Map<string, number>();
  const budget = (key: string): boolean => {
    const n = (ruleCount.get(key) ?? 0) + 1;
    ruleCount.set(key, n);
    return n <= MAX_PER_RULE;
  };

  for (const f of files) {
    const { path, text, size } = f;

    /* rutas y tamaños */
    if (WINDOWS_INVALID.test(path)) {
      push({
        level: "error",
        family: "git",
        file: path,
        message: "La ruta tiene caracteres que Windows no admite.",
        hint: 'Evita < > : " | ? * en los nombres de archivo.',
      });
    }
    if (size > HUGE_FILE) {
      push({
        level: "error",
        family: "git",
        file: path,
        message: `Archivo de ${Math.round(size / 1048576)} MB: GitHub rechaza los mayores de 100 MB.`,
        hint: "Usa Git LFS o deja el archivo fuera del repositorio.",
      });
    } else if (size > BIG_FILE) {
      push({
        level: "warn",
        family: "git",
        file: path,
        message: `Archivo de ${Math.round(size / 1048576)} MB: GitHub avisa por encima de 50 MB.`,
        hint: "Comprímelo o considera Git LFS si va a cambiar a menudo.",
      });
    }

    for (const rule of PRIVATE_RULES) {
      if (rule.re.test(path) && budget(`priv:${rule.what}`)) {
        push({
          level: rule.level,
          family: "privado",
          file: path,
          message: `No conviene subir esto a GitHub: ${rule.what}.`,
          hint: rule.hint,
        });
      }
    }

    if (text === null) continue;
    scanned++;

    /* --- secretos --- */
    for (const rule of SECRET_RULES) {
      for (const m of text.matchAll(rule.re)) {
        if (!budget(`sec:${rule.name}`)) break;
        push({
          level: "error",
          family: "secreto",
          file: path,
          line: lineAt(text, m.index ?? 0),
          message: `Parece una ${rule.name} incrustada en el código.`,
          hint: "Bórrala antes de subir y revócala en el proveedor: los repos públicos se rastrean en segundos.",
        });
      }
    }
    for (const m of text.matchAll(GENERIC_SECRET)) {
      const value = m[2];
      if (looksPlaceholder(value) || entropy(value) < 3) continue;
      if (!budget("sec:generico")) break;
      push({
        level: "warn",
        family: "secreto",
        file: path,
        line: lineAt(text, m.index ?? 0),
        message: `«${m[1]}» tiene un valor que parece una credencial real.`,
        hint: "Léelo de una variable de entorno en vez de escribirlo en el código.",
      });
    }

    /* --- referencias locales rotas --- */
    if (isHtmlPath(path) || extOf(path) === "css") {
      const seen = new Set<string>();
      for (const hit of extractRefs(path, text)) {
        if (known.has(hit.target) || seen.has(hit.target)) continue;
        seen.add(hit.target);
        if (!budget("ref")) break;
        push({
          level: "error",
          family: "ref",
          file: path,
          line: lineAt(text, hit.index),
          message: `${hit.attr}="${hit.raw}" apunta a «${hit.target}», que no está en el proyecto.`,
          hint: "Corrige la ruta o añade el archivo: al publicarlo se verá como un recurso roto.",
        });
      }
    }

    /* --- sintaxis --- */
    const ext = extOf(path);
    if (ext === "json") {
      try {
        JSON.parse(text);
      } catch (e) {
        push({
          level: "error",
          family: "sintaxis",
          file: path,
          message: `JSON inválido: ${e instanceof Error ? e.message : String(e)}`,
          hint: "Revisa comas sobrantes, comillas simples o comentarios (JSON no los admite).",
        });
      }
    }
    if (ext === "js" || ext === "mjs" || ext === "cjs" || ext === "jsx") {
      const bad = findUnbalanced(maskJs(text));
      if (bad) {
        push({
          level: "error",
          family: "sintaxis",
          file: path,
          line: lineAt(text, bad.index),
          message: bad.found
            ? `Cierre «${bad.found}» sin su apertura correspondiente.`
            : `«${bad.expected}» abierto y nunca cerrado.`,
          hint: "Los delimitadores no cuadran: el navegador no llegará a ejecutar el archivo.",
        });
      }
    }
    if (ext === "css") {
      const bad = findUnbalanced(maskCss(text).replace(/[()[\]]/g, " "));
      if (bad) {
        push({
          level: "error",
          family: "sintaxis",
          file: path,
          line: lineAt(text, bad.index),
          message: bad.found ? "Hay un «}» de más." : "Hay un bloque «{» sin cerrar.",
          hint: "A partir de ahí el navegador descarta el resto de la hoja de estilos.",
        });
      }
    }

    /* --- HTML --- */
    if (isHtmlPath(path)) {
      const head = text.slice(0, 4000);
      if (!/<!doctype\s+html/i.test(head)) {
        push({
          level: "warn",
          family: "html",
          file: path,
          line: 1,
          message: "Falta <!doctype html> al principio.",
          hint: "Sin él los navegadores entran en «modo peculiar» y el diseño puede descolocarse.",
        });
      }
      if (!/<meta[^>]+charset/i.test(head)) {
        push({
          level: "warn",
          family: "html",
          file: path,
          line: 1,
          message: 'Falta <meta charset="utf-8">.',
          hint: "Sin ello los acentos y las eñes pueden verse como símbolos raros.",
        });
      }
      if (!/<meta[^>]+name\s*=\s*["']viewport/i.test(head)) {
        push({
          level: "warn",
          family: "html",
          file: path,
          line: 1,
          message: "Falta la etiqueta viewport.",
          hint: 'Añade <meta name="viewport" content="width=device-width, initial-scale=1"> o se verá diminuto en el móvil.',
        });
      }
      const title = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (!title || !title[1].trim()) {
        push({
          level: "warn",
          family: "html",
          file: path,
          line: title ? lineAt(text, title.index ?? 0) : 1,
          message: "La página no tiene <title> con texto.",
          hint: "Es lo que se ve en la pestaña del navegador y en los resultados de búsqueda.",
        });
      }
      if (!/<html[^>]+lang\s*=/i.test(head)) {
        push({
          level: "info",
          family: "html",
          file: path,
          line: 1,
          message: 'Al <html> le falta el atributo lang (por ejemplo lang="es").',
          hint: "Ayuda a los lectores de pantalla y al traductor del navegador.",
        });
      }
      for (const m of text.matchAll(/<img\b[^>]*>/gi)) {
        if (/\balt\s*=/i.test(m[0])) continue;
        if (!budget("html:alt")) break;
        push({
          level: "info",
          family: "html",
          file: path,
          line: lineAt(text, m.index ?? 0),
          message: "Imagen sin atributo alt.",
          hint: 'Describe la imagen para quien use un lector de pantalla (alt="" si es decorativa).',
        });
      }
    }

    /* --- riesgos --- */
    if (isTextPath(path) && ext !== "md") {
      for (const m of text.matchAll(/\bdebugger\b\s*;?/g)) {
        if (!budget("riesgo:debugger")) break;
        push({
          level: "warn",
          family: "riesgo",
          file: path,
          line: lineAt(text, m.index ?? 0),
          message: "Queda un «debugger» en el código.",
          hint: "Detiene la página en seco si alguien tiene abiertas las herramientas de desarrollo.",
        });
      }
      for (const m of text.matchAll(/\beval\s*\(/g)) {
        if (!budget("riesgo:eval")) break;
        push({
          level: "warn",
          family: "riesgo",
          file: path,
          line: lineAt(text, m.index ?? 0),
          message: "Uso de eval().",
          hint: "Ejecuta texto como código: si viene de fuera, es una puerta abierta.",
        });
      }
      for (const m of text.matchAll(/\.innerHTML\s*=(?!=)/g)) {
        if (!budget("riesgo:innerHTML")) break;
        push({
          level: "info",
          family: "riesgo",
          file: path,
          line: lineAt(text, m.index ?? 0),
          message: "Asignación a innerHTML.",
          hint: "Con contenido de terceros permite inyectar scripts: usa textContent si es solo texto.",
        });
      }
      for (const m of text.matchAll(HTTP_INSECURE)) {
        if (!budget("riesgo:http")) break;
        push({
          level: "warn",
          family: "riesgo",
          file: path,
          line: lineAt(text, m.index ?? 0),
          message: "Recurso enlazado por http:// sin cifrar.",
          hint: "En una página servida por https el navegador lo bloqueará: cámbialo a https://.",
        });
      }
    }

    /* --- estilo --- */
    if (text.charCodeAt(0) === 0xfeff) {
      push({
        level: "info",
        family: "estilo",
        file: path,
        line: 1,
        message: "El archivo empieza con BOM (marca de orden de bytes).",
        hint: "Puede colarse como carácter invisible al principio de la página.",
      });
    }
    if (text.includes("\r\n") && budget("estilo:crlf")) {
      push({
        level: "info",
        family: "estilo",
        file: path,
        message: "Saltos de línea de Windows (CRLF).",
        hint: "Git puede marcar el archivo entero como modificado. Normaliza a LF o configura core.autocrlf.",
      });
    }
    for (const m of text.matchAll(/\b(TODO|FIXME|XXX|HACK)\b/g)) {
      if (!budget("estilo:todo")) break;
      push({
        level: "info",
        family: "estilo",
        file: path,
        line: lineAt(text, m.index ?? 0),
        message: `Queda un ${m[1]} pendiente.`,
        hint: "Resuélvelo o anótalo como incidencia antes de publicar.",
      });
    }
    if (ext === "js" || ext === "mjs" || ext === "cjs") {
      for (const m of text.matchAll(/\bconsole\.(log|debug)\s*\(/g)) {
        if (!budget("estilo:console")) break;
        push({
          level: "info",
          family: "estilo",
          file: path,
          line: lineAt(text, m.index ?? 0),
          message: `Queda un console.${m[1]}().`,
          hint: "Está bien mientras desarrollas; quítalo antes de publicar si ya no aporta.",
        });
      }
    }
  }

  diagnostics.sort(
    (a, b) =>
      LEVEL_RANK[a.level] - LEVEL_RANK[b.level] ||
      a.file.localeCompare(b.file) ||
      (a.line ?? 0) - (b.line ?? 0)
  );

  const counts: Record<ReviewLevel, number> = { error: 0, warn: 0, info: 0 };
  for (const d of diagnostics) counts[d.level]++;

  return { diagnostics, counts, scanned, total: files.length, ready: counts.error === 0 };
}
