/** Prism AI — Que «Auto» aprenda de lo que TE ha funcionado.
 *
 * `useUsage` guarda aciertos, milisegundos y caracteres por modelo desde hace
 * versiones, y `buildTaskChain` no lo miraba: ordenaba por una tabla estática
 * y por el último acierto. Auto no aprendía, recordaba una cosa.
 *
 * La regla que estos tests protegen: **sin muestras suficientes no se opina**.
 * Ajustar con dos respuestas sería la misma clase de invento que un
 * porcentaje de cuota sacado de la manga.
 */
import { describe, it, expect } from "vitest";
import {
  experienciaDe,
  ajustePorExperiencia,
  textoExperiencia,
  MIN_MUESTRAS,
  PESO_EXPERIENCIA,
  MS_LENTO,
} from "../../src/lib/prism/experiencia";
import { buildTaskChain } from "../../src/lib/prism/task-router";
import { makeModelKey } from "../../src/lib/prism/types";

const uso = (requests: number, ok: number, totalMs = 0) => ({
  requests,
  ok,
  fail: requests - ok,
  totalMs,
});

describe("experienciaDe — sin dato, se dice sin dato", () => {
  it("por debajo del mínimo de muestras devuelve null", () => {
    expect(experienciaDe(uso(MIN_MUESTRAS - 1, 4))).toBeNull();
    expect(experienciaDe(undefined)).toBeNull();
  });

  it("con muestras suficientes, resume acierto y media", () => {
    const e = experienciaDe(uso(10, 8, 8 * 2000))!;
    expect(e.acierto).toBe(0.8);
    expect(e.mediaMs).toBe(2000);
    expect(e.muestras).toBe(10);
  });

  it("sin ninguna respuesta correcta, la media es null y no cero", () => {
    // cero milisegundos diría «rapidísimo» de un modelo que nunca contesta
    expect(experienciaDe(uso(10, 0))!.mediaMs).toBeNull();
  });
});

describe("ajustePorExperiencia", () => {
  it("sin dato, no mueve nada", () => {
    expect(ajustePorExperiencia(null)).toBe(0);
  });

  it("premia al que acierta y castiga al que falla", () => {
    const bueno = ajustePorExperiencia(experienciaDe(uso(20, 20, 20 * 1000)));
    const malo = ajustePorExperiencia(experienciaDe(uso(20, 4, 4 * 1000)));
    expect(bueno).toBeGreaterThan(0);
    expect(malo).toBeLessThan(0);
    expect(bueno).toBeGreaterThan(malo);
  });

  it("manda el acierto: un rápido que falla la mitad no gana a un lento fiable", () => {
    const rapidoInfiel = ajustePorExperiencia(experienciaDe(uso(20, 10, 10 * 200)));
    const lentoFiel = ajustePorExperiencia(experienciaDe(uso(20, 20, 20 * MS_LENTO)));
    expect(lentoFiel).toBeGreaterThan(rapidoInfiel);
  });

  it("la velocidad desempata entre dos que aciertan igual", () => {
    const rapido = ajustePorExperiencia(experienciaDe(uso(20, 20, 20 * 500)));
    const lento = ajustePorExperiencia(experienciaDe(uso(20, 20, 20 * 20_000)));
    expect(rapido).toBeGreaterThan(lento);
  });

  it("nunca se sale del peso previsto: no puede tumbar la afinidad de tarea", () => {
    for (const u of [uso(50, 50, 0), uso(50, 0), uso(50, 25, 50 * 60_000)]) {
      const a = ajustePorExperiencia(experienciaDe(u));
      expect(Math.abs(a)).toBeLessThanOrEqual(PESO_EXPERIENCIA + 0.001);
    }
  });
});

describe("textoExperiencia", () => {
  it("sin dato no se inventa un porcentaje", () => {
    expect(textoExperiencia(null)).toBeNull();
  });
  it("con dato, dice acierto, media y de cuántas respuestas sale", () => {
    const t = textoExperiencia(experienciaDe(uso(10, 9, 9 * 1500)))!;
    expect(t).toContain("90%");
    expect(t).toContain("1.5s");
    expect(t).toContain("10 respuestas");
  });
});

describe("buildTaskChain con historial", () => {
  const providers = {
    groq: { apiKey: "k", enabled: true, models: ["modelo-free-a", "modelo-free-b"] },
  };

  it("sin historial, la cadena sale EXACTAMENTE igual que antes", () => {
    const sin = buildTaskChain("code", providers, undefined, 6, null);
    const conVacio = buildTaskChain("code", providers, undefined, 6, null, {});
    expect(conVacio.map((c) => c.modelKey)).toEqual(sin.map((c) => c.modelKey));
  });

  it("un modelo con buen historial adelanta a uno con mal historial", () => {
    const bueno = makeModelKey("groq", "modelo-free-b");
    const malo = makeModelKey("groq", "modelo-free-a");
    const chain = buildTaskChain("code", providers, undefined, 6, null, {
      [bueno]: uso(30, 30, 30 * 800),
      [malo]: uso(30, 3, 3 * 800),
    });
    expect(chain[0].modelKey).toBe(bueno);
  });

  it("con pocas muestras NO se reordena: dos respuestas no son un criterio", () => {
    const sin = buildTaskChain("code", providers, undefined, 6, null);
    const conPocas = buildTaskChain("code", providers, undefined, 6, null, {
      [makeModelKey("groq", "modelo-free-b")]: uso(2, 2, 2 * 100),
    });
    expect(conPocas.map((c) => c.modelKey)).toEqual(sin.map((c) => c.modelKey));
  });
});
