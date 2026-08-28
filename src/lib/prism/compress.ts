/** Prism AI — Compresión de contexto (inspirada en RTK + Caveman de OmniRoute).
 *
 * Objetivo: que la historia larga gaste menos tokens en modelos gratis con
 * ventanas y límites ajustados. Dos modos:
 *  - «lite»     — pérdida mínima: colapsa espacios, líneas en blanco y comillas repetidas.
 *  - «standard» — lite + «spearex» (reglas tipo Caveman en ES/EN sobre mensajes ANTIGUOS
 *                 del asistente) + dedup de párrafos repetidos entre turnos.
 *
 * Guardianes de preservación (intactos SIEMPRE, como en OmniRoute):
 *  - bloques de código vallados ```…```, código en línea `…`
 *  - URLs y data URLs
 *  - bloques JSON reconocibles
 *  - el ÚLTIMO mensaje del usuario nunca se comprime (es la pregunta viva)
 */

export type CompressionMode = "off" | "lite" | "standard";

/** Sustituye las zonas protegidas por tokens \u0000n\u0000 para comprimir solo la prosa */
function guard(text: string): { masked: string; restore: (s: string) => string } {
  const vault: string[] = [];
  const keep = (m: string) => {
    const idx = vault.push(m) - 1;
    return `\u0000${idx}\u0000`;
  };
  const masked = text
    .replace(/```[\s\S]*?```/g, keep) // bloques vallados
    .replace(/`[^`\n]+`/g, keep) // código en línea
    .replace(/\[[^\]\n]{0,120}]\((?:https?:\/\/|\/)[^\s)]+\)/g, keep) // links markdown
    .replace(/(?:https?:\/\/|www\.)[^\s<>"')\]]+/g, keep) // URLs sueltas
    .replace(/data:[a-z/+.-]+;base64,[A-Za-z0-9+/=]+/g, keep) // data URLs
    .replace(/^\s*[[{][\s\S]*[\]}]\s*$/gm, keep); // líneas/bloques JSON
  return {
    masked,
    restore: (s: string) => s.replace(/\u0000(\d+)\u0000/g, (_, i) => vault[Number(i)] ?? ""),
  };
}

/** Motor LITE — colapso de espacio sin tocar palabras */
export function liteCompress(text: string): string {
  if (!text) return text;
  const { masked, restore } = guard(text);
  const out = masked
    .replace(/[ \t]+/g, " ") // espacios múltiples
    .replace(/ ?\n ?/g, "\n") // espacios alrededor de saltos
    .replace(/\n{3,}/g, "\n\n") // más de 2 saltos seguidos
    .replace(/([!,.:;?]) (?=[!,.:;?])/g, "$1") // puntuación duplicada «… ! …»
    .trim();
  return restore(out);
}

/** Frases de relleno ES/EN que Caveman-style elimina de la prosa antigua.
 * Solo se tocan mensajes del ASISTENTE anteriores: nunca la pregunta del usuario. */
const FILLER: RegExp[] = [
  /\b(?:por supuesto|desde luego|sin duda(?: alguna)?|claro que sí|cómo no)\b[, :]?/gi,
  /\b(?:básicamente|esencialmente|literalmente|realmente|honestamente|francamente)\b[, :]?/gi,
  /\b(?:cabe (?:mencionar|destacar|señalar)|es importante (?:destacar|mencionar|señalar|recordar)|hay que tener en cuenta|ten en cuenta) que\b/gi,
  /\b(?:como (?:ya )?(?:se mencionó|se dijo|se señaló|se ha visto)(?: antes| anteriormente)?|como se puede (?:ver|observar))\b[, :]?/gi,
  /\b(?:en (?:este|ese) (?:caso|sentido|aspecto)|a (?:este|ese) respecto|al final del día|dicho esto|dicho lo anterior)\b[, :]?/gi,
  /\b(?:espero que (?:esto|esto te) ayude|no dudes en preguntar(?:me)?(?: si tienes (?:alguna )?(?:otra )?pregunta)?|avísame si necesitas (?:algo|ayuda) más|cualquier cosa me dices)\b[.!]*/gi,
  /\b(?:en mi (?:humilde )?opinión|si tengo que ser sincero|para ser sincero)\b[, :]?/gi,
  /\b(?:it(?:'s| is) important to (?:note|mention)(?: that)?|please note that|as (?:mentioned|noted) (?:above|before)|of course|certainly|sure thing|needless to say)\b[, :]?/gi,
  /\b(?:feel free to (?:ask|reach out)|let me know if you (?:have )?(?:any )?(?:other )?questions?|hope this helps!?)\b[.!]*/gi,
];

/** Comprime la prosa de UN mensaje antiguo del asistente (standard) */
export function cavemanEs(text: string): string {
  if (!text) return text;
  const { masked, restore } = guard(text);
  let out = masked;
  for (const re of FILLER) out = out.replace(re, "");
  out = out
    .replace(/^(?:###\s*)?vamos a (?:ello|ver)\b[:.]?\s*/gim, "")
    .replace(/^\s*(?:bien|okay|ok|perfecto)[,.!]?\s+/gim, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
  return restore(out);
}

function hashStr(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export interface CompressInput {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface CompressResult {
  messages: CompressInput[];
  /** caracteres ahorrados en total (≥ 0) */
  savedChars: number;
}

/** Aplica la compresión a la HISTORIA que va al modelo.
 * `protectLastUser`: índice del último mensaje user cuya pregunta viva no se toca
 * (pásase -1 si no hay). El system prompt nunca entra aquí (va aparte). */
export function compressHistory(
  messages: CompressInput[],
  mode: CompressionMode,
  protectLastUser = -1
): CompressResult {
  if (mode === "off" || messages.length === 0) {
    return { messages, savedChars: 0 };
  }
  const seenParas = new Set<string>();
  let saved = 0;
  const out = messages.map((m, i) => {
    const original = m.content;
    if (!original || original.length < 120) return m; // mensajes cortos: no valen la pena
    // El system prompt nunca pasa por aquí, pero lo blindamos igualmente.
    // La pregunta viva del usuario (último user) jamás se toca.
    const isProtected = m.role === "system" || (m.role === "user" && i === protectLastUser);

    let next = original;
    if (!isProtected) {
      // lite para todos; el recorte de muletillas (standard) SOLO en prosa del asistente
      next = liteCompress(next);
      if (mode === "standard" && m.role === "assistant") next = cavemanEs(next);
      // dedup de párrafos repetidos entre turnos (Session-Dedup de OmniRoute)
      if (mode === "standard") {
        const paras = next.split(/\n{2,}/);
        const kept: string[] = [];
        for (const p of paras) {
          const key = hashStr(p.replace(/\s+/g, " ").trim());
          if (p.length > 80 && seenParas.has(key)) {
            kept.push(`⟪repetido⟫ ${p.slice(0, 60).trim()}…`);
          } else {
            if (p.length > 80) seenParas.add(key);
            kept.push(p);
          }
        }
        next = kept.join("\n\n");
      }
    }
    if (next.length < original.length) saved += original.length - next.length;
    return { ...m, content: next };
  });
  return { messages: out, savedChars: saved };
}

/** Formato corto para la meta del mensaje: «−34 %» */
export function savingsPercent(original: number, saved: number): number {
  if (original <= 0) return 0;
  return Math.round((saved / original) * 100);
}
