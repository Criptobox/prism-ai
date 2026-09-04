/** Prism AI — Mapa del proyecto: memoria compacta de lo que la IA va construyendo.
 * Se deriva localmente del HTML generado (o lo actualiza el propio modelo vía
 * <project-map>) y se inyecta en el system prompt de los turnos siguientes para
 * que la IA "recuerde" el proyecto sin releer todo el código → menos tokens.
 *
 * Edición Obsidian: RELACIONES reales entre archivos (a href / script src /
 * link href), entradas de assets css/js, grafo de nodos (buildGraph), notas de
 * memoria e historial de versiones del mapa — inspirado en obsidian.md.
 */
import type {
  ChatMessage,
  MapSnapshot,
  ProjectFileEntry,
  ProjectMap,
} from "./types";

const FENCE_RE = /```([^\n`]*)\n([\s\S]*?)(?:```|$)/g;

const TECH_HINTS: Array<[RegExp, string]> = [
  [/cdn\.tailwindcss|tailwindcss/i, "Tailwind (CDN)"],
  [/chart\.js|chartjs/i, "Chart.js"],
  [/<canvas[\s>]/i, "Canvas"],
  [/localstorage/i, "localStorage"],
  [/three\.js/i, "Three.js"],
  [/<video[\s>]/i, "Vídeo"],
  [/service[- ]?worker|manifest/i, "PWA"],
];

/** Archivos del mapa que caben en el bloque del prompt.
 *
 * Se exporta porque el resumen de «contexto usado» tiene que contar los que
 * DE VERDAD viajaron: si el mapa tiene cuarenta y entran doce, decir «40»
 * sería mentir con la verdad. */
export const MAX_FILES_PROMPT = 12;
const MAX_FILES = MAX_FILES_PROMPT;
const MAX_FEATURES = 8;
/** Ídem con las notas de memoria. */
export const MAX_NOTES_PROMPT = 10;
const MAX_NOTES = MAX_NOTES_PROMPT;
const MAX_HISTORY = 6;

/* ------------------------------------------------------------------ */
/* Utilidades de extracción                                            */
/* ------------------------------------------------------------------ */

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function basename(p: string): string {
  const clean = p.split(/[?#]/)[0].replace(/^\.\//, "");
  const parts = clean.split("/");
  return parts[parts.length - 1] || clean;
}

/** Extrae los bloques de código relevantes (cercados o documento suelto) */
function codeBlocks(content: string): Array<{ lang: string; code: string }> {
  const out: Array<{ lang: string; code: string }> = [];
  FENCE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FENCE_RE.exec(content))) {
    const code = (m[2] ?? "").trim();
    if (code.length > 40) out.push({ lang: (m[1] ?? "").trim().toLowerCase(), code });
  }
  const loose = content.search(/<!doctype\s+html|<html[\s>]/i);
  if (loose >= 0) out.push({ lang: "html", code: content.slice(loose).trim() });
  return out;
}

function looksLikePage(code: string): boolean {
  return /<!doctype\s+html|<html[\s>]|<(?:body|main|section|article|div)[\s>]/i.test(code);
}

/** Referencias locales de un documento HTML: a href, script src, link href… */
export function extractRefs(code: string): string[] {
  const out = new Set<string>();
  const RE =
    /(?:<a\b[^>]*?\bhref\s*=\s*|<script\b[^>]*?\bsrc\s*=\s*|<link\b[^>]*?\bhref\s*=\s*|<img\b[^>]*?\bsrc\s*=\s*|<source\b[^>]*?\bsrc\s*=\s*)["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = RE.exec(code))) {
    const raw = m[1].trim();
    if (!raw) continue;
    if (/^(https?:)?\/\//i.test(raw) || /^(data:|mailto:|tel:|blob:|javascript:|#)/i.test(raw)) continue;
    if (raw.startsWith("#")) continue;
    const name = basename(raw);
    if (name && !name.startsWith(".") && /\.(html?|css|m?js|svg|png|jpe?g|gif|webp|ico|json)$/i.test(name)) {
      out.add(name);
    }
  }
  return [...out];
}

/** Anclas <a href> con su texto — para resolver páginas nombradas por título */
export function extractAnchors(code: string): Array<{ href: string; text: string }> {
  const out: Array<{ href: string; text: string }> = [];
  for (const m of code.matchAll(/<a\b[^>]*?\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const raw = m[1].trim();
    if (!raw || /^(https?:)?\/\//i.test(raw) || /^(data:|mailto:|tel:|blob:|javascript:|#)/i.test(raw)) continue;
    const text = stripTags(m[2]).slice(0, 60);
    out.push({ href: basename(raw), text });
  }
  return out;
}

/** Funcionalidades dentro de UN archivo (h2/h3 y botones) */
function featuresOf(code: string): string[] {
  const set = new Set<string>();
  for (const h of code.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi)) {
    const t = stripTags(h[1]);
    if (t && t.length >= 3 && t.length <= 40) set.add(t);
  }
  for (const b of code.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/gi)) {
    const t = stripTags(b[1]);
    if (t && t.length >= 2 && t.length <= 24) set.add(`Botón «${t}»`);
  }
  return [...set].slice(0, 6);
}

function techOf(code: string): string[] {
  return TECH_HINTS.filter(([re]) => re.test(code)).map(([, n]) => n);
}

/* ------------------------------------------------------------------ */
/* Derivación del mapa                                                 */
/* ------------------------------------------------------------------ */

/**
 * Deriva el mapa a partir del ÚLTIMO contenido generado y lo fusiona con el
 * mapa previo de la sesión (memoria acumulativa). Devuelve null si el contenido
 * no parece parte de un proyecto web.
 *
 * Novedad Obsidian: páginas + assets referenciados (css/js), y por archivo sus
 * links, funcionalidades y tech → alimenta el grafo de relaciones.
 */
export function deriveProjectMap(
  content: string,
  previous?: ProjectMap | null
): ProjectMap | null {
  const blocks = codeBlocks(content);
  const pages = blocks.filter((b) => b.lang !== "css" && !/^(js|javascript|ts|typescript|mjs)$/.test(b.lang) && looksLikePage(b.code));
  if (!pages.length) return previous ?? null;

  // 1) páginas html: entradas con título y anclas para resolver relaciones
  const pageEntries: ProjectFileEntry[] = [];
  const pageAnchors: Array<Map<string, string>> = [];
  for (const { code } of pages) {
    const title = code.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim();
    const h1 = stripTags(code.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "");
    const nav = stripTags(code.match(/<nav[^>]*>([\s\S]*?)<\/nav>/i)?.[1] ?? "").slice(0, 60);
    const name = (title || `pagina-${pageEntries.length + 1}`).replace(/[^\w.\-áéíóúüñ ]/gi, "").slice(0, 60);
    pageEntries.push({
      name,
      kind: "html",
      summary: (h1 || nav || "página generada").slice(0, 90),
      features: featuresOf(code),
      tech: techOf(code),
    });
    const anchors = new Map<string, string>();
    for (const a of extractAnchors(code)) {
      if (/\.html?$/i.test(a.href) && a.text && !anchors.has(a.href.toLowerCase())) {
        anchors.set(a.href.toLowerCase(), a.text);
      }
    }
    pageAnchors.push(anchors);
  }

  // 2) assets referenciados (css/js) se vuelven entradas del mapa
  const referenced = new Map<string, Set<string>>(); // basename → páginas que lo referencian
  for (const { code } of pages) {
    for (const r of extractRefs(code)) {
      if (/\.html?$/i.test(r)) continue;
      const set = referenced.get(r.toLowerCase()) ?? new Set<string>();
      set.add(r);
      referenced.set(r.toLowerCase(), set);
    }
  }
  const cssFences = blocks.filter((b) => b.lang === "css");
  const jsFences = blocks.filter((b) => /^(js|javascript|ts|typescript|mjs)$/.test(b.lang));
  let cssIdx = 0;
  let jsIdx = 0;
  for (const originals of referenced.values()) {
    const name = [...originals][0];
    const kind = /\.css$/i.test(name) ? "css" : "js";
    let summary = "recurso del proyecto";
    let tech: string[] = [];
    if (kind === "css" && cssIdx < cssFences.length) {
      const fence = cssFences[cssIdx++];
      summary = "hoja de estilos del proyecto";
      tech = techOf(fence.code);
    } else if (kind === "js" && jsIdx < jsFences.length) {
      const fence = jsFences[jsIdx++];
      summary = "lógica del proyecto";
      tech = techOf(fence.code);
    } else {
      summary = `recurso enlazado desde ${[...pageEntries.slice(0, 2).map((p) => p.name)].join(", ")}`;
    }
    pageEntries.push({ name, kind, summary, features: [], tech });
  }

  // 3) resolver RELACIONES por página (estilo Obsidian):
  //    a) basename exacto · b) convención index.html → portada · c) texto del ancla = título
  const byName = new Map<string, ProjectFileEntry>();
  for (const f of pageEntries) byName.set(f.name.toLowerCase(), f);
  const home = pageEntries[0];
  for (let i = 0; i < pages.length; i++) {
    const entry = pageEntries[i];
    const resolved = new Set<string>();
    const lowSelf = entry.name.toLowerCase();
    for (const ref of extractRefs(pages[i].code)) {
      const low = ref.toLowerCase();
      if (low === lowSelf) continue;
      const direct = byName.get(low);
      if (direct) {
        resolved.add(direct.name);
        continue;
      }
      if (/\.html?$/i.test(low)) {
        if (/^index\.html?$/.test(low) && home && home.name.toLowerCase() !== lowSelf) {
          resolved.add(home.name);
          continue;
        }
        const text = pageAnchors[i].get(low);
        const byTitle = text ? byName.get(text.toLowerCase()) : undefined;
        if (byTitle && byTitle.kind === "html" && byTitle.name.toLowerCase() !== lowSelf) {
          resolved.add(byTitle.name);
        }
      }
    }
    entry.links = [...resolved];
  }

  // fusionar archivos: los nuevos sustituyen por nombre, se conservan los previos
  const merged = new Map<string, ProjectFileEntry>();
  for (const f of previous?.files ?? []) merged.set(f.name.toLowerCase(), f);
  for (const f of pageEntries) merged.set(f.name.toLowerCase(), f);

  // funcionalidades globales: unión de las por-archivo + las previas
  const features = new Set<string>(previous?.features ?? []);
  for (const f of pageEntries) for (const ft of f.features ?? []) features.add(ft);
  const tech = techOf(content);
  if (tech.length) features.add(`Tech: ${tech.join(", ")}`);

  const first = pageEntries[0];
  return {
    name: previous?.name ?? first?.name ?? "Proyecto",
    description: previous?.description ?? first?.summary ?? "",
    files: [...merged.values()].slice(-MAX_FILES),
    features: [...features].slice(0, MAX_FEATURES),
    notes: previous?.notes,
    history: previous?.history,
    updatedAt: Date.now(),
  };
}

/** Mapa acumulado de todos los assistant de la sesión (para inyección inmediata) */
export function deriveMapFromMessages(messages: ChatMessage[]): ProjectMap | null {
  let map: ProjectMap | null = null;
  const assistants = messages.filter((m) => m.role === "assistant" && !m.error && m.content);
  for (const m of assistants.slice(-20)) {
    map = deriveProjectMap(m.content, map);
  }
  return map;
}

/** Mapa emitido por el propio modelo vía <project-map>{…}</project-map> */
export function parseMapJson(json: string): ProjectMap | null {
  try {
    const raw = JSON.parse(json) as Partial<ProjectMap>;
    if (!raw || typeof raw !== "object") return null;
    const files = Array.isArray(raw.files)
      ? raw.files
          .filter((f): f is ProjectFileEntry => !!f && typeof f.name === "string")
          .slice(0, MAX_FILES)
          .map((f) => ({
            name: String(f.name).slice(0, 80),
            kind: String(f.kind ?? "otro").slice(0, 12),
            summary: String(f.summary ?? "").slice(0, 120),
            links: Array.isArray(f.links)
              ? f.links.filter((l): l is string => typeof l === "string").slice(0, 12)
              : undefined,
            features: Array.isArray(f.features)
              ? f.features.filter((x): x is string => typeof x === "string").slice(0, 6)
              : undefined,
            tech: Array.isArray(f.tech)
              ? f.tech.filter((x): x is string => typeof x === "string").slice(0, 6)
              : undefined,
          }))
      : [];
    const features = Array.isArray(raw.features)
      ? raw.features.filter((f): f is string => typeof f === "string").slice(0, MAX_FEATURES)
      : [];
    const notes = Array.isArray(raw.notes)
      ? raw.notes.filter((n): n is string => typeof n === "string").slice(0, MAX_NOTES)
      : undefined;
    return {
      name: String(raw.name ?? "Proyecto").slice(0, 80),
      description: String(raw.description ?? "").slice(0, 160),
      files,
      features,
      notes,
      history: raw.history,
      updatedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

/** Fusiona el mapa del modelo con el existente (gana el del modelo) */
export function mergeProjectMap(prev: ProjectMap | null, next: ProjectMap): ProjectMap {
  const features = new Set([...(prev?.features ?? []), ...next.features]);
  const notes = dedupe([...(prev?.notes ?? []), ...(next.notes ?? [])]).slice(0, MAX_NOTES);
  const byName = new Map<string, ProjectFileEntry>();
  for (const f of prev?.files ?? []) byName.set(f.name.toLowerCase(), f);
  for (const f of next.files) {
    const old = byName.get(f.name.toLowerCase());
    byName.set(f.name.toLowerCase(), {
      ...f,
      // si el modelo no da relaciones, conserva las derivadas antes
      links: f.links?.length ? f.links : old?.links,
      features: f.features?.length ? f.features : old?.features,
      tech: f.tech?.length ? f.tech : old?.tech,
    });
  }
  return {
    name: next.name || prev?.name || "Proyecto",
    description: next.description || prev?.description || "",
    files: [...byName.values()].slice(-MAX_FILES),
    features: [...features].slice(0, MAX_FEATURES),
    notes: notes.length ? notes : prev?.notes,
    history: next.history ?? prev?.history,
    updatedAt: Date.now(),
  };
}

/* ------------------------------------------------------------------ */
/* Notas de memoria (estilo Obsidian)                                  */
/* ------------------------------------------------------------------ */

function dedupe(list: string[]): string[] {
  return [...new Set(list.map((s) => s.trim()).filter(Boolean))];
}

export function addNote(map: ProjectMap, text: string): ProjectMap {
  const notes = dedupe([...(map.notes ?? []), text]).slice(0, MAX_NOTES);
  return { ...map, notes, updatedAt: Date.now() };
}

export function removeNote(map: ProjectMap, index: number): ProjectMap {
  const notes = (map.notes ?? []).filter((_, i) => i !== index);
  return { ...map, notes, updatedAt: Date.now() };
}

/* ------------------------------------------------------------------ */
/* Historial del mapa (inspirado en el versionado de Obsidian)          */
/* ------------------------------------------------------------------ */

function signature(map: ProjectMap): string {
  return JSON.stringify({
    n: map.name,
    d: map.description,
    f: map.files.map((f) => [f.name, f.summary, f.links?.join(">") ?? ""]),
    x: map.features,
    o: map.notes ?? [],
  });
}

function diffLabel(prev: ProjectMap, next: ProjectMap): string {
  const prevFiles = new Set(prev.files.map((f) => f.name.toLowerCase()));
  const nextFiles = new Set(next.files.map((f) => f.name.toLowerCase()));
  const addedF = next.files.filter((f) => !prevFiles.has(f.name.toLowerCase())).length;
  const removedF = prev.files.filter((f) => !nextFiles.has(f.name.toLowerCase())).length;
  const prevFeat = new Set(prev.features);
  const addedX = next.features.filter((f) => !prevFeat.has(f)).length;
  const prevNotes = new Set((prev.notes ?? []).map((n) => n.toLowerCase()));
  const addedN = (next.notes ?? []).filter((n) => !prevNotes.has(n.toLowerCase())).length;
  const parts: string[] = [];
  if (addedF) parts.push(`+${addedF} archivo${addedF > 1 ? "s" : ""}`);
  if (removedF) parts.push(`−${removedF}`);
  if (addedX) parts.push(`+${addedX} funcionalidad${addedX > 1 ? "es" : ""}`);
  if (addedN) parts.push(`+${addedN} nota${addedN > 1 ? "s" : ""}`);
  return parts.length ? parts.join(" · ") : "actualizado";
}

/** Registra una instantánea de `prev` en el historial de `next` si cambió algo */
export function withHistory(prev: ProjectMap | null, next: ProjectMap): ProjectMap {
  if (!prev) return next;
  if (signature(prev) === signature(next)) return { ...next, history: prev.history };
  const snap: MapSnapshot = {
    at: Date.now(),
    label: diffLabel(prev, next),
    name: prev.name,
    description: prev.description,
    files: prev.files,
    features: prev.features,
    notes: prev.notes ?? [],
  };
  return { ...next, history: [snap, ...(prev.history ?? [])].slice(0, MAX_HISTORY) };
}

/* ------------------------------------------------------------------ */
/* Grafo de relaciones (estilo Obsidian)                               */
/* ------------------------------------------------------------------ */

export type GraphNodeType = "file" | "feature" | "tech" | "note";

export interface GraphNode {
  id: string;
  label: string;
  type: GraphNodeType;
  /** subtipo de archivo: html | css | js… */
  kind?: string;
  summary?: string;
  degree: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  /** link = referencia entre archivos · feat = funcionalidad · tech = tecnología */
  kind: "link" | "feat" | "tech";
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Construye el grafo nodo→arista del mapa (función pura, testeable) */
export function buildGraph(map: ProjectMap | null | undefined): GraphData {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  if (!map) return { nodes, edges };

  const fileNames = new Set(map.files.map((f) => f.name.toLowerCase()));
  const degree = new Map<string, number>();
  const bump = (id: string) => degree.set(id, (degree.get(id) ?? 0) + 1);
  const seen = new Set<string>();
  const push = (source: string, target: string, kind: GraphEdge["kind"]) => {
    const key = `${source.toLowerCase()}|${target.toLowerCase()}|${kind}`;
    if (source.toLowerCase() === target.toLowerCase() || seen.has(key)) return;
    seen.add(key);
    edges.push({ source, target, kind });
    bump(source);
    bump(target);
  };

  for (const f of map.files) {
    const id = f.name;
    nodes.push({ id, label: f.name, type: "file", kind: f.kind, summary: f.summary, degree: 0 });
    for (const l of f.links ?? []) {
      const target = map.files.find((x) => x.name.toLowerCase() === l.toLowerCase());
      if (target) push(id, target.name, "link");
    }
    for (const ft of f.features ?? []) {
      if (map.features.includes(ft)) push(id, ft, "feat");
    }
    for (const t of f.tech ?? []) push(id, t, "tech");
  }

  // nodos de funcionalidades (solo los alcanzables o globales) y tech
  const featIds = new Set(edges.filter((e) => e.kind === "feat").map((e) => e.target));
  for (const ft of map.features) {
    if (featIds.has(ft)) {
      nodes.push({ id: ft, label: ft, type: "feature", degree: 0 });
    }
  }
  const techIds = new Set(edges.filter((e) => e.kind === "tech").map((e) => e.target));
  for (const t of techIds) {
    nodes.push({ id: t, label: t, type: "tech", degree: 0 });
  }
  // las notas son nodos sueltos (huérfanos, como en Obsidian)
  for (const n of dedupe(map.notes ?? [])) {
    nodes.push({ id: n, label: n, type: "note", degree: 0 });
  }

  for (const n of nodes) n.degree = degree.get(n.id) ?? 0;
  return { nodes, edges };
}

/** Relaciones de un archivo: enlaces salientes y referenciado por (backlinks) */
export function fileRelations(
  map: ProjectMap,
  name: string
): { outgoing: string[]; incoming: string[] } {
  const low = name.toLowerCase();
  const outgoing =
    map.files
      .find((f) => f.name.toLowerCase() === low)
      ?.links?.filter((l) => map.files.some((x) => x.name.toLowerCase() === l.toLowerCase())) ?? [];
  const incoming = map.files
    .filter((f) => f.name.toLowerCase() !== low)
    .filter((f) => (f.links ?? []).some((l) => l.toLowerCase() === low))
    .map((f) => f.name);
  return { outgoing, incoming };
}

/* ------------------------------------------------------------------ */
/* Inyección en el system prompt                                       */
/* ------------------------------------------------------------------ */

/** Bloque compacto para el system prompt (≤ ~1800 chars = decenas de tokens) */
export function renderMapForPrompt(map: ProjectMap | null | undefined): string | null {
  if (!map || (!map.files.length && !map.features.length)) return null;
  const lines: string[] = ["## MAPA DEL PROYECTO ACTUAL (ya existe — no lo repitas)"];
  lines.push(`Proyecto: ${map.name}${map.description ? ` — ${map.description}` : ""}`);
  if (map.files.length) {
    lines.push(
      "Archivos:\n" +
        map.files
          .slice(0, MAX_FILES)
          .map((f) => {
            const links = (f.links ?? []).filter((l) =>
              map.files.some((x) => x.name.toLowerCase() === l.toLowerCase())
            );
            const rel = links.length ? ` — conecta con: ${links.join(", ")}` : "";
            return `- ${f.name} (${f.kind}): ${f.summary}${rel}`;
          })
          .join("\n")
    );
  }
  if (map.features.length) {
    lines.push(
      "Funcionalidades ya implementadas:\n" +
        map.features.slice(0, MAX_FEATURES).map((f) => `- ${f}`).join("\n")
    );
  }
  if (map.notes?.length) {
    lines.push(
      "Notas de memoria (decisiones del usuario — respétalas):\n" +
        map.notes.slice(0, MAX_NOTES).map((n) => `- ${n}`).join("\n")
    );
  }
  lines.push(
    "Al pedir cambios: entrega SOLO el/los archivos que modifiques (completos) y conserva el resto tal cual."
  );
  let text = lines.join("\n\n");
  if (text.length > 1800) text = text.slice(0, 1770) + "\n…";
  return text;
}

/* ------------------------------------------------------------------ */
/* Consulta desde el agente (tool `ask_memory`)                        */
/* ------------------------------------------------------------------ */

/** Tope por defecto de resultados de `buscarEnMapa`. */
export const MAX_RESULTADOS_MEMORIA = 5;

/** De dónde salió cada respuesta, para que el modelo (y el usuario) sepan si
 * es una decisión del usuario o algo que Prism dedujo del código. */
export type OrigenMemoria = "nota" | "archivo" | "funcionalidad" | "tecnologia" | "proyecto";

export interface ResultadoMemoria {
  origen: OrigenMemoria;
  /** el título de lo encontrado: nombre del archivo, la funcionalidad… */
  titulo: string;
  /** el contenido en sí */
  texto: string;
  /** puntuación interna; se expone porque el orden importa y así es auditable */
  puntos: number;
}

const ETIQUETA_ORIGEN: Record<OrigenMemoria, string> = {
  nota: "Nota de memoria (decisión del usuario)",
  archivo: "Archivo",
  funcionalidad: "Funcionalidad implementada",
  tecnologia: "Tecnología detectada",
  proyecto: "Proyecto",
};

/** Palabras de la consulta que valen para buscar. Se quitan las de relleno:
 * sin esto «¿qué decidí sobre el color?» casaba con TODO lo que contuviera
 * «que» o «sobre», que es prácticamente cualquier frase. */
const VACIAS = new Set([
  "que", "qué", "cual", "cuál", "cuales", "cuáles", "como", "cómo", "donde", "dónde",
  "cuando", "cuándo", "quien", "quién", "por", "para", "con", "sin", "sobre", "del",
  "las", "los", "una", "uno", "unos", "unas", "the", "and", "for", "what", "which",
  "hay", "tiene", "tengo", "usamos", "uso", "usa", "esta", "este", "esto", "estos",
  "decidi", "decidí", "dije", "dijimos", "acordamos", "era", "son", "fue",
]);

/** Normaliza para comparar: minúsculas y sin tildes. «diseño» y «diseno» son
 * la misma palabra para quien busca. */
function normalizar(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function terminosDe(q: string): string[] {
  return [
    ...new Set(
      normalizar(q)
        .split(/[^a-z0-9ñ.\-_]+/)
        .filter((t) => t.length >= 3 && !VACIAS.has(t))
    ),
  ];
}

/** Cuántos términos de la consulta aparecen en el texto, y cuántas veces. */
function puntuar(texto: string, terminos: string[]): number {
  if (!terminos.length) return 0;
  const t = normalizar(texto);
  let puntos = 0;
  for (const term of terminos) {
    let desde = 0;
    let veces = 0;
    for (;;) {
      const i = t.indexOf(term, desde);
      if (i < 0) break;
      veces++;
      desde = i + term.length;
    }
    // El primer acierto vale mucho más que los repetidos: importa CUÁNTOS
    // términos distintos casan, no cuántas veces se repite uno.
    if (veces) puntos += 10 + Math.min(veces - 1, 3);
  }
  return puntos;
}

/**
 * Busca en el mapa del proyecto y devuelve lo que de verdad casa.
 *
 * Existe para que el mapa deje de ser un bloque que viaja entero en cada
 * turno: el modelo pregunta lo que necesita y recibe solo eso. Y para que las
 * notas de memoria —las decisiones que tomó el usuario— sean consultables en
 * vez de decorativas.
 *
 * Puro y sin sorpresas: si nada casa devuelve la lista vacía. No hay
 * «resultados aproximados» ni un porcentaje de relevancia inventado; o una
 * palabra de la pregunta está en el texto, o no está.
 */
export function buscarEnMapa(
  map: ProjectMap | null | undefined,
  q: string,
  limite = MAX_RESULTADOS_MEMORIA
): ResultadoMemoria[] {
  if (!map) return [];
  const terminos = terminosDe(q ?? "");
  if (!terminos.length) return [];

  const candidatos: ResultadoMemoria[] = [];
  const push = (origen: OrigenMemoria, titulo: string, texto: string, bonus = 0) => {
    const puntos = puntuar(`${titulo} ${texto}`, terminos);
    if (puntos > 0) candidatos.push({ origen, titulo, texto, puntos: puntos + bonus });
  };

  // Las notas van con ventaja a propósito: son lo que el USUARIO decidió, y
  // eso pesa más que algo que Prism dedujo leyendo el HTML.
  for (const n of map.notes ?? []) push("nota", "nota", n, 5);
  for (const f of map.files) {
    const extra = [
      f.summary,
      ...(f.features ?? []),
      ...(f.tech ?? []),
      ...(f.links ?? []).map((l) => `enlaza con ${l}`),
    ]
      .filter(Boolean)
      .join(". ");
    push("archivo", f.name, `(${f.kind}) ${extra}`);
  }
  for (const f of map.features) push("funcionalidad", f, f);
  for (const t of new Set(map.files.flatMap((f) => f.tech ?? []))) push("tecnologia", t, t);
  push("proyecto", map.name, map.description ?? "");

  return candidatos
    .sort((a, b) => b.puntos - a.puntos || a.titulo.localeCompare(b.titulo))
    .slice(0, Math.max(1, Math.min(20, limite)));
}

/** Los resultados en texto, para dárselos al modelo. */
export function resumenMemoria(res: ResultadoMemoria[], q: string): string {
  if (!res.length) {
    return `No hay nada en el mapa del proyecto sobre «${q}». El mapa guarda archivos, funcionalidades, tecnologías y las notas de memoria; si la decisión que buscas no está ahí, no se tomó o no se apuntó.`;
  }
  const out = [`${res.length} resultado(s) en el mapa del proyecto para «${q}»:`, ""];
  for (const r of res) {
    out.push(`· ${ETIQUETA_ORIGEN[r.origen]} — ${r.titulo}`);
    const texto = r.texto.trim();
    if (texto && texto !== r.titulo) out.push(`    ${texto.length > 300 ? texto.slice(0, 300) + "…" : texto}`);
  }
  return out.join("\n");
}
