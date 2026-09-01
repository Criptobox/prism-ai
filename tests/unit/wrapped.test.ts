import { describe, it, expect } from "vitest";
import { computeWrapped, ahorroPct, modelLabel, wrappedToHtml, type WrappedStats } from "../../src/lib/prism/wrapped";
import type { ModelUsage } from "../../src/lib/prism/usage";

function mkUsage(over: Partial<ModelUsage> = {}): ModelUsage {
  return {
    requests: 10,
    ok: 9,
    fail: 1,
    totalMs: 9000,
    ms: [800, 900, 1000, 1100, 1200],
    charsIn: 50000,
    charsOut: 8000,
    savedChars: 12000,
    lastUsed: Date.now(),
    ...over,
  };
}

describe("computeWrapped", () => {
  it("ventana vacía: hasActivity false y todo a 0", () => {
    const s = computeWrapped({}, {});
    expect(s.hasActivity).toBe(false);
    expect(s.totalRequests).toBe(0);
    expect(s.totalOk).toBe(0);
    expect(s.totalFail).toBe(0);
    expect(s.topModel).toBeNull();
    expect(s.topDay).toBeNull();
    expect(s.ranking).toEqual([]);
  });

  it("cuenta peticiones de los modelos en ventana", () => {
    const s = computeWrapped({
      "kimi::kimi-k3": mkUsage({ requests: 10, ok: 9, fail: 1 }),
      "groq::llama": mkUsage({ requests: 5, ok: 5, fail: 0 }),
    }, {});
    expect(s.totalRequests).toBe(15);
    expect(s.totalOk).toBe(14);
    expect(s.totalFail).toBe(1);
    expect(s.hasActivity).toBe(true);
  });

  it("ignora modelos cuya última actividad es anterior a la ventana", () => {
    const viejo = Date.now() - 30 * 86_400_000; // hace 30 días
    const s = computeWrapped({
      "kimi::kimi-k3": mkUsage({ requests: 100, lastUsed: viejo }),
    }, {});
    expect(s.totalRequests).toBe(0);
    expect(s.hasActivity).toBe(false);
  });

  it("topModel es el de más peticiones", () => {
    const s = computeWrapped({
      "kimi::kimi-k3": mkUsage({ requests: 10 }),
      "groq::llama": mkUsage({ requests: 30 }),
    }, {});
    expect(s.topModel).toBe("groq::llama");
    expect(s.ranking[0].modelKey).toBe("groq::llama");
  });

  it("ranking recorta a 5", () => {
    const byModel: Record<string, ModelUsage> = {};
    for (let i = 0; i < 10; i++) {
      byModel[`prov${i}::m${i}`] = mkUsage({ requests: 10 - i });
    }
    const s = computeWrapped(byModel, {});
    expect(s.ranking.length).toBe(5);
    expect(s.ranking[0].requests).toBe(10);
  });

  it("successRate se calcula bien", () => {
    const s = computeWrapped({
      "kimi::kimi-k3": mkUsage({ requests: 10, ok: 8, fail: 2 }),
    }, {});
    expect(s.successRate).toBeCloseTo(0.8, 5);
  });

  it("byDay respeta la ventana de días", () => {
    const hoy = new Date().toISOString().slice(0, 10);
    const viejo = new Date(Date.now() - 20 * 86_400_000).toISOString().slice(0, 10);
    const s = computeWrapped(
      { "kimi::kimi-k3": mkUsage() },
      { [hoy]: 5, [viejo]: 100 }
    );
    expect(s.byDay[hoy]).toBe(5);
    expect(s.byDay[viejo]).toBeUndefined();
    expect(s.topDay).toBe(hoy);
  });
});

describe("ahorroPct", () => {
  it("0 si no hay actividad", () => {
    expect(ahorroPct(computeWrapped({}, {}))).toBe(0);
  });

  it("porcentaje en [0, 100]", () => {
    const s = computeWrapped({
      "kimi::kimi-k3": mkUsage({ charsIn: 50000, savedChars: 12000 }),
    }, {});
    const p = ahorroPct(s);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThanOrEqual(100);
  });
});

describe("modelLabel", () => {
  it("devuelve proveedor · modelo para una clave válida", () => {
    const label = modelLabel("kimi::kimi-k3");
    expect(label).toContain("kimi-k3");
  });

  it("cae al pie si la clave no se parsea", () => {
    expect(modelLabel("sin-doble-dos-puntos")).toBe("sin-doble-dos-puntos");
  });
});

describe("wrappedToHtml", () => {
  it("genera HTML autocontenido válido", () => {
    const s: WrappedStats = computeWrapped({
      "kimi::kimi-k3": mkUsage(),
    }, { [new Date().toISOString().slice(0, 10)]: 5 });
    const html = wrappedToHtml(s, "3.34.0");
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
    expect(html).toContain("Prism");
  });

  it("muestra mensaje de vacío si no hay actividad", () => {
    const html = wrappedToHtml(computeWrapped({}, {}), "3.34.0");
    expect(html).toContain("Aún no hay actividad");
  });

  it("incluye el top model cuando hay actividad", () => {
    const s = computeWrapped({
      "kimi::kimi-k3": mkUsage({ requests: 50 }),
    }, {});
    const html = wrappedToHtml(s, "3.34.0");
    expect(html).toContain("kimi-k3");
  });
});
