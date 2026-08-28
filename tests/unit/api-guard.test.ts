import { describe, it, expect } from "vitest";
import { evaluateGuard, type GuardInput } from "../../src/lib/prism/api-guard";

const base: GuardInput = {
  origin: null,
  host: "mi-prism.vercel.app",
  code: null,
  accessCode: null,
  isProduction: false,
  touchesDisk: false,
};
const con = (extra: Partial<GuardInput>): GuardInput => ({ ...base, ...extra });

describe("origen", () => {
  it("deja pasar una petición del mismo host", () => {
    expect(
      evaluateGuard(con({ origin: "https://mi-prism.vercel.app" })).ok
    ).toBe(true);
  });

  it("rechaza una petición desde otra web", () => {
    const r = evaluateGuard(con({ origin: "https://malicioso.com" }));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.status).toBe(403);
  });

  it("rechaza un Origin que no es una URL", () => {
    expect(evaluateGuard(con({ origin: "null-ish??" })).ok).toBe(false);
  });

  it("sin Origin no bloquea por ese motivo (curl, misma pestaña)", () => {
    expect(evaluateGuard(con({ origin: null })).ok).toBe(true);
  });
});

describe("código de acceso", () => {
  it("sin código configurado, no se pide nada", () => {
    expect(evaluateGuard(con({ accessCode: null, code: null })).ok).toBe(true);
  });

  it("con código configurado, exige el correcto", () => {
    const sin = evaluateGuard(con({ accessCode: "s3creto" }));
    expect(!sin.ok && sin.status).toBe(401);

    const malo = evaluateGuard(con({ accessCode: "s3creto", code: "otro" }));
    expect(!malo.ok && malo.status).toBe(401);

    expect(evaluateGuard(con({ accessCode: "s3creto", code: "s3creto" })).ok).toBe(true);
  });

  it("ignora espacios alrededor del código", () => {
    expect(evaluateGuard(con({ accessCode: " s3creto ", code: "s3creto" })).ok).toBe(true);
  });
});

describe("rutas que tocan el disco del servidor", () => {
  it("en desarrollo funcionan sin configurar nada", () => {
    expect(evaluateGuard(con({ touchesDisk: true, isProduction: false })).ok).toBe(true);
  });

  it("en producción SIN código quedan apagadas, no abiertas", () => {
    const r = evaluateGuard(con({ touchesDisk: true, isProduction: true }));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.status).toBe(503);
    expect(!r.ok && r.hint).toContain("PRISM_ACCESS_CODE");
  });

  it("en producción CON código funcionan si lo traes", () => {
    expect(
      evaluateGuard(
        con({ touchesDisk: true, isProduction: true, accessCode: "s3creto", code: "s3creto" })
      ).ok
    ).toBe(true);
  });

  it("en producción con código pero sin traerlo, 401", () => {
    const r = evaluateGuard(
      con({ touchesDisk: true, isProduction: true, accessCode: "s3creto" })
    );
    expect(!r.ok && r.status).toBe(401);
  });
});

describe("el ataque concreto que motivó esto", () => {
  it("curl sin cabeceras contra /api/repos en producción no pasa", () => {
    // el atacante no manda Origin (por eso el filtro viejo no le veía)
    const r = evaluateGuard({
      origin: null,
      host: "mi-prism.vercel.app",
      code: null,
      accessCode: null,
      isProduction: true,
      touchesDisk: true,
    });
    expect(r.ok).toBe(false);
  });

  it("y el dueño, con su código puesto, sí trabaja", () => {
    const r = evaluateGuard({
      origin: "https://mi-prism.vercel.app",
      host: "mi-prism.vercel.app",
      code: "s3creto",
      accessCode: "s3creto",
      isProduction: true,
      touchesDisk: true,
    });
    expect(r.ok).toBe(true);
  });
});
