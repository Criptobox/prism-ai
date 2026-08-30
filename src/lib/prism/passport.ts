/** Prism AI — Ficha del proyecto (Project Passport).
 *
 * `project-map.ts` ya detecta tecnologías, dependencias y puntos de entrada;
 * lo que faltaba era PRESENTARLO como una ficha de un vistazo y que el agente
 * la LEA ANTES DE TRABAJAR. La ficha es derivada: se calcula del mapa, no se
 * pide al modelo que la invente (inventar relaciones es como se contaminan).
 *
 * Dos salidas del mismo cálculo puro:
 *  · `buildPassport(map)`      → datos para la UI (badges de pila, entradas…)
 *  · `renderPassportForPrompt` → bloque compacto para el system prompt, ANTES
 *    del mapa por archivo. El agente así sabe con qué está trabajando sin
 *    releer el historial — continúa proyectos gastando menos tokens.
 */
import type { ProjectMap } from "./types";
import { fileRelations } from "./project-map";

export interface PassportTech {
  name: string;
  /** nº de archivos que la usan */
  count: number;
}

export interface ProjectPassport {
  name: string;
  description: string;
  /** tecnologías detectadas, las más usadas primero */
  tech: PassportTech[];
  /** archivos por tipo (html, css, js, svg…) */
  kinds: Record<string, number>;
  totalFiles: number;
  /** puntos de entrada: la portada (index/portada/primera página) */
  entries: string[];
  /** el archivo al que más otros referencian (hub del proyecto) */
  hub?: string;
  /** archivos que nadie enlaza y que no enlazan a nada (revisar a mano) */
  orphans: string[];
  /** funcionalidades ya implementadas (del mapa) */
  features: string[];
  /** notas de memoria fijadas por el usuario */
  notesCount: number;
  /** versiones del mapa guardadas en el historial */
  versions: number;
  updatedAt: number;
}

const PORTADA_RE = /^(index|inicio|home|portada)\.html?$/i;

function kindOf(name: string, kind: string): string {
  if (kind && kind !== "otro") return kind;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ext || "otro";
}

/** Construye la ficha desde el mapa (puro, testeable). Null si el mapa está vacío. */
export function buildPassport(map: ProjectMap | null | undefined): ProjectPassport | null {
  if (!map || !map.files.length) return null;

  // ——— pila: tecnología → nº de archivos (la "Tech: …" global no cuenta dos veces)
  const techCount = new Map<string, number>();
  for (const f of map.files) {
    for (const t of f.tech ?? []) {
      techCount.set(t, (techCount.get(t) ?? 0) + 1);
    }
  }
  const tech: PassportTech[] = [...techCount.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 8);

  // ——— tipos de archivo
  const kinds: Record<string, number> = {};
  for (const f of map.files) {
    const k = kindOf(f.name, f.kind);
    kinds[k] = (kinds[k] ?? 0) + 1;
  }

  // ——— entradas: portada por nombre; si no, la primera página
  const pages = map.files.filter((f) => f.kind === "html");
  const portada = pages.find((f) => PORTADA_RE.test(f.name));
  const entries = portada ? [portada.name] : pages.length ? [pages[0].name] : [];

  // ——— hub: el archivo al que más otros enlazan (mínimo 1 referencia)
  const incoming = new Map<string, number>();
  for (const f of map.files) {
    for (const l of f.links ?? []) {
      incoming.set(l.toLowerCase(), (incoming.get(l.toLowerCase()) ?? 0) + 1);
    }
  }
  let hub: string | undefined;
  let maxIn = 0;
  for (const f of map.files) {
    const n = incoming.get(f.name.toLowerCase()) ?? 0;
    if (n > maxIn) {
      maxIn = n;
      hub = f.name;
    }
  }

  // ——— huérfanos: páginas sin enlaces entrantes ni salientes
  const orphans = pages
    .filter((f) => {
      const rel = fileRelations(map, f.name);
      return !rel.outgoing.length && !rel.incoming.length;
    })
    .filter((f) => !portada || f.name !== portada.name)
    .map((f) => f.name)
    .slice(0, 4);

  return {
    name: map.name,
    description: map.description,
    tech,
    kinds,
    totalFiles: map.files.length,
    entries,
    hub: maxIn > 0 ? hub : undefined,
    orphans,
    features: map.features.slice(0, 8),
    notesCount: map.notes?.length ?? 0,
    versions: map.history?.length ?? 0,
    updatedAt: map.updatedAt,
  };
}

/** Línea-resumen para chips de la UI: «4 archivos · 2 html · Tailwind ×2» */
export function passportSumario(p: ProjectPassport): string {
  const partes: string[] = [`${p.totalFiles} archivo${p.totalFiles === 1 ? "" : "s"}`];
  const top = Object.entries(p.kinds)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  for (const [k, n] of top) partes.push(`${n} ${k}`);
  if (p.tech.length) partes.push(p.tech[0].name);
  return partes.join(" · ");
}

/** Bloque compacto para el system prompt (≤ ~700 chars), ANTES del mapa.
 * Vacío si no hay ficha: no gasta tokens. */
export function renderPassportForPrompt(p: ProjectPassport | null): string | null {
  if (!p) return null;
  const lines: string[] = ["## FICHA DEL PROYECTO (léela antes de trabajar)"];
  lines.push(`Proyecto: ${p.name}${p.description ? ` — ${p.description}` : ""}`);
  const resumen: string[] = [];
  if (p.tech.length) {
    resumen.push(`Pila: ${p.tech.map((t) => (t.count > 1 ? `${t.name} ×${t.count}` : t.name)).join(", ")}`);
  }
  if (p.entries.length) resumen.push(`Entrada: ${p.entries.join(", ")}`);
  if (p.hub) resumen.push(`Núcleo: ${p.hub} (lo referencian otros archivos)`);
  const tipos = Object.entries(p.kinds)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${n} ${k}`)
    .join(", ");
  if (tipos) resumen.push(`${p.totalFiles} archivos (${tipos})`);
  if (p.features.length) resumen.push(`Funcionalidades: ${p.features.slice(0, 4).join("; ")}`);
  if (p.notesCount) resumen.push(`${p.notesCount} nota(s) de memoria del usuario — respétalas`);
  if (p.orphans.length) {
    resumen.push(`Páginas huérfanas (nadie enlaza): ${p.orphans.join(", ")}`);
  }
  lines.push(resumen.join(" · "));
  lines.push("Antes de cambiar algo, mira el MAPA de abajo para no romper lo que ya funciona.");
  let text = lines.join("\n");
  if (text.length > 700) text = `${text.slice(0, 670)}…`;
  return text;
}
