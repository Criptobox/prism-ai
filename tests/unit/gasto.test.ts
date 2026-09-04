/** Prism AI — El techo de llamadas a modelos de pago.
 *
 * Con claves gratis, pasarse cuesta un 429. Con una de pago cuesta dinero, y
 * el orquestador multiplica: seis llamadas por encargo. Lo que se prueba aquí
 * es sobre todo que el techo **no se pueda esquivar sin querer**.
 */
import { describe, expect, it } from "vitest";
import {
  contarLlamada,
  normalizarTope,
  diaDe,
  convieneAvisar,
  resumenGasto,
  CONTADOR_VACIO,
  TOPE_DIARIO_POR_DEFECTO,
  TOPE_MINIMO,
  TOPE_MAXIMO,
  type Contador,
} from "../../src/lib/prism/gasto";

const nuevo = (): Contador => ({ ...CONTADOR_VACIO });
const T = new Date("2026-09-04T10:00:00").getTime();
const MANANA = new Date("2026-09-05T10:00:00").getTime();

describe("contarLlamada", () => {
  it("deja pasar hasta el tope y corta en el siguiente", () => {
    const c = nuevo();
    for (let i = 0; i < 3; i++) expect(contarLlamada(c, true, 3, T).ok).toBe(true);
    const v = contarLlamada(c, true, 3, T);
    expect(v.ok).toBe(false);
    expect(v.restantes).toBe(0);
  });

  it("una llamada RECHAZADA no gasta cupo", () => {
    // Si lo gastara, el contador se dispararía solo al reintentar y el techo
    // se volvería más estricto de lo que dice.
    const c = nuevo();
    contarLlamada(c, true, 1, T);
    contarLlamada(c, true, 1, T);
    contarLlamada(c, true, 1, T);
    expect(c.pago).toBe(1);
  });

  it("lo GRATIS no cuenta para el techo, pero se cuenta para poder verlo", () => {
    // Un techo que corta también lo gratis molesta sin proteger nada, y un
    // límite que estorba se acaba quitando.
    const c = nuevo();
    for (let i = 0; i < 50; i++) expect(contarLlamada(c, false, 3, T).ok).toBe(true);
    expect(c.gratis).toBe(50);
    expect(c.pago).toBe(0);
    expect(contarLlamada(c, true, 3, T).ok).toBe(true);
  });

  it("sin tope no corta nunca, y lo dice devolviendo null", () => {
    const c = nuevo();
    for (let i = 0; i < 500; i++) expect(contarLlamada(c, true, null, T).ok).toBe(true);
    expect(contarLlamada(c, true, null, T).restantes).toBeNull();
  });

  it("se reinicia al cambiar el día natural", () => {
    const c = nuevo();
    contarLlamada(c, true, 1, T);
    expect(contarLlamada(c, true, 1, T).ok).toBe(false);
    expect(contarLlamada(c, true, 1, MANANA).ok, "mañana empieza de cero").toBe(true);
    expect(c.gratis).toBe(0);
  });

  it("el motivo dice que el límite es TUYO y dónde se cambia", () => {
    // Sin eso, el usuario culpa a su proveedor y se pone a cambiar de clave.
    const c = nuevo();
    contarLlamada(c, true, 1, T);
    const v = contarLlamada(c, true, 1, T);
    expect(v.motivo).toContain("límite TUYO");
    expect(v.motivo).toContain("Ajustes");
    expect(v.motivo, "y que lo gratis sigue").toContain("gratis siguen");
  });

  it("el motivo NO menciona dinero", () => {
    const c = nuevo();
    contarLlamada(c, true, 1, T);
    expect(contarLlamada(c, true, 1, T).motivo).not.toMatch(/[$€]|euro|dólar/i);
  });
});

describe("diaDe", () => {
  it("usa el día LOCAL, no UTC", () => {
    // Con UTC, a quien esté en otro huso el techo le saltaría a mitad de la
    // tarde sin explicación.
    const d = new Date(2026, 8, 4, 23, 30);
    expect(diaDe(d.getTime())).toBe("2026-09-04");
  });

  it("rellena con ceros para que ordene bien", () => {
    expect(diaDe(new Date(2026, 0, 5).getTime())).toBe("2026-01-05");
  });
});

describe("normalizarTope", () => {
  it("null es una opción legítima: quien sabe lo que hace puede quitarlo", () => {
    expect(normalizarTope(null)).toBeNull();
  });

  it("recorta al rango usable", () => {
    expect(normalizarTope(1)).toBe(TOPE_MINIMO);
    expect(normalizarTope(999_999)).toBe(TOPE_MAXIMO);
    expect(normalizarTope(150)).toBe(150);
  });

  it("la basura cae al valor de fábrica, no a «sin tope»", () => {
    // Caer a «sin tope» convertiría una errata en un riesgo.
    expect(normalizarTope("no")).toBe(TOPE_DIARIO_POR_DEFECTO);
    expect(normalizarTope(undefined)).toBe(TOPE_DIARIO_POR_DEFECTO);
    expect(normalizarTope(NaN)).toBe(TOPE_DIARIO_POR_DEFECTO);
  });

  it("acepta el número escrito como texto (viene de un input)", () => {
    expect(normalizarTope("120")).toBe(120);
  });
});

describe("convieneAvisar", () => {
  it("avisa cerca del final, no al llegar", () => {
    // Un aviso al 100% no es un aviso.
    const c: Contador = { dia: "x", pago: 79, gratis: 0 };
    expect(convieneAvisar(c, 100)).toBe(false);
    expect(convieneAvisar({ ...c, pago: 80 }, 100)).toBe(true);
    expect(convieneAvisar({ ...c, pago: 99 }, 100)).toBe(true);
    expect(convieneAvisar({ ...c, pago: 100 }, 100), "ya no avisa: ya cortó").toBe(false);
  });

  it("sin tope no hay nada de lo que avisar", () => {
    expect(convieneAvisar({ dia: "x", pago: 900, gratis: 0 }, null)).toBe(false);
  });
});

describe("resumenGasto", () => {
  it("cuenta llamadas, no euros", () => {
    const t = resumenGasto({ dia: "x", pago: 12, gratis: 40 }, 200);
    expect(t).toBe("Hoy: 12 de 200 de pago · 40 gratis");
    expect(t).not.toMatch(/[$€]/);
  });

  it("sin tope no inventa un denominador", () => {
    expect(resumenGasto({ dia: "x", pago: 12, gratis: 0 }, null)).toContain("12 de pago");
  });
});
