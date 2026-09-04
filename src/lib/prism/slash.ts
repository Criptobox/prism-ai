/** Prism AI — Comandos slash del compositor.
 *
 * Escribes «/» al principio del mensaje y sale un menú que filtra en vivo.
 * La lógica vive aquí (sin React ni DOM) para poder probarla en Node: el
 * componente solo pinta lo que estas funciones deciden.
 */

/** Qué hace un comando al elegirlo */
export type SlashKind =
  /** ejecuta una acción de la app (abrir Arena, nueva conversación…) */
  | "accion"
  /** rellena el compositor con un texto de arranque, sin enviar nada */
  | "plantilla";

export type SlashId =
  | "imagen"
  | "agente"
  | "resumen"
  | "arena"
  | "orquesta"
  | "html"
  | "nuevo"
  | "snip"
  | "plantillas"
  | "wrapped"
  | "presentar";

export interface SlashCommand {
  id: SlashId;
  /** lo que se teclea, con la barra incluida: «/imagen» */
  cmd: string;
  title: string;
  hint: string;
  kind: SlashKind;
  /** otras palabras por las que se encuentra (sinónimos, inglés) */
  aliases?: string[];
  /** texto que se inserta en el compositor (solo kind = «plantilla») */
  template?: string;
}

/** Plantilla de /html: un encargo completo, para no partir de una hoja en blanco. */
export const HTML_TEMPLATE = `Crea una página web completa en UN SOLO archivo HTML (HTML + CSS + JS embebidos, sin build).

- Tema: [describe aquí qué quieres]
- Público: [para quién es]
- Tono visual: sorpréndeme con un estilo que no hayas usado antes

Requisitos: responsive, accesible, con micro-animaciones y estados hover/focus cuidados. Devuélvelo en un bloque \`\`\`html que empiece por <!DOCTYPE html> y termine por </html>.`;

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "imagen",
    cmd: "/imagen",
    title: "Modo imagen",
    hint: "Describe una imagen y se genera (gratis, sin clave)",
    kind: "accion",
    aliases: ["image", "img", "foto", "dibujo", "generar imagen"],
  },
  {
    id: "agente",
    cmd: "/agente",
    title: "Modo agente",
    hint: "Bucle planear → ejecutar → revisar",
    kind: "accion",
    aliases: ["agent", "bucle", "iterar", "plan"],
  },
  {
    id: "resumen",
    cmd: "/resumen",
    title: "Resumir hasta aquí",
    hint: "Recapitula la conversación y lo acordado",
    kind: "accion",
    aliases: ["resumir", "summary", "recap", "tldr"],
  },
  {
    id: "orquesta",
    cmd: "/orquesta",
    title: "Dirigir un equipo",
    hint: "Tu modelo reparte el trabajo, otros lo hacen, él revisa y cierra",
    kind: "accion",
    aliases: ["equipo", "director", "reparte", "delegar"],
  },
  {
    id: "arena",
    cmd: "/arena",
    title: "Arena de modelos",
    hint: "Compara 2-3 modelos gratis con el mismo prompt",
    kind: "accion",
    aliases: ["comparar", "ab", "versus", "duelo"],
  },
  {
    id: "html",
    cmd: "/html",
    title: "Plantilla de página web",
    hint: "Rellena el compositor con un encargo listo para editar",
    kind: "plantilla",
    aliases: ["web", "pagina", "landing", "sitio"],
    template: HTML_TEMPLATE,
  },
  {
    id: "nuevo",
    cmd: "/nuevo",
    title: "Nueva conversación",
    hint: "Empieza de cero con el lienzo limpio",
    kind: "accion",
    aliases: ["new", "limpiar", "reset", "nueva"],
  },
  {
    id: "snip",
    cmd: "/snip",
    title: "Insertar snippet",
    hint: "Tus trozos reutilizables (U2)",
    kind: "accion",
    aliases: ["snippet", "trozo", "atajo", "fragmento"],
  },
  {
    id: "plantillas",
    cmd: "/plantillas",
    title: "Plantillas del Sandbox",
    hint: "Carga una demo con 1 clic (U3)",
    kind: "accion",
    aliases: ["template", "demo", "catalogo", "starter"],
  },
  {
    id: "wrapped",
    cmd: "/wrapped",
    title: "Tu informe semanal",
    hint: "Qué usaste, cuánto ahorraste (U4)",
    kind: "accion",
    aliases: ["informe", "report", "resumen", "stats"],
  },
  {
    id: "presentar",
    cmd: "/presentar",
    title: "Modo presentación",
    hint: "Diapositivas de la vista previa (U6)",
    kind: "accion",
    aliases: ["slides", "presentacion", "diapositivas", "pitch"],
  },
];

/** Minúsculas y sin tildes: «/PÁGina» encuentra «pagina». */
export function normalizeSlash(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Lo que hay escrito tras la barra, o null si el menú no debe salir.
 *
 * El menú solo aparece cuando la barra abre el mensaje y todavía no hay
 * espacios: en cuanto escribes «/imagen un gato» dejas de estar eligiendo
 * comando y pasas a escribir un mensaje normal. */
export function slashQuery(value: string): string | null {
  if (!value.startsWith("/")) return null;
  const rest = value.slice(1);
  if (/[\s\n]/.test(rest)) return null;
  return rest;
}

/** ¿Hay que enseñar el menú para este valor del compositor? */
export function slashOpen(value: string): boolean {
  return slashQuery(value) !== null;
}

/** Comandos que encajan con lo tecleado, los que empiezan igual primero. */
export function filterSlash(query: string, commands: SlashCommand[] = SLASH_COMMANDS): SlashCommand[] {
  const q = normalizeSlash(query);
  if (!q) return [...commands];

  const scored: { cmd: SlashCommand; score: number }[] = [];
  for (const c of commands) {
    const name = normalizeSlash(c.cmd.slice(1));
    const title = normalizeSlash(c.title);
    const aliases = (c.aliases ?? []).map(normalizeSlash);

    let score = -1;
    if (name.startsWith(q)) score = 0;
    else if (aliases.some((a) => a.startsWith(q))) score = 1;
    else if (title.startsWith(q)) score = 2;
    else if (name.includes(q)) score = 3;
    else if (title.includes(q) || aliases.some((a) => a.includes(q))) score = 4;
    if (score >= 0) scored.push({ cmd: c, score });
  }

  return scored
    .sort((a, b) => a.score - b.score || a.cmd.cmd.localeCompare(b.cmd.cmd))
    .map((s) => s.cmd);
}

/** El comando escrito entero y exacto («/arena»), si lo hay. */
export function matchSlashExact(
  value: string,
  commands: SlashCommand[] = SLASH_COMMANDS
): SlashCommand | null {
  const q = slashQuery(value);
  if (q === null) return null;
  const n = normalizeSlash(q);
  return commands.find((c) => normalizeSlash(c.cmd.slice(1)) === n) ?? null;
}

/** Mueve la selección con las flechas, dando la vuelta por los extremos. */
export function moveSlashIndex(index: number, delta: number, total: number): number {
  if (total <= 0) return 0;
  return (((index + delta) % total) + total) % total;
}
