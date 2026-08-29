/** Prism AI — Fusión de lo persistido en localStorage con los recursos integrados.
 *
 * Las prompts y skills integradas SIEMPRE ganan la versión del código (así una
 * actualización de la app corrige su contenido) pero conservan lo que el usuario
 * tocó: en las skills, el estado `enabled`. Las personalizadas vienen del disco.
 * Funciones puras para poder probarlas sin navegador.
 */
import type { PromptItem, SkillItem } from "./types";

export function mergePrompts(
  builtin: PromptItem[],
  saved: PromptItem[]
): PromptItem[] {
  const builtinIds = new Set(builtin.map((p) => p.id));
  const customs = saved.filter((p) => !builtinIds.has(p.id));
  return [...builtin, ...customs];
}

export function mergeSkills(
  builtin: SkillItem[],
  saved: SkillItem[]
): SkillItem[] {
  const builtinIds = new Set(builtin.map((s) => s.id));
  const savedById = new Map(saved.map((s) => [s.id, s]));
  const fresh = builtin.map((s) => ({
    ...s,
    enabled: savedById.get(s.id)?.enabled ?? s.enabled,
  }));
  const customs = saved.filter((s) => !builtinIds.has(s.id));
  return [...fresh, ...customs];
}
