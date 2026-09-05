import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  CALIFICACIONES,
  diasEntre,
  extraerTarjetas,
  fechaHoy,
  resumenRepaso,
  sumarDias,
  tarjetasVencidas,
  etiquetaIntervalo,
  programar,
  PROMPT_REPASO,
  type TarjetaRepaso,
} from "../../src/lib/prism/repaso";

function tarjeta(par: Partial<TarjetaRepaso> = {}): TarjetaRepaso {
  return {
    id: par.id ?? "t1",
    frente: par.frente ?? "¿Capital de Perú?",
    dorso: par.dorso ?? "Lima",
    repeticiones: par.repeticiones ?? 0,
    facilidad: par.facilidad ?? 2.5,
    intervaloDias: par.intervaloDias ?? 0,
    vencimiento: par.vencimiento ?? "2026-01-10",
    creada: par.creada ?? 1,
    origen: par.origen,
  };
}

describe("fechaHoy / sumarDias / diasEntre", () => {
  it("formatea la fecha local con dos dígitos y no se desplaza un día", () => {
    // 2026-01-03 23:30 en una zona negativa (UTC-5) sigue siendo el día 3 local
    expect(fechaHoy(new Date(2026, 0, 3, 23, 30).getTime())).toBe("2026-01-03");
    expect(fechaHoy(new Date(2026, 10, 25).getTime())).toBe("2026-11-25");
  });

  it("sumarDias cruza meses y años sin inventarse un día", () => {
    expect(sumarDias("2026-01-30", 6)).toBe("2026-02-05");
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28"); // 2026 no es bisiesto
  });

  it("diasEntre es simétrica y cuadra con sumarDias", () => {
    expect(diasEntre("2026-01-10", "2026-01-15")).toBe(5);
    expect(diasEntre("2026-01-15", "2026-01-10")).toBe(-5);
    expect(diasEntre("2026-01-10", sumarDias("2026-01-10", 9))).toBe(9);
  });
});

describe("programar (SM-2)", () => {
  const hoy = "2026-01-10";

  it("la primera aprobación da 1 día, la segunda 6", () => {
    const d1 = programar({ repeticiones: 0, facilidad: 2.5, intervaloDias: 0 }, 4, hoy);
    expect(d1.repeticiones).toBe(1);
    expect(d1.intervaloDias).toBe(1);
    expect(d1.vencimiento).toBe("2026-01-11");

    const d2 = programar(d1, 4, hoy);
    expect(d2.repeticiones).toBe(2);
    expect(d2.intervaloDias).toBe(6);
    expect(d2.vencimiento).toBe("2026-01-16");
  });

  it("a partir de ahí el intervalo crece multiplicando por la facilidad", () => {
    let t = { repeticiones: 2, facilidad: 2.5, intervaloDias: 6 };
    t = programar(t, 5, hoy); // fácil sube la facilidad
    expect(t.repeticiones).toBe(3);
    // EF 2.5 → 2.6; intervalo 6 × 2.6 ≈ 16
    expect(t.intervaloDias).toBe(16);
    expect(t.facilidad).toBeGreaterThan(2.5);
  });

  it("«difícil» aprueba (SM-2: la escalera sigue) pero castiga la facilidad", () => {
    const d = programar({ repeticiones: 2, facilidad: 2.5, intervaloDias: 6 }, 3, hoy);
    // q3 pasa y la escalera continúa: 6 × EF(2.5→2.36) ≈ 14. Lo que castiga
    // «difícil» no es el día de mañana sino que la escalera crezca más despacio.
    expect(d.intervaloDias).toBe(14);
    expect(d.facilidad).toBe(2.36);
    expect(d.facilidad).toBeLessThan(2.5);
  });

  it("«otra vez» suspende: vuelve HOY, se resetea y penaliza", () => {
    const d = programar({ repeticiones: 5, facilidad: 2.5, intervaloDias: 20 }, 1, hoy);
    expect(d.repeticiones).toBe(0);
    expect(d.vencimiento).toBe(hoy);
    expect(d.facilidad).toBeLessThan(2.5);
  });

  it("la facilidad no baja nunca de 1.3 (una tarjeta no se condena para siempre)", () => {
    let t = { repeticiones: 0, facilidad: 1.3, intervaloDias: 1 };
    for (let i = 0; i < 10; i++) t = programar(t, 1, hoy);
    expect(t.facilidad).toBe(1.3);
  });

  it("redondea a dos decimales (nada de 2.4500000000000004 en pantalla)", () => {
    const d = programar({ repeticiones: 0, facilidad: 2.5123, intervaloDias: 0 }, 5, hoy);
    expect(String(d.facilidad)).not.toContain("000000");
    expect(d.facilidad).toBe(2.61); // 2.5123 + 0.1 (q5) → redondeado
  });

  it("el techo de facilidad es 2.9 y no lo salta ni «fácil» repetido", () => {
    let t = { repeticiones: 0, facilidad: 2.88, intervaloDias: 1 };
    for (let i = 0; i < 10; i++) t = programar(t, 5, hoy);
    expect(t.facilidad).toBe(2.9);
  });
});

describe("extraerTarjetas", () => {
  it("lee un bloque prism-repaso bien formado", () => {
    const txt = `Blabla previa.\n\`\`\`prism-repaso\n{ "tarjetas": [\n {"frente": "¿Qué es el SSRF?", "dorso": "Forjar peticiones hacia la red interna"},\n {"frente": "¿Quién valida Luhn?", "dorso": "El escudo PII"}\n]}\n\`\`\`\nY un saludo final.`;
    expect(extraerTarjetas(txt)).toEqual([
      { frente: "¿Qué es el SSRF?", dorso: "Forjar peticiones hacia la red interna" },
      { frente: "¿Quién valida Luhn?", dorso: "El escudo PII" },
    ]);
  });

  it("tolera ```json y vallados sin lenguaje SIEMPRE que traigan «tarjetas»", () => {
    const json = '```json\n{"tarjetas":[{"frente":"A","dorso":"B"}]}\n```';
    const solo = '```\n{"tarjetas":[{"frente":"C","dorso":"D"}]}\n```';
    expect(extraerTarjetas(json)).toHaveLength(1);
    expect(extraerTarjetas(solo)).toHaveLength(1);
  });

  it("NO toca un bloque json cualquiera sin «tarjetas» (podría ser código de la respuesta)", () => {
    const txt = '```json\n{"nombre":"Ada","rol":"admin"}\n```';
    expect(extraerTarjetas(txt)).toEqual([]);
  });

  it("se traga un JSON roto sin petar y sin botón fantasma", () => {
    const txt = '```prism-repaso\n{ "tarjetas": [ {"frente": sin comillas ] }\n```';
    expect(extraerTarjetas(txt)).toEqual([]);
  });

  it("deduplica por pregunta normalizada dentro y entre bloques", () => {
    // Variantes que solo cambian en mayúsculas, espacios de más y signos
    // duplicados: para el modelo son «la misma» pregunta.
    const txt =
      '```prism-repaso\n{"tarjetas":[{"frente":"¿Qué es X?","dorso":"a"},{"frente":"  ¿QUÉ ES    X?  ","dorso":"b"}]}\n```\n```prism-repaso\n{"tarjetas":[{"frente":"¿qué es X?","dorso":"c"}]}\n```';
    expect(extraerTarjetas(txt)).toHaveLength(1);
  });

  it("suelta tarjetas sin frente o sin dorso, y recorta las kilométricas", () => {
    const txt =
      '```prism-repaso\n{"tarjetas":[{"frente":"","dorso":"x"},{"dorso":"x"},{"frente":"ok","dorso":""},{"frente":"kilo","dorso":"' +
      "l".repeat(4000) +
      '"}]}\n```';
    const out = extraerTarjetas(txt);
    expect(out).toHaveLength(1);
    expect(out[0].dorso.length).toBeLessThan(1600);
    expect(out[0].dorso.endsWith("…")).toBe(true);
  });
});

describe("resumenRepaso y tarjetasVencidas", () => {
  const hoy = "2026-01-10";
  const tarjetas = [
    tarjeta({ id: "v", vencimiento: "2026-01-09", repeticiones: 2 }),
    tarjeta({ id: "h", vencimiento: hoy }),
    tarjeta({ id: "f", vencimiento: "2026-01-12", repeticiones: 1 }),
    tarjeta({ id: "l", vencimiento: "2026-02-01", repeticiones: 5 }),
  ];

  it("cuenta vencidas, frescas y aprendidas, y dice cuándo vuelve la más cercana", () => {
    const r = resumenRepaso(tarjetas, hoy);
    expect(r.total).toBe(4);
    expect(r.vencidas).toBe(2);
    expect(r.frescas).toBe(1); // solo "h" (repeticiones 0): "f" ya acertó una
    expect(r.aprendidas).toBe(2);
    expect(r.proxima).toBe("2026-01-12");
  });

  it("la cola saca lo más atrasado primero y nunca lo futuro", () => {
    const cola = tarjetasVencidas(tarjetas, hoy);
    expect(cola.map((t) => t.id)).toEqual(["v", "h"]);
  });
});

describe("PROMPT_REPASO y CALIFICACIONES", () => {
  it("el prompt enseña el lenguaje de bloque que el lector espera", () => {
    expect(PROMPT_REPASO).toContain("```prism-repaso");
    expect(PROMPT_REPASO).toContain('"tarjetas"');
  });

  it("las cuatro calificaciones cubren los valores SM-2 con y sin aprobar", () => {
    expect(CALIFICACIONES.map((c) => c.q)).toEqual([1, 3, 4, 5]);
    expect(CALIFICACIONES.map((c) => c.label)).toEqual(["Otra vez", "Difícil", "Bien", "Fácil"]);
  });

  it("la etiqueta de intervalo habla como habla la gente", () => {
    expect(etiquetaIntervalo(0)).toBe("hoy");
    expect(etiquetaIntervalo(1)).toBe("1 día");
    expect(etiquetaIntervalo(16)).toBe("16 días");
  });
});

describe("propiedades del programador (fast-check)", () => {
  const hoy = "2026-01-10";

  it("cualquier calificación deja la facilidad dentro de [1.3, 2.9] y el intervalo ≥ 1", () => {
    const arbitrariedad = fc.record({
      repeticiones: fc.nat(30),
      // fast-check pide 32-bit en los límites de float: fround redondea 1.3/2.9
      facilidad: fc.float({ min: Math.fround(1.3), max: Math.fround(2.9), noNaN: true }),
      intervaloDias: fc.nat(365),
    });
    const qs = [1, 3, 4, 5] as const;
    fc.assert(
      fc.property(arbitrariedad, fc.integer({ min: 0, max: 3 }), (t, i) => {
        const d = programar(t, qs[i], hoy);
        expect(d.facilidad).toBeGreaterThanOrEqual(1.3);
        expect(d.facilidad).toBeLessThanOrEqual(2.9);
        expect(d.intervaloDias).toBeGreaterThanOrEqual(1);
        expect(diasEntre(hoy, d.vencimiento)).toBeGreaterThanOrEqual(0);
        if (d.repeticiones > 0) expect(d.repeticiones).toBe(t.repeticiones + 1);
      }),
      { numRuns: 300 }
    );
  });

  it("aprobar siempre crece: el intervalo nunca retrocede entre dos aciertos seguidos", () => {
    fc.assert(
      fc.property(
        fc.record({
          repeticiones: fc.nat(25),
          facilidad: fc.float({ min: Math.fround(1.3), max: Math.fround(2.9), noNaN: true }),
          intervaloDias: fc.nat(365),
        }),
        fc.constantFrom(4 as const, 5 as const),
        (t, q) => {
          const d = programar(t, q, hoy);
          if (t.repeticiones >= 2) {
            expect(d.intervaloDias).toBeGreaterThanOrEqual(Math.round(t.intervaloDias * 1.3));
          }
        }
      ),
      { numRuns: 300 }
    );
  });
});
