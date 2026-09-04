/** Prism AI — Preguntar a varios modelos a la vez y quedarse con lo mejor de todos.
 *
 * La idea de partida era que las IA «dialogaran hasta ponerse de acuerdo». Un
 * debate de varias rondas multiplica el coste por el número de modelos EN CADA
 * RONDA, y con capas gratuitas los 429 lo cortan a media conversación. Lo que
 * sí sale a cuenta es más simple: la misma pregunta a varios a la vez y una
 * pasada final que lee todas las respuestas y compone la buena. Una llamada
 * extra, no una espiral.
 *
 * Aquí están las decisiones, puras y comprobables: a quién se pregunta y cómo
 * se le pide la síntesis.
 */

import type { ProviderConfig, ProviderId } from "./types";
import { makeModelKey } from "./types";
import { isFreeModel, KEYLESS_PROVIDERS } from "./free-models";
import { permitido } from "./vetados";

export interface Panelista {
  providerId: ProviderId;
  modelId: string;
}

export interface PanelOpciones {
  /** cuántos modelos se consultan como mucho */
  max?: number;
  /** proveedores vetados: no entran ni aunque tengan clave (ver `vetados.ts`) */
  vetados?: readonly ProviderId[];
  /** solo modelos gratis */
  soloGratis?: boolean;
  /** modelos en enfriamiento, que no hay que molestar */
  enCooldown?: (modelKey: string) => boolean;
  /** favoritos del usuario, en orden: entran primero */
  favoritos?: string[];
}

/** Tope por defecto. Tres respuestas ya dan contraste; a partir de ahí se paga
 *  mucho más para ganar muy poco, y con capas gratuitas se choca con límites. */
export const PANEL_POR_DEFECTO = 3;

/**
 * Elige a quién preguntar.
 *
 * Una regla importante: como mucho un modelo por proveedor. Tres modelos de la
 * misma casa comparten sesgos y límite de peticiones — el contraste sale de que
 * sean distintos, no de que sean muchos.
 */
export function pickPanel(
  providers: Partial<Record<ProviderId, ProviderConfig>>,
  opts: PanelOpciones = {}
): Panelista[] {
  const max = Math.max(1, opts.max ?? PANEL_POR_DEFECTO);
  const enCooldown = opts.enCooldown ?? (() => false);

  const disponibles: Panelista[] = [];
  for (const [id, cfg] of Object.entries(providers) as [ProviderId, ProviderConfig][]) {
    if (!cfg?.enabled) continue;
    // Un proveedor vetado no entra en el panel aunque tenga clave y esté
    // encendido: el panel es un camino AUTOMÁTICO, y esos son justo donde
    // acabaría recibiendo tu conversación sin que nadie se fijara.
    if (!permitido(id, opts.vetados)) continue;
    if (!cfg.apiKey?.trim() && !KEYLESS_PROVIDERS.includes(id)) continue;
    for (const modelId of cfg.models ?? []) {
      if (opts.soloGratis && !isFreeModel(id, modelId)) continue;
      if (enCooldown(makeModelKey(id, modelId))) continue;
      disponibles.push({ providerId: id, modelId });
    }
  }

  // los favoritos primero, respetando el orden en que los marcaste
  const rango = new Map((opts.favoritos ?? []).map((k, i) => [k, i]));
  disponibles.sort((a, b) => {
    const ra = rango.get(makeModelKey(a.providerId, a.modelId)) ?? Infinity;
    const rb = rango.get(makeModelKey(b.providerId, b.modelId)) ?? Infinity;
    return ra - rb;
  });

  const elegidos: Panelista[] = [];
  const usados = new Set<ProviderId>();
  for (const p of disponibles) {
    if (usados.has(p.providerId)) continue;
    elegidos.push(p);
    usados.add(p.providerId);
    if (elegidos.length >= max) break;
  }
  return elegidos;
}

/**
 * Quién sintetiza: el primero DEL PANEL que haya respondido.
 *
 * Manda el orden del panel, no el de llegada: el primero es tu favorito o el
 * que se consideró mejor al montarlo, y que sintetice el más rápido sería
 * premiar la latencia, que no tiene nada que ver con la calidad.
 */
export function pickSintetizador(panel: Panelista[], respondieron: Panelista[]): Panelista | null {
  return panel.find((p) => respondieron.some((r) => mismo(p, r))) ?? respondieron[0] ?? null;
}

function mismo(a: Panelista, b: Panelista): boolean {
  return a.providerId === b.providerId && a.modelId === b.modelId;
}

/** Etiqueta anónima de cada respuesta: A, B, C… */
export function etiqueta(i: number): string {
  return String.fromCharCode(65 + (i % 26));
}

export interface RespuestaPanel {
  panelista: Panelista;
  texto: string;
}

/**
 * El encargo para la pasada de síntesis.
 *
 * Las respuestas van ANÓNIMAS a propósito. Si se dice de qué modelo es cada
 * una, el sintetizador tiende a premiar la marca conocida en vez del contenido,
 * y con eso se pierde justo lo que se estaba buscando.
 *
 * Y se pide una respuesta, no una reseña: quien pregunta quiere su página o su
 * explicación, no un informe comparando candidatos.
 */
export function synthesisPrompt(pregunta: string, respuestas: RespuestaPanel[]): string {
  const bloques = respuestas
    .map((r, i) => `<respuesta id="${etiqueta(i)}">\n${r.texto.trim()}\n</respuesta>`)
    .join("\n\n");

  return [
    "Varios asistentes han respondido por separado a la misma petición.",
    "Tu trabajo es entregar LA respuesta definitiva combinando lo mejor de todas.",
    "",
    "Cómo hacerlo:",
    "- Quédate con lo correcto y lo más completo de cada una.",
    "- Si se contradicen, decide tú y quédate con lo que sea correcto.",
    "- Si una aporta algo que las demás no tienen y es bueno, inclúyelo.",
    "- Descarta lo que esté mal, aunque lo digan varias.",
    "",
    "Importante: responde a la petición original directamente, en su mismo",
    "formato e idioma. NO compares las respuestas, no las menciones, no digas",
    "de dónde sacaste cada parte. Si la petición pedía código, entrega el código",
    "completo y funcionando, no fragmentos.",
    "",
    `<peticion>\n${pregunta.trim()}\n</peticion>`,
    "",
    bloques,
  ].join("\n");
}

/** Texto de estado mientras se consulta al panel. */
export function estadoPanel(hechos: number, total: number): string {
  if (hechos < total) return `Consultando ${total} modelos… (${hechos}/${total})`;
  return "Combinando las respuestas…";
}

/**
 * ¿Merece la pena sintetizar?
 *
 * Con una sola respuesta no hay nada que combinar, y gastar otra llamada para
 * que un modelo se reescriba a sí mismo suele empeorarla.
 */
export function necesitaSintesis(respuestas: RespuestaPanel[]): boolean {
  return respuestas.filter((r) => r.texto.trim()).length > 1;
}
