/** Prism AI — La frescura de lo que enseña el radar.
 *
 * El radar es en su mayor parte un catálogo escrito a mano, y una oferta que
 * dice «Vigente» sin fecha sigue diciéndolo dos años después. Es la misma
 * regla que la cuota: si no se puede saber que sigue vigente, no se afirma —
 * se dice cuándo se miró.
 */
import { describe, it, expect } from "vitest";
import {
  frescuraDe,
  textoFrescura,
  pideRevision,
  DIAS_PARA_CADUCAR,
  DIAS_PARA_VIEJA,
} from "../../src/lib/prism/frescura";

const AHORA = Date.parse("2026-08-31T12:00:00Z");
const haceDias = (d: number) => new Date(AHORA - d * 86_400_000).toISOString();

describe("frescuraDe", () => {
  it("lo de esta semana es reciente", () => {
    expect(frescuraDe(haceDias(3), AHORA)).toBe("reciente");
  });
  it("pasado el mes, hay que revisarlo", () => {
    expect(frescuraDe(haceDias(DIAS_PARA_CADUCAR), AHORA)).toBe("por-revisar");
  });
  it("pasados los tres meses, es vieja", () => {
    expect(frescuraDe(haceDias(DIAS_PARA_VIEJA), AHORA)).toBe("vieja");
  });
  it("sin fecha no se presume nada", () => {
    expect(frescuraDe(undefined, AHORA)).toBe("sin-fecha");
    expect(frescuraDe("no es una fecha", AHORA)).toBe("sin-fecha");
  });
});

describe("textoFrescura — dice cuándo se miró, no que siga vigente", () => {
  it("los primeros días, en días", () => {
    expect(textoFrescura(haceDias(0), AHORA)).toBe("verificado hoy");
    expect(textoFrescura(haceDias(1), AHORA)).toBe("verificado ayer");
    expect(textoFrescura(haceDias(5), AHORA)).toBe("verificado hace 5 días");
  });
  it("pasado el mes, cambia el tono: ya no dice «verificado», dice «sin verificar»", () => {
    expect(textoFrescura(haceDias(65), AHORA)).toBe("sin verificar desde hace 2 meses");
  });
  it("sin fecha lo dice, en vez de callarse", () => {
    expect(textoFrescura(undefined, AHORA)).toBe("sin fecha de verificación");
  });
});

describe("pideRevision", () => {
  it("solo lo reciente pasa sin aviso", () => {
    expect(pideRevision("reciente")).toBe(false);
    expect(pideRevision("por-revisar")).toBe(true);
    expect(pideRevision("vieja")).toBe(true);
    expect(pideRevision("sin-fecha")).toBe(true);
  });
});
