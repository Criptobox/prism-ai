import { describe, expect, it } from "vitest";
import { citasDe, tieneEvidencia } from "../../src/lib/prism/evidencia";

describe("citasDe", () => {
  it("extrae una cita simple archivo:línea", () => {
    expect(citasDe("El bug está en app.js:42 según el código.")).toEqual([
      { path: "app.js", linea: 42, hasta: 42 },
    ]);
  });

  it("extrae rangos y variantes con backticks", () => {
    const citas = citasDe("`styles.css`:10-15 define el hero y src/app.js:3 lo usa");
    expect(citas).toContainEqual({ path: "styles.css", linea: 10, hasta: 15 });
    expect(citas).toContainEqual({ path: "src/app.js", linea: 3, hasta: 3 });
  });

  it("tolera el guion largo en rangos", () => {
    expect(citasDe("index.html:12–20")).toEqual([
      { path: "index.html", linea: 12, hasta: 20 },
    ]);
  });

  it("ignora URLs y horas", () => {
    expect(citasDe("mira http://localhost:8080 a las 12:30")).toEqual([]);
  });

  it("deduplica y limita a 12", () => {
    const texto = Array.from({ length: 20 }, (_, i) => `a.js:${i + 1}`).join(" ");
    expect(citasDe(texto).length).toBeLessThanOrEqual(12);
    expect(citasDe("a.js:5 y a.js:5")).toHaveLength(1);
  });

  it("encuentra la forma verbal «línea 42 de index.html»", () => {
    expect(citasDe("mira la línea 42 de index.html")).toEqual([
      { path: "index.html", linea: 42, hasta: 42 },
    ]);
  });

  it("normaliza la barra inicial", () => {
    expect(citasDe("/src/app.js:7")[0].path).toBe("src/app.js");
  });

  it("texto vacío no explota", () => {
    expect(citasDe("")).toEqual([]);
    expect(tieneEvidencia("")).toBe(false);
  });

  it("tieneEvidencia true con cualquier cita", () => {
    expect(tieneEvidencia("en styles.css:1")).toBe(true);
  });
});
