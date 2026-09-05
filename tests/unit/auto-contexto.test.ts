import { describe, expect, it } from "vitest";
import {
  extraerKeywords,
  buscarContexto,
  hayContextoTurno,
  renderContextoParaPrompt,
  resumenContextoTurno,
} from "../../src/lib/prism/auto-contexto";
import { MEMORIA_VACIA, addDecision, addError } from "../../src/lib/prism/memoria-proyecto";

describe("extraerKeywords", () => {
  it("prioriza rutas y nombres de archivo", () => {
    const kw = extraerKeywords("cambia el color en src/styles.css y revisa app.js");
    expect(kw).toContain("src/styles.css");
    expect(kw).toContain("app.js");
  });

  it("ignora stopwords y palabras cortas", () => {
    const kw = extraerKeywords("el de la que por y para");
    expect(kw).toEqual([]);
  });

  it("prompt vacío no explota", () => {
    expect(extraerKeywords("")).toEqual([]);
  });
});

describe("buscarContexto", () => {
  const archivos = ["index.html", "styles.css", "app.js"];
  const contenido: Record<string, string> = {
    "index.html": "<html><body>tienda de café con galería</body></html>",
    "styles.css": "body { background: crema; }",
    "app.js": "const precios = [1,2,3];",
  };

  it("encuentra archivos por nombre", () => {
    const c = buscarContexto("arregla el menú de app.js", { archivosDisponibles: archivos });
    expect(c.archivos).toContain("app.js");
  });

  it("encuentra archivos por contenido cuando el nombre no dice nada", () => {
    const c = buscarContexto("cambia la tienda de café para que el hero se vea mejor", {
      archivosDisponibles: archivos,
      contenidoArchivos: contenido,
    });
    expect(c.archivos).toContain("index.html");
  });

  it("recupera decisiones y errores pertinentes de la memoria", () => {
    let mem = addDecision(MEMORIA_VACIA, "la paleta del proyecto es cálida (crema)", "usuario");
    mem = addError(mem, "el carrusel rompe en móvil", { solucion: "usar scroll-snap" });
    const c = buscarContexto("arregla el carrusel en móvil y respeta la paleta cálida", {
      memoria: mem,
    });
    expect(c.decisiones).toHaveLength(1);
    expect(c.errores.some((e) => e.includes("carrusel"))).toBe(true);
  });

  it("marca reglas que afectan archivos mencionados", () => {
    const c = buscarContexto("modifica Header.tsx y el footer", {
      archivosDisponibles: ["Header.tsx", "footer.html"],
      reglas: [{ patron: "Header.tsx", motivo: "no tocar en tareas visuales" }],
    });
    expect(c.reglas).toHaveLength(1);
    expect(c.reglas[0]).toMatch(/Header\.tsx/);
  });

  it("sin nada pertinente devuelve vacío", () => {
    const c = buscarContexto("cuenta un chiste", { archivosDisponibles: archivos });
    expect(hayContextoTurno(c)).toBe(false);
  });
});

describe("render y resumen", () => {
  it("render null cuando no hay nada", () => {
    expect(renderContextoParaPrompt({
      archivos: [], decisiones: [], errores: [], reglas: [], notas: [],
    })).toBeNull();
  });

  it("el resumen junta las partes con separador", () => {
    const s = resumenContextoTurno({
      archivos: ["a", "b"],
      decisiones: ["d"],
      errores: [],
      reglas: ["r"],
      notas: [],
    });
    expect(s).toBe("2 archivo(s) · 1 decisión(es) · 1 regla(s)");
  });

  it("el bloque del prompt avisa de las reglas", () => {
    const t = renderContextoParaPrompt({
      archivos: [],
      decisiones: [],
      errores: [],
      reglas: ["Header.tsx — no tocar"],
      notas: [],
    })!;
    expect(t).toMatch(/NO tocar/);
  });
});
