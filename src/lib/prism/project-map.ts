/** Prism AI — Mapa del proyecto: memoria compacta de lo que la IA va construyendo.
 * Se deriva localmente del HTML generado (o lo actualiza el propio modelo vía
 * <project-map>) y se inyecta en el system prompt de los turnos siguientes para
 * que la IA "recuerde" el proyecto sin releer todo el código → menos tokens.
 */
import type { ChatMessage, ProjectFileEntry, ProjectMap } from "./types";

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

const MAX_FILES = 12;
const MAX_FEATURES = 8;

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Extrae los bloques de código relevantes (cercados o documento suelto) */
function codeBlocks(content: string): string[] {
  const out: string[] = [];
  FENCE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FENCE_RE.exec(content))) {
    const code = (m[2] ?? "").trim();
    if (code.length > 40) out.push(code);
  }
  const loose = content.search(/<!doctype\s+html|<html[\s>]/i);
  if (loose >= 0) out.push(content.slice(loose).trim());
  return out;
}

function looksLikePage(code: string): boolean {
  return /<!doctype\s+html|<html[\s>]|<(?:body|main|section|article|div)[\s>]/i.test(code);
}

/**
 * Deriva el mapa a partir del ÚLTIMO contenido generado y lo fusiona con el
 * mapa previo de la sesión (memoria acumulativa). Devuelve null si el contenido
 * no parece parte de un proyecto web.
 */
export function deriveProjectMap(
  content: string,
  previous?: ProjectMap | null
): ProjectMap | null {
  const pages = codeBlocks(content).filter(looksLikePage);
  if (!pages.length) return previous ?? null;

  const files: ProjectFileEntry[] = pages.map((code, i) => {
    const title = code.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim();
    const h1 = stripTags(code.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "");
    const nav = stripTags(code.match(/<nav[^>]*>([\s\S]*?)<\/nav>/i)?.[1] ?? "").slice(0, 60);
    const name = (title || `pagina-${i + 1}.html`).replace(/[^\w.\-áéíóúüñ ]/gi, "").slice(0, 60);
    const summary = (h1 || nav || "página generada").slice(0, 90);
    return { name, kind: "html", summary };
  });

  // funcionalidades: encabezados h2/h3 y etiquetas de botones
  const features = new Set<string>(previous?.features ?? []);
  for (const code of pages) {
    for (const h of code.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi)) {
      const t = stripTags(h[1]);
      if (t && t.length >= 3 && t.length <= 40) features.add(t);
    }
    for (const b of code.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/gi)) {
      const t = stripTags(b[1]);
      if (t && t.length >= 2 && t.length <= 24) features.add(`Botón «${t}»`);
    }
  }

  const tech = TECH_HINTS.filter(([re]) => re.test(content)).map(([, n]) => n);
  if (tech.length) features.add(`Tech: ${tech.join(", ")}`);

  // fusionar archivos: los nuevos sustituyen por nombre, se conservan los previos
  const byName = new Map<string, ProjectFileEntry>();
  for (const f of previous?.files ?? []) byName.set(f.name.toLowerCase(), f);
  for (const f of files) byName.set(f.name.toLowerCase(), f);

  const first = files[0];
  return {
    name: previous?.name ?? first?.name ?? "Proyecto",
    description: previous?.description ?? first?.summary ?? "",
    files: [...byName.values()].slice(-MAX_FILES),
    features: [...features].slice(0, MAX_FEATURES),
    updatedAt: Date.now(),
  };
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
          }))
      : [];
    const features = Array.isArray(raw.features)
      ? raw.features.filter((f): f is string => typeof f === "string").slice(0, MAX_FEATURES)
      : [];
    return {
      name: String(raw.name ?? "Proyecto").slice(0, 80),
      description: String(raw.description ?? "").slice(0, 160),
      files,
      features,
      updatedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

/** Fusiona el mapa del modelo con el existente (gana el del modelo) */
export function mergeProjectMap(prev: ProjectMap | null, next: ProjectMap): ProjectMap {
  const features = new Set([...(prev?.features ?? []), ...next.features]);
  const byName = new Map<string, ProjectFileEntry>();
  for (const f of prev?.files ?? []) byName.set(f.name.toLowerCase(), f);
  for (const f of next.files) byName.set(f.name.toLowerCase(), f);
  return {
    name: next.name || prev?.name || "Proyecto",
    description: next.description || prev?.description || "",
    files: [...byName.values()].slice(-MAX_FILES),
    features: [...features].slice(0, MAX_FEATURES),
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

/** Bloque compacto para el system prompt (≤ ~1400 chars = decenas de tokens) */
export function renderMapForPrompt(map: ProjectMap | null | undefined): string | null {
  if (!map || (!map.files.length && !map.features.length)) return null;
  const lines: string[] = ["## MAPA DEL PROYECTO ACTUAL (ya existe — no lo repitas)"];
  lines.push(`Proyecto: ${map.name}${map.description ? ` — ${map.description}` : ""}`);
  if (map.files.length) {
    lines.push(
      "Archivos:\n" +
        map.files
          .slice(0, MAX_FILES)
          .map((f) => `- ${f.name} (${f.kind}): ${f.summary}`)
          .join("\n")
    );
  }
  if (map.features.length) {
    lines.push(
      "Funcionalidades ya implementadas:\n" +
        map.features.slice(0, MAX_FEATURES).map((f) => `- ${f}`).join("\n")
    );
  }
  lines.push(
    "Al pedir cambios: entrega SOLO el/los archivos que modifiques (completos) y conserva el resto tal cual."
  );
  let text = lines.join("\n\n");
  if (text.length > 1400) text = text.slice(0, 1370) + "\n…";
  return text;
}
