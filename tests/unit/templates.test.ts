import { describe, it, expect } from "vitest";
import { TEMPLATES, filterTemplates } from "../../src/lib/prism/templates";

describe("filterTemplates", () => {
  it("sin query devuelve todo el catálogo", () => {
    expect(filterTemplates(TEMPLATES, "")).toHaveLength(TEMPLATES.length);
  });

  it("filtra por título", () => {
    const r = filterTemplates(TEMPLATES, "modular");
    expect(r.length).toBe(1);
    expect(r[0].title).toMatch(/modular/i);
  });

  it("filtra por teaches (descripción pedagógica)", () => {
    const r = filterTemplates(TEMPLATES, "enlaces relativos");
    expect(r.length).toBeGreaterThanOrEqual(1);
  });

  it("respeta la categoría", () => {
    const r = filterTemplates(TEMPLATES, "", "Demos");
    expect(r.every((t) => t.category === "Demos")).toBe(true);
    expect(r.length).toBe(TEMPLATES.filter((t) => t.category === "Demos").length);
  });

  it("no encuentra nada con un término raro", () => {
    expect(filterTemplates(TEMPLATES, "zzzzzzz")).toEqual([]);
  });
});

describe("TEMPLATES catálogo", () => {
  it("todas las plantillas tienen un zipPath que empieza por /", () => {
    for (const t of TEMPLATES) {
      expect(t.zipPath.startsWith("/")).toBe(true);
      expect(t.zipPath.endsWith(".zip")).toBe(true);
    }
  });

  it("cada plantilla tiene id, título, descripción y teaches no vacíos", () => {
    for (const t of TEMPLATES) {
      expect(t.id.length).toBeGreaterThan(0);
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.teaches.length).toBeGreaterThan(0);
    }
  });

  it("los ids son únicos", () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("fileCount es ≥1", () => {
    for (const t of TEMPLATES) {
      expect(t.fileCount).toBeGreaterThanOrEqual(1);
    }
  });
});
