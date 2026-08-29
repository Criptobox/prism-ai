/** Prism AI — Comandos slash en el cuadro de texto.
 * Escribes «/» y sale un menú; cada comando activa una función o inserta una
 * plantilla. Lógica pura (sin DOM) para poder probarla.
 */

export type SlashAction =
  | "imagen"
  | "agente"
  | "resumen"
  | "arena"
  | "html"
  | "nuevo";

export interface SlashCommand {
  action: SlashAction;
  /** lo que se escribe tras la barra: /imagen, /agente… */
  name: string;
  label: string;
  description: string;
  /** texto que inserta en el input (si no ejecuta directamente) */
  insert?: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    action: "imagen",
    name: "imagen",
    label: "Imagen",
    description: "Genera una imagen gratis (Pollinations) en vez de chatear",
  },
  {
    action: "agente",
    name: "agente",
    label: "Modo agente",
    description: "Activa el bucle plan → ejecutar → revisar",
  },
  {
    action: "resumen",
    name: "resumen",
    label: "Resumir conversación",
    description: "Pide al modelo un resumen de todo lo hablado",
  },
  {
    action: "arena",
    name: "arena",
    label: "Arena de modelos",
    description: "Compara 2-3 modelos con el mismo prompt",
  },
  {
    action: "html",
    name: "html",
    label: "Página HTML",
    description: "Inserta la plantilla de página de una pieza",
    insert:
      "Crea una página web en un solo archivo HTML para: [tu proyecto]. Estilo: [elige uno]. Con héroe, secciones, responsive y micro-animaciones.",
  },
  {
    action: "nuevo",
    name: "nuevo",
    label: "Nueva conversación",
    description: "Limpia el lienzo y empieza de cero",
  },
];

/** ¿La palabra en curso es un comando slash? Devuelve la palabra completa
 * («/agente») y el texto que se borraría al ejecutarlo. */
export function currentSlash(value: string): { raw: string; query: string } | null {
  const m = value.match(/(^|[\s])(\/[A-Za-z]*)$/);
  if (!m) return null;
  return { raw: m[2], query: m[2].slice(1).toLowerCase() };
}

/** Comandos que coinciden con lo escrito (vacío = todos). El nombre coincide
 * por prefijo; la etiqueta palabra a palabra («imag» encuentra «imagen»). */
export function matchSlashCommands(query: string): SlashCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter(
    (c) =>
      c.name.startsWith(q) ||
      c.label.toLowerCase().split(/\W+/).some((w) => w.startsWith(q))
  );
}

/** Quita el comando del input (deja el resto del texto). */
export function stripSlash(value: string, raw: string): string {
  if (!raw) return value;
  const idx = value.lastIndexOf(raw);
  if (idx < 0) return value;
  return (value.slice(0, idx) + value.slice(idx + raw.length)).replace(/\s+$/, "");
}
