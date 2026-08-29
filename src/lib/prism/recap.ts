/** Prism AI — «Resumir hasta aquí» y «Traducir respuesta».
 *
 * Los dos son mensajes-instruction: viajan al modelo con todo el contexto pero
 * se pintan como nota discreta en el hilo (igual que el «continuar trabajo» del
 * agente), así el resumen tiene contexto completo sin ensuciar la conversación.
 */

/** Idiomas a los que se puede traducir una respuesta desde su burbuja */
export interface TargetLang {
  code: string;
  /** cómo se llama en su propio idioma, que es como lo busca la gente */
  label: string;
  flag: string;
}

export const TRANSLATE_LANGS: TargetLang[] = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "pt", label: "Português", flag: "🇵🇹" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "it", label: "Italiano", flag: "🇮🇹" },
  { code: "ja", label: "日本語", flag: "🇯🇵" },
];

export function findLang(code: string): TargetLang | null {
  return TRANSLATE_LANGS.find((l) => l.code === code) ?? null;
}

/** Instrucción de resumen: la manda la app, no la persona. */
export function recapPrompt(): string {
  return `Resume la conversación hasta este punto. Estructura la respuesta así:

**En una frase** — de qué va todo esto.
**Lo acordado** — decisiones tomadas y requisitos fijados, en viñetas.
**Estado actual** — qué está hecho y qué quedó a medias.
**Siguiente paso** — lo más sensato que hacer ahora.

Sé breve y concreto: no repitas el texto de los mensajes, extrae lo que importa. Si hay código o un proyecto en marcha, di en qué archivo va cada cosa. No inventes nada que no esté en la conversación.`;
}

/** Instrucción de traducción de UNA respuesta concreta. */
export function translatePrompt(lang: TargetLang, snippet: string): string {
  const recorte = snippet.trim().slice(0, 400);
  return `Traduce al ${lang.label} tu respuesta anterior (la que empieza por «${recorte}…»).

- Traduce SOLO esa respuesta, no toda la conversación.
- Conserva el formato markdown, las tablas y los enlaces tal cual.
- El código NO se traduce: solo los comentarios y las cadenas de texto visibles.
- Mantén el tono y el registro del original; prioriza naturalidad sobre literalidad.
- Responde únicamente con la traducción, sin preámbulo ni notas.`;
}

/** Etiqueta de la nota discreta que se pinta en el hilo */
export type InstructionKind = "continuar" | "resumen" | "traducir";

/** Deduce de qué tipo es un mensaje-instruction para pintar su nota.
 *
 * El texto viaja al modelo íntegro; esto solo decide qué frase corta ve el
 * usuario en el hilo. Si no se reconoce, cae en «continuar» (el original). */
export function instructionKind(content: string): InstructionKind {
  const t = content.toLowerCase();
  if (t.startsWith("traduce al ")) return "traducir";
  if (t.startsWith("resume la conversación")) return "resumen";
  return "continuar";
}

/** Frase corta de la nota discreta del hilo */
export function instructionLabel(content: string): string {
  switch (instructionKind(content)) {
    case "resumen":
      return "Se pidió un resumen de la conversación";
    case "traducir": {
      const m = content.match(/^Traduce al (.+?) tu respuesta anterior/i);
      const lang = m?.[1]?.trim();
      return lang ? `Se pidió traducir la respuesta al ${lang}` : "Se pidió traducir la respuesta";
    }
    default:
      return "Se pidió al agente continuar el trabajo";
  }
}
