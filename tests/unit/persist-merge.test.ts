import { describe, expect, it } from "vitest";
import { mergePrompts, mergeSkills } from "../../src/lib/prism/persist-merge";
import type { PromptItem, SkillItem } from "../../src/lib/prism/types";

const BUILTIN_PROMPTS: PromptItem[] = [
  { id: "p-landing", title: "Landing", content: "v1", category: "Desarrollo", builtin: true },
  { id: "p-game", title: "Juego", content: "v1", category: "Diversión", builtin: true },
];

const BUILTIN_SKILLS: SkillItem[] = [
  { id: "skill-web", name: "Web", description: "", icon: "🌐", builtin: true, enabled: true, instructions: "v1" },
  { id: "skill-mentor", name: "Mentor", description: "", icon: "🧠", builtin: true, enabled: false, instructions: "v1" },
];

describe("mergePrompts", () => {
  it("mantiene las integradas del código y restaura las personalizadas", () => {
    const saved: PromptItem[] = [
      { id: "p-custom", title: "Mío", content: "hola", category: "Prod" },
    ];
    const out = mergePrompts(BUILTIN_PROMPTS, saved);
    expect(out.map((p) => p.id)).toEqual(["p-landing", "p-game", "p-custom"]);
    expect(out[0].content).toBe("v1");
  });

  it("las integradas guardadas nunca sustituyen al código (actualizaciones)", () => {
    const saved: PromptItem[] = [
      { id: "p-landing", title: "Landing vieja", content: "v0", category: "Desarrollo", builtin: true },
    ];
    const out = mergePrompts(BUILTIN_PROMPTS, saved);
    expect(out.find((p) => p.id === "p-landing")?.content).toBe("v1");
  });

  it("sin datos guardados devuelve solo las integradas", () => {
    expect(mergePrompts(BUILTIN_PROMPTS, []).map((p) => p.id)).toEqual(["p-landing", "p-game"]);
  });
});

describe("mergeSkills", () => {
  it("conserva el estado enabled que dejó el usuario", () => {
    const saved: SkillItem[] = [
      { id: "skill-web", name: "Web", description: "", icon: "🌐", builtin: true, enabled: false, instructions: "v0" },
    ];
    const out = mergeSkills(BUILTIN_SKILLS, saved);
    expect(out.find((s) => s.id === "skill-web")).toMatchObject({
      enabled: false,
      instructions: "v1", // la instrucción gana la del código
    });
  });

  it("restaura las skills personalizadas", () => {
    const saved: SkillItem[] = [
      { id: "skill-mia", name: "Mía", description: "", icon: "⭐", enabled: true, instructions: "x" },
    ];
    const out = mergeSkills(BUILTIN_SKILLS, saved);
    expect(out.map((s) => s.id)).toEqual(["skill-web", "skill-mentor", "skill-mia"]);
  });

  it("sin datos guardados usa el enabled por defecto del código", () => {
    const out = mergeSkills(BUILTIN_SKILLS, []);
    expect(out.find((s) => s.id === "skill-web")?.enabled).toBe(true);
    expect(out.find((s) => s.id === "skill-mentor")?.enabled).toBe(false);
  });
});
