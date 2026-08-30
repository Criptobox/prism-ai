import { describe, expect, it } from "vitest";
import {
  compareRuns,
  comparables,
  type RunSnapshot,
} from "../../src/lib/prism/regression";
import type { QAResult } from "../../src/lib/prism/visual-qa";

function snap(overrides: Partial<RunSnapshot> = {}): RunSnapshot {
  return {
    at: 1_000,
    entry: "index.html",
    logs: [],
    qa: null,
    htmlBytes: 4_000,
    ...overrides,
  };
}

function qa(items: Array<{ tipo: string; detalle: string }>, ok = false): QAResult {
  return { width: 320, ok, items: items as never, at: 2_000 };
}

describe("regression — comparables", () => {
  it("solo compara la misma página de entrada", () => {
    expect(comparables(snap(), snap())).toBe(true);
    expect(comparables(snap({ entry: "a.html" }), snap({ entry: "b.html" }))).toBe(false);
    expect(comparables(null, snap())).toBe(false);
    expect(comparables(snap(), null)).toBe(false);
  });
});

describe("regression — compareRuns", () => {
  it("sin cambios de por medio: igual, no opinión", () => {
    const d = compareRuns(snap({ qa: qa([], true) }), snap({ qa: qa([], true) }));
    expect(d.nivel).toBe("igual");
    expect(d.nuevos).toEqual([]);
    expect(d.arreglados).toEqual([]);
  });

  it("detecta errores NUEVOS que el cambio introdujo", () => {
    const d = compareRuns(
      snap({ logs: [] }),
      snap({ logs: [{ level: "error", text: "TypeError: x is not a function" }] })
    );
    expect(d.nivel).toBe("mal");
    expect(d.nuevos).toEqual(["TypeError: x is not a function"]);
  });

  it("detecta errores ARREGLADOS y no rompió ninguno", () => {
    const d = compareRuns(
      snap({ logs: [{ level: "error", text: "404 styles.css" }] }),
      snap({ logs: [] })
    );
    expect(d.nivel).toBe("ok");
    expect(d.arreglados).toEqual(["404 styles.css"]);
    expect(d.nuevos).toEqual([]);
  });

  it("mezcla: dos errores nuevos y uno arreglado → mal (lo nuevo manda)", () => {
    const d = compareRuns(
      snap({ logs: [{ level: "error", text: "A" }] }),
      snap({
        logs: [
          { level: "error", text: "A" },
          { level: "error", text: "B" },
          { level: "error", text: "C" },
        ],
      })
    );
    expect(d.nivel).toBe("mal");
    expect(d.nuevos.sort()).toEqual(["B", "C"]);
    expect(d.arreglados).toEqual([]);
  });

  it("los avisos nuevos se listan aparte y no cambian el veredicto", () => {
    const d = compareRuns(
      snap({ logs: [] }),
      snap({ logs: [{ level: "warn", text: "Deprecated API" }] })
    );
    expect(d.avisosNuevos).toEqual(["Deprecated API"]);
    expect(d.nivel).toBe("igual");
  });

  it("QA móvil que empeora → mal aunque la consola esté limpia", () => {
    const d = compareRuns(
      snap({ qa: qa([], true) }),
      snap({ qa: qa([{ tipo: "scroll", detalle: "La página se sale 40px" }]) })
    );
    expect(d.nivel).toBe("mal");
    expect(d.qa.regressed.length).toBe(1);
    expect(d.qa.resueltos).toEqual([]);
  });

  it("QA móvil que mejora → ok", () => {
    const d = compareRuns(
      snap({ qa: qa([{ tipo: "scroll", detalle: "se sale" }]) }),
      snap({ qa: qa([], true) })
    );
    expect(d.nivel).toBe("ok");
    expect(d.qa.resueltos.length).toBe(1);
  });

  it("sin respuesta del medidor en un lado: se dice, no se inventa", () => {
    const d = compareRuns(
      snap({ qa: qa([{ tipo: "scroll", detalle: "se sale" }]) }),
      snap({ qa: qa([], true) })
    );
    // el después sí respondió (ok) y el antes también → comparable
    expect(d.qa.resueltos.length).toBe(1);
    const sinRespuesta = compareRuns(
      snap({ qa: qa([], true) }),
      snap({ qa: { width: 320, ok: true, items: [], at: 3, noRespondio: true } })
    );
    // con un lado sin datos no se atribuyen hallazgos
    expect(sinRespuesta.qa.regressed).toEqual([]);
    expect(sinRespuesta.qa.resueltos).toEqual([]);
  });

  it("consola y QA sin señales en ambos lados → sin-datos", () => {
    const d = compareRuns(
      snap({ qa: { width: 320, ok: true, items: [], at: 1, noRespondio: true } }),
      snap({ qa: { width: 320, ok: true, items: [], at: 2, noRespondio: true } })
    );
    expect(d.nivel).toBe("sin-datos");
  });

  it("mismos errores en ambos lados: la repetición no es un error nuevo", () => {
    const d = compareRuns(
      snap({ logs: [{ level: "error", text: "mismo" }] }),
      snap({ logs: [{ level: "error", text: "mismo" }] })
    );
    expect(d.nuevos).toEqual([]);
    expect(d.arreglados).toEqual([]);
    expect(d.nivel).toBe("igual");
  });

  it("registra el peso del HTML para verlo de un vistazo", () => {
    const d = compareRuns(snap({ htmlBytes: 4_000 }), snap({ htmlBytes: 5_000 }));
    expect(d.html).toEqual({ antes: 4_000, despues: 5_000 });
  });
});
