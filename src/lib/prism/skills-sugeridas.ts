/** Prism AI — Proponer la skill que encaja con lo que acabas de pedir.
 *
 * `classifyTask` ya clasifica cada mensaje en seis tipos de encargo, y ya se
 * usaba para elegir MODELO. Para elegir skills no la miraba nadie: tenías
 * siete skills instaladas y ninguna pista de cuál sirve para lo que estás
 * haciendo.
 *
 * Aquí se decide qué proponer. Dos reglas que no son negociables:
 *
 *  1. **Se propone, no se activa.** Decidir por el usuario es lo que hace que
 *     la gente deje de fiarse de una app. El clic es suyo.
 *  2. **Una vez y en paz.** Si no la quiso la primera vez, insistir es ruido.
 *     Por eso el llamador lleva la cuenta de lo ya propuesto.
 */
import type { SkillItem } from "./types";
import type { TaskKind } from "./task-router";
import { costeDeSkill } from "./prompt-actual";

export interface Sugerencia {
  skill: SkillItem;
  /** lo que añadiría al prompt de cada mensaje, para que el precio se vea
   *  ANTES de aceptar y no después */
  coste: number;
}

/** Cuántas se proponen a la vez. Más de dos deja de ser una pista y pasa a ser
 *  un menú, y un menú no lo lee nadie. */
export const MAX_SUGERENCIAS = 2;

/**
 * Skills apagadas que encajan con el tipo de encargo.
 *
 * `yaPropuestas` son los ids que ya se ofrecieron en esta sesión: no vuelven.
 * El encargo de tipo «chat» no propone nada — una charla no necesita un
 * experto, y proponerlo ahí sería el ruido que vuelve inútil la función.
 */
export function skillsSugeridas(
  kind: TaskKind,
  skills: SkillItem[],
  yaPropuestas: string[] = []
): Sugerencia[] {
  if (kind === "chat") return [];
  const vistas = new Set(yaPropuestas);
  return skills
    .filter((s) => !s.enabled && !vistas.has(s.id) && (s.kinds ?? []).includes(kind))
    .slice(0, MAX_SUGERENCIAS)
    .map((s) => ({ skill: s, coste: costeDeSkill(s.name, s.instructions) }));
}

/** Frase del aviso. Sale de aquí para poder probarla sin montar React. */
export function textoSugerencia(s: Sugerencia, etiquetaTarea: string): string {
  return `Para ${etiquetaTarea} suele ir mejor con «${s.skill.name}» (+${s.coste.toLocaleString(
    "es"
  )} car. por mensaje).`;
}
