/** Prism AI — Normalización de los bloques de razonamiento (T4, plan V6).
 *
 * Cada familia de modelos manda el chain-of-thought a su manera y no había un
 * sitio único que lo tradujera — como sí lo hay para las herramientas
 * (tools-translate.ts) y para el motivo de parada (finish-reason.ts). Esto
 * sigue ese mismo patrón: una pieza normalizada, no un ProviderAdapter.
 *
 * Cuatro formas de mandarlo:
 *  · OpenAI-compatibles: campo `reasoning_content` en el delta (DeepSeek…).
 *  · Etiquetas `<think>…</think>` dentro del propio `content` (DeepSeek-R1,
 *    QwQ…): ya lo resuelve thinking.ts sobre el texto acumulado; aquí se reexpone
 *    para que razonamiento.ts sea la única puerta.
 *  · Anthropic: bloques `thinking` (no-streaming) y eventos
 *    `thinking_delta` (streaming) — NUEVO: antes se tiraban sin enseñar.
 *  · Gemini: partes con `thought: true` — NUEVO: antes se pegaban al
 *    contenido y salían mezcladas en la respuesta.
 *
 * Sin red y sin React: recibe el trozo ya parseado de cada protocolo.
 */
import { splitThinkTags } from "./thinking";

export type ProtocoloRazonamiento = "openai" | "anthropic" | "gemini";

export interface RazonamientoTrozo {
  /** texto visible que aporta este trozo */
  contenido: string;
  /** chain-of-thought que aporta este trozo */
  razonamiento: string;
}

const VACIO: RazonamientoTrozo = { contenido: "", razonamiento: "" };

/** Extrae { contenido, razonamiento } de un chunk ya parseado (JSON), por
 * protocolo. Streaming y no-streaming: solo cambia de dónde salen los bloques.
 *
 * Ojo con `thoughtSignature` de Gemini y `signature_delta` de Anthropic: son
 * firmaturas para la API, no texto — no se enseñan ni se pierden, no son
 * razonamiento. */
export function razonamientoDeTrozo(
  protocolo: ProtocoloRazonamiento,
  trozo: unknown
): RazonamientoTrozo {
  if (!trozo || typeof trozo !== "object") return VACIO;
  const j = trozo as Record<string, unknown>;

  if (protocolo === "openai") {
    // delta.message y message.delta comparten forma: el no-streaming también
    // puede traer reasoning_content, aunque hoy chat-client no lo lee ahí
    // (comportamiento que se conserva tal cual, no se inventa cobertura).
    const choices = j.choices as { delta?: Record<string, unknown>; message?: Record<string, unknown> }[] | undefined;
    const d = choices?.[0]?.delta ?? choices?.[0]?.message;
    if (!d) return VACIO;
    return {
      contenido: typeof d.content === "string" ? d.content : "",
      razonamiento: typeof d.reasoning_content === "string" ? d.reasoning_content : "",
    };
  }

  if (protocolo === "anthropic") {
    // no-streaming: {content: [{type:"text"|"thinking", text|thinking}]}
    const blocks = j.content as { type?: string; text?: string; thinking?: string }[] | undefined;
    if (Array.isArray(blocks)) {
      let contenido = "";
      let razonamiento = "";
      for (const b of blocks) {
        if (b?.type === "text" && typeof b.text === "string") contenido += b.text;
        if (b?.type === "thinking" && typeof b.thinking === "string") razonamiento += b.thinking;
      }
      return { contenido, razonamiento };
    }
    // streaming: content_block_delta con delta.type text_delta | thinking_delta
    const delta = j.delta as { type?: string; text?: string; thinking?: string } | undefined;
    if (j.type === "content_block_delta" && delta) {
      if (delta.type === "text_delta") {
        return { contenido: typeof delta.text === "string" ? delta.text : "", razonamiento: "" };
      }
      if (delta.type === "thinking_delta") {
        return { contenido: "", razonamiento: typeof delta.thinking === "string" ? delta.thinking : "" };
      }
    }
    return VACIO;
  }

  // gemini: candidates[0].content.parts, cada parte con {text, thought?}
  const cands = j.candidates as { content?: { parts?: { text?: string; thought?: boolean }[] } }[] | undefined;
  const parts = cands?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return VACIO;
  let contenido = "";
  let razonamiento = "";
  for (const p of parts) {
    if (typeof p?.text !== "string") continue;
    // `thought: true` marca las partes de razonamiento de Gemini (con
    // includeThoughts activado). thoughtSignature NO cuenta: no es texto.
    if (p.thought === true) razonamiento += p.text;
    else contenido += p.text;
  }
  return { contenido, razonamiento };
}

/** Etiquetas `<think>…</think>` dentro del propio contenido: el ya existente
 * splitThinkTags, reexpuesto para que razonamiento.ts sea el único sitio al
 * que mirar. Se aplica sobre el TEXTO ACUMULADO (las etiquetas pueden venir
 * partidas entre dos trozos del stream, y por trozos no se puede). */
export function separarEtiquetasPensamiento(
  content: string,
  prevReasoning = ""
): RazonamientoTrozo {
  const r = splitThinkTags(content, prevReasoning);
  return { contenido: r.content, razonamiento: r.reasoning };
}
