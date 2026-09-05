import { describe, expect, it } from "vitest";
import {
  entradaChangelog,
  mensajeCommit,
  tieneWorkflowPages,
  urlPages,
  workflowPages,
  RUTA_WORKFLOW,
} from "../../src/lib/prism/deploy";

describe("workflowPages", () => {
  it("es un workflow válido de Actions con Pages", () => {
    const yml = workflowPages();
    expect(yml).toContain("name: Deploy to GitHub Pages");
    expect(yml).toContain("actions/deploy-pages@v4");
    expect(yml).toContain("branches: [main]");
    expect(yml).not.toContain("[TU]"); // nada por rellenar: viaja listo
  });
});

describe("mensajeCommit", () => {
  it("un solo archivo nuevo: «Añade x»", () => {
    expect(mensajeCommit([{ tipo: "alta", path: "galeria.html" }])).toBe("Añade galeria.html");
  });
  it("una edición: «Actualiza x»", () => {
    expect(mensajeCommit([{ tipo: "edicion", path: "index.html" }])).toBe("Actualiza index.html");
  });
  it("mezcla: «Cambios en» + cuerpo con el detalle", () => {
    const m = mensajeCommit([
      { tipo: "alta", path: "a.html" },
      { tipo: "edicion", path: "b.css" },
    ]);
    expect(m).toMatch(/^Cambios en/);
    expect(m).toContain("- nuevos: a.html");
    expect(m).toContain("- modificados: b.css");
  });
  it("lista larga se resume con «y N más»", () => {
    const m = mensajeCommit(
      Array.from({ length: 8 }, (_, i) => ({
        tipo: "alta" as const,
        path: `archivo${i}.html`,
      }))
    );
    expect(m).toMatch(/y 5 más/);
  });
  it("primera línea ≤ 72 caracteres", () => {
    const m = mensajeCommit([{ tipo: "edicion", path: "x".repeat(90) + ".html" }]);
    expect(m.split("\n")[0].length).toBeLessThanOrEqual(72);
  });
  it("sin cambios dice que no hay", () => {
    expect(mensajeCommit([])).toMatch(/Sin cambios/);
  });
});

describe("entradaChangelog", () => {
  it("sin CHANGELOG previo crea la cabecera", () => {
    const c = entradaChangelog("Añade galería", "2026-01-02");
    expect(c).toMatch(/^# CHANGELOG/);
    expect(c).toContain("## 2026-01-02");
    expect(c).toContain("Añade galería");
  });
  it("con CHANGELOG previo inserta al principio sin duplicar cabecera", () => {
    const previo = "# CHANGELOG\n\n## 2026-01-01\n\nviejo\n";
    const c = entradaChangelog("nuevo", "2026-01-02", previo);
    const posNuevo = c.indexOf("nuevo");
    const posViejo = c.indexOf("viejo");
    expect(posNuevo).toBeGreaterThan(-1);
    expect(posNuevo).toBeLessThan(posViejo);
    expect(c.match(/# CHANGELOG/g)?.length).toBe(1);
  });
});

describe("pages", () => {
  it("urlPages construye la URL pública", () => {
    expect(urlPages("ada", "mi-web")).toBe("https://ada.github.io/mi-web/");
  });
  it("detecta el workflow ya presente", () => {
    expect(tieneWorkflowPages([RUTA_WORKFLOW, "index.html"])).toBe(true);
    expect(tieneWorkflowPages(["index.html"])).toBe(false);
  });
});
