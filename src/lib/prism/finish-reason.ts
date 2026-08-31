/** Prism AI — Por qué paró el modelo, según el propio proveedor.
 *
 * Los tres protocolos mandan un campo diciendo por qué terminaron
 * (`finish_reason`, `stop_reason`, `finishReason`) y Prism no lo leía en
 * ningún sitio. La detección de respuestas cortadas de la v3.18.0 va por la
 * FORMA del texto —una cerca ``` sin pareja—, que funciona pero es un indicio.
 * Esto es el proveedor diciéndolo con todas las letras.
 *
 * Importa donde el indicio falla: un texto largo que se corta a mitad de una
 * frase, sin bloque de código de por medio, no deja ninguna señal en la forma.
 * `finish_reason: "length"` sí.
 *
 * Aquí solo se traduce el campo. Sin red y sin React, para poder fijarlo.
 */

export type MotivoParada =
  /** terminó de decir lo que tenía que decir */
  | "fin"
  /** se quedó sin presupuesto de salida: la respuesta está CORTADA */
  | "longitud"
  /** paró para llamar a una herramienta */
  | "herramienta"
  /** el proveedor lo cortó por su filtro de contenido */
  | "filtro"
  /** el proveedor no dijo nada, o dijo algo que no conocemos */
  | "desconocido";

/** Valores literales de cada protocolo. Se comparan en minúsculas porque
 *  Gemini los manda en mayúsculas y los routers copian de todo. */
const LONGITUD = ["length", "max_tokens", "maxtokens", "max_output_tokens", "model_length"];
const HERRAMIENTA = ["tool_calls", "tool_use", "function_call", "tool"];
const FILTRO = ["content_filter", "safety", "recitation", "blocklist", "prohibited_content"];
const FIN = ["stop", "end_turn", "stop_sequence", "eos", "complete"];

/** Traduce el valor crudo de cualquiera de los tres protocolos. */
export function motivoDeParada(raw: unknown): MotivoParada {
  if (typeof raw !== "string" || !raw.trim()) return "desconocido";
  const v = raw.trim().toLowerCase();
  if (LONGITUD.includes(v)) return "longitud";
  if (HERRAMIENTA.includes(v)) return "herramienta";
  if (FILTRO.includes(v)) return "filtro";
  if (FIN.includes(v)) return "fin";
  return "desconocido";
}

/** Saca el motivo del cuerpo (o del chunk) de cada protocolo.
 *
 * Se mira el ÚLTIMO que llegue con valor: en streaming, los chunks
 * intermedios traen `finish_reason: null` y solo el último lo rellena. */
export function motivoDeRespuesta(
  protocolo: "openai" | "anthropic" | "gemini",
  json: unknown
): MotivoParada | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Record<string, unknown>;

  if (protocolo === "anthropic") {
    // no-streaming: {stop_reason}. streaming: {type:"message_delta", delta:{stop_reason}}
    const delta = j.delta as Record<string, unknown> | undefined;
    const raw = j.stop_reason ?? delta?.stop_reason;
    return raw == null ? null : motivoDeParada(raw);
  }

  if (protocolo === "gemini") {
    const cands = j.candidates as { finishReason?: unknown }[] | undefined;
    const raw = cands?.[0]?.finishReason;
    return raw == null ? null : motivoDeParada(raw);
  }

  const choices = j.choices as { finish_reason?: unknown }[] | undefined;
  const raw = choices?.[0]?.finish_reason;
  return raw == null ? null : motivoDeParada(raw);
}

/** ¿Es este motivo una respuesta cortada por falta de sitio? */
export function estaCortadaPorLongitud(m: MotivoParada | null): boolean {
  return m === "longitud";
}

/** Frase para la interfaz. `null` cuando no hay nada que contar: un final
 *  normal no merece un aviso, y un motivo desconocido tampoco —decir algo
 *  ahí sería inventarse un dato. */
export function mensajeParada(m: MotivoParada | null): string | null {
  switch (m) {
    case "longitud":
      return "El proveedor cortó la respuesta por longitud.";
    case "filtro":
      return "El proveedor cortó la respuesta con su filtro de contenido.";
    default:
      return null;
  }
}
