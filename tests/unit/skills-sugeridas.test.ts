/** Prism AI — Proponer la skill que encaja con el encargo.
 *
 * La señal ya existía: `classifyTask` clasifica en seis tipos y se usaba solo
 * para elegir modelo. Estos tests fijan las dos reglas que hacen que la
 * función sea útil en vez de molesta: se propone (no se activa) y no se
 * insiste.
 */
import { describe, it, expect } from "vitest";
import {
  skillsSugeridas,
  textoSugerencia,
  MAX_SUGERENCIAS,
} from "../../src/lib/prism/skills-sugeridas";
import { BUILTIN_SKILLS } from "../../src/lib/prism/skills-data";
import { classifyTask } from "../../src/lib/prism/task-router";
import type { SkillItem } from "../../src/lib/prism/types";

const skill = (over: Partial<SkillItem>): SkillItem => ({
  id: "s",
  name: "Una skill",
  description: "",
  icon: "🧩",
  instructions: "haz cosas",
  enabled: false,
  ...over,
});

describe("skillsSugeridas", () => {
  const web = skill({ id: "web", name: "Web", kinds: ["web"] });
  const code = skill({ id: "code", name: "Código", kinds: ["code"] });

  it("propone la que encaja con el tipo de encargo", () => {
    const r = skillsSugeridas("web", [web, code]);
    expect(r.map((x) => x.skill.id)).toEqual(["web"]);
  });

  it("NO propone las que ya están activas: no habría nada que activar", () => {
    const r = skillsSugeridas("web", [{ ...web, enabled: true }, code]);
    expect(r).toEqual([]);
  });

  it("no insiste con las ya propuestas en esta sesión", () => {
    expect(skillsSugeridas("web", [web], ["web"])).toEqual([]);
  });

  it("una charla no propone nada: ahí sería puro ruido", () => {
    expect(skillsSugeridas("chat", [web, code])).toEqual([]);
  });

  it("como mucho dos, para que sea una pista y no un menú", () => {
    const muchas = Array.from({ length: 6 }, (_, i) =>
      skill({ id: `w${i}`, kinds: ["web"] })
    );
    expect(skillsSugeridas("web", muchas)).toHaveLength(MAX_SUGERENCIAS);
  });

  it("dice el precio: los caracteres que añadiría a CADA mensaje", () => {
    const r = skillsSugeridas("web", [skill({ id: "w", name: "Web", kinds: ["web"], instructions: "abc" })]);
    // "### Skill activa: Web\n" + "abc"
    expect(r[0].coste).toBe("### Skill activa: Web\nabc".length);
  });

  it("una skill sin tipos declarados no se propone nunca", () => {
    expect(skillsSugeridas("web", [skill({ id: "x", kinds: undefined })])).toEqual([]);
  });
});

describe("las skills integradas declaran para qué sirven", () => {
  it("todas tienen tipos, o no se podrían proponer jamás", () => {
    for (const s of BUILTIN_SKILLS) {
      expect(s.kinds, `${s.name} declara sus tipos`).toBeDefined();
      expect(s.kinds!.length).toBeGreaterThan(0);
    }
  });

  it("pedir una web propone las de web y no la de datos", () => {
    const apagadas = BUILTIN_SKILLS.map((s) => ({ ...s, enabled: false }));
    const { kind } = classifyTask("hazme una landing para mi tienda");
    expect(kind).toBe("web");
    const ids = skillsSugeridas(kind, apagadas).map((s) => s.skill.id);
    expect(ids.every((id) => id.includes("web") || id.includes("design"))).toBe(true);
  });

  it("pedir un análisis de datos propone la de datos", () => {
    const apagadas = BUILTIN_SKILLS.map((s) => ({ ...s, enabled: false }));
    const { kind } = classifyTask("analiza este csv y sácame la media");
    const ids = skillsSugeridas(kind, apagadas).map((s) => s.skill.id);
    expect(ids).toContain("skill-data-analyst");
  });
});

describe("textoSugerencia", () => {
  it("nombra la skill y su precio, para decidir antes de aceptar", () => {
    const s = { skill: skill({ name: "Web" }), coste: 1234 };
    const t = textoSugerencia(s, "página web");
    expect(t).toContain("Web");
    expect(t).toContain("página web");
    expect(t).toMatch(/1[.,]?234/);
  });
});
