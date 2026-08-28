import { describe, expect, it, beforeEach } from "vitest";
import { useUsage, avgMs, p95Ms } from "../../src/lib/prism/usage";

const reset = () => useUsage.setState({ byModel: {}, days: {} });

describe("métricas de uso locales", () => {
  beforeEach(reset);

  it("registra peticiones OK con latencia y volumen", () => {
    useUsage.getState().record({ modelKey: "p::m", ok: true, ms: 1200, charsIn: 500, charsOut: 300, savedChars: 100 });
    const u = useUsage.getState().byModel["p::m"];
    expect(u.requests).toBe(1);
    expect(u.ok).toBe(1);
    expect(u.fail).toBe(0);
    expect(u.totalMs).toBe(1200);
    expect(u.charsIn).toBe(500);
    expect(u.charsOut).toBe(300);
    expect(u.savedChars).toBe(100);
  });

  it("los fallos suben requests+fail sin tocar la latencia", () => {
    useUsage.getState().record({ modelKey: "p::m", ok: true, ms: 800 });
    useUsage.getState().record({ modelKey: "p::m", ok: false, charsIn: 100 });
    const u = useUsage.getState().byModel["p::m"];
    expect(u.requests).toBe(2);
    expect(u.fail).toBe(1);
    expect(u.totalMs).toBe(800);
  });

  it("avgMs y p95Ms se calculan sobre las respuestas OK", () => {
    for (const ms of [100, 200, 300, 400, 1000, 2000, 5000]) {
      useUsage.getState().record({ modelKey: "p::m", ok: true, ms });
    }
    const u = useUsage.getState().byModel["p::m"];
    expect(avgMs(u)).toBe(Math.round(9000 / 7));
    expect(p95Ms(u)).toBe(5000);
  });

  it("el historial de latencias se acota (tope 40)", () => {
    for (let i = 0; i < 60; i++) {
      useUsage.getState().record({ modelKey: "p::m", ok: true, ms: i });
    }
    const u = useUsage.getState().byModel["p::m"];
    expect(u.ms.length).toBe(40);
    expect(u.requests).toBe(60);
  });

  it("cuenta peticiones por día y reset limpia todo", () => {
    useUsage.getState().record({ modelKey: "p::a", ok: true, ms: 10 });
    useUsage.getState().record({ modelKey: "p::b", ok: true, ms: 10 });
    const today = new Date().toISOString().slice(0, 10);
    expect(useUsage.getState().days[today]).toBe(2);
    useUsage.getState().reset();
    expect(useUsage.getState().byModel).toEqual({});
    expect(useUsage.getState().days).toEqual({});
  });
});
