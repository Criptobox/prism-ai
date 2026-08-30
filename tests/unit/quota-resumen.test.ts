import { describe, expect, it } from "vitest";
import { resumenCuota, tonoCuota, type ProviderQuota } from "../../src/lib/prism/quota";

const w = (remaining: number, limit: number) => ({ remaining, limit, resetAt: 0 });

describe("resumenCuota", () => {
  it("sin datos no inventa nada", () => {
    expect(resumenCuota(undefined)).toBeNull();
    expect(resumenCuota({ kind: "medida", at: 1 })).toBeNull();
  });

  it("lo consultado no cuenta: es saldo, no límite de tasa", () => {
    // Mezclar los créditos de una clave con un límite por minuto daría un
    // porcentaje que significa cosas distintas según el proveedor.
    const q: ProviderQuota = { kind: "consultada", at: 1, consulted: { used: 5, limit: 100, unit: "créditos", at: 1 } };
    expect(resumenCuota(q)).toBeNull();
  });

  it("elige la ventana más apretada, que es la que te va a cortar", () => {
    const q: ProviderQuota = { kind: "medida", at: 1, windows: { requests: w(900, 1000), tokens: w(2, 100) } };
    expect(resumenCuota(q)).toEqual({ pct: 2, cubo: "tokens" });
  });

  it("redondea y se queda dentro de 0-100", () => {
    expect(resumenCuota({ kind: "medida", at: 1, windows: { r: w(1, 3) } })?.pct).toBe(33);
    expect(resumenCuota({ kind: "medida", at: 1, windows: { r: w(0, 10) } })?.pct).toBe(0);
  });

  it("un límite de cero se ignora en vez de dividir por él", () => {
    expect(resumenCuota({ kind: "medida", at: 1, windows: { r: w(0, 0) } })).toBeNull();
  });
});

describe("tonoCuota", () => {
  it("avisa antes de que te quedes sin nada", () => {
    expect(tonoCuota(80)).toBe("ok");
    expect(tonoCuota(30)).toBe("justo");
    expect(tonoCuota(10)).toBe("critico");
    expect(tonoCuota(0)).toBe("critico");
  });
});
