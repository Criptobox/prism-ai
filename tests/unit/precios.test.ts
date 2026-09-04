import { describe, expect, it } from "vitest";
import {
  DIAS_PARA_AVISAR,
  ahorroEnDinero,
  buscarPrecio,
  costeDe,
  costeDeModelo,
  cuantosSinPrecio,
  diasDesde,
  fmtDinero,
  motivoSinCoste,
  pieDePrecios,
  preciosViejos,
  sumaCostes,
  type TablaPrecios,
} from "../../src/lib/prism/precios";
import { PRECIOS, PRECIOS_FECHA } from "../../src/lib/prism/precios-datos";
import { PROVIDERS } from "../../src/lib/prism/providers";
import { isFreeModel } from "../../src/lib/prism/free-models";

const TABLA: TablaPrecios = {
  "claude-opus-5": { in: 5e-6, out: 2.5e-5, cr: 5e-7, cw: 6.25e-6, p: "anthropic" },
  "claude-sonnet-5": { in: 2e-6, out: 1e-5, cr: 2e-7, p: "anthropic" },
  "gpt-5": { in: 1.25e-6, out: 1e-5, p: "openai" },
  "sin-salida": { in: 1e-6, p: "openai" },
};

describe("buscar el precio de un modelo", () => {
  it("por su id exacto", () => {
    expect(buscarPrecio("anthropic", "claude-opus-5", TABLA)?.clave).toBe("claude-opus-5");
  });

  it("quitando el sufijo de fecha que llevan los ids viejos", () => {
    const r = buscarPrecio("anthropic", "claude-opus-5-20260401", TABLA);
    expect(r?.clave).toBe("claude-opus-5");
    expect(r?.aproximada, "se avisa de que la coincidencia no fue exacta").toBe(true);
  });

  it("ignorando mayúsculas y el sufijo de gratis de las pasarelas", () => {
    expect(buscarPrecio("anthropic", "Claude-Opus-5:free", TABLA)?.clave).toBe("claude-opus-5");
  });

  it("NUNCA da el precio de otro proveedor aunque el id coincida", () => {
    // el mismo modelo por otra pasarela puede costar otra cosa: afirmar el
    // precio de una usando la otra sería inventar
    expect(buscarPrecio("openrouter", "claude-opus-5", TABLA)).toBeNull();
  });

  it("un modelo que no está devuelve null en vez del «parecido»", () => {
    expect(buscarPrecio("anthropic", "claude-opus-9", TABLA)).toBeNull();
    expect(buscarPrecio("openai", "gpt-99-turbo", TABLA)).toBeNull();
  });
});

describe("de tokens a dinero", () => {
  const uso = { entrada: 1000, salida: 500, cacheLeido: 10_000, cacheEscrito: 0 };

  it("multiplica lo que dijo el proveedor por el precio del catálogo", () => {
    const c = costeDe(uso, TABLA["claude-opus-5"])!;
    expect(c.entrada).toBeCloseTo(1000 * 5e-6, 12);
    expect(c.salida).toBeCloseTo(500 * 2.5e-5, 12);
    expect(c.cache).toBeCloseTo(10_000 * 5e-7, 12);
    expect(c.total).toBeCloseTo(c.entrada + c.salida + c.cache, 12);
  });

  it("dice cuánto habría costado sin caché, que es de donde sale el ahorro", () => {
    const c = costeDe(uso, TABLA["claude-opus-5"])!;
    expect(c.sinCache).toBeCloseTo(11_000 * 5e-6 + 500 * 2.5e-5, 12);
    expect(ahorroEnDinero(c)).toBeCloseTo(c.sinCache - c.total, 12);
  });

  it("sin precio de caché declarado NO se supone un descuento", () => {
    // conservador a propósito: nunca enseñar un gasto menor del que pudo ser
    const c = costeDe({ entrada: 0, salida: 0, cacheLeido: 1000, cacheEscrito: 0 }, TABLA["gpt-5"])!;
    expect(c.cache).toBeCloseTo(1000 * 1.25e-6, 12);
    expect(ahorroEnDinero(c)).toBeNull();
  });

  it("sin tokens del proveedor no hay importe, ni siquiera cero", () => {
    expect(costeDe(null, TABLA["gpt-5"])).toBeNull();
    expect(
      costeDe({ entrada: null, salida: null, cacheLeido: null, cacheEscrito: null }, TABLA["gpt-5"])
    ).toBeNull();
  });

  it("sin precio tampoco, aunque haya tokens", () => {
    expect(costeDe(uso, null)).toBeNull();
  });

  it("un modelo sin precio de salida no rompe: la salida cuenta cero", () => {
    const c = costeDe({ entrada: 10, salida: 10, cacheLeido: 0, cacheEscrito: 0 }, TABLA["sin-salida"])!;
    expect(c.salida).toBe(0);
    expect(c.total).toBeCloseTo(10 * 1e-6, 12);
  });
});

describe("por qué no hay importe", () => {
  it("distingue qué mitad falta, en vez de decir «sin dato» y callarse", () => {
    const uso = { entrada: 10, salida: 1, cacheLeido: 0, cacheEscrito: 0 };
    expect(motivoSinCoste(uso, null)).toMatch(/catálogo/);
    expect(motivoSinCoste(null, TABLA["gpt-5"])).toMatch(/tokens/);
    expect(motivoSinCoste(null, null)).toMatch(/ni.*ni/);
  });

  it("costeDeModelo devuelve el motivo junto al hueco", () => {
    const r = costeDeModelo("openai", "modelo-que-no-existe", { entrada: 5, salida: 5, cacheLeido: 0, cacheEscrito: 0 }, TABLA);
    expect(r.coste).toBeNull();
    expect(r.motivo).toMatch(/catálogo/);
  });

  it("y la clave con la que calculó, para poder comprobarlo", () => {
    const r = costeDeModelo("anthropic", "claude-opus-5", { entrada: 1, salida: 1, cacheLeido: 0, cacheEscrito: 0 }, TABLA);
    expect(r.clave).toBe("claude-opus-5");
    expect(r.coste).not.toBeNull();
  });
});

describe("sumar costes", () => {
  const a = costeDe({ entrada: 100, salida: 10, cacheLeido: 0, cacheEscrito: 0 }, TABLA["gpt-5"]);
  const b = costeDe({ entrada: 100, salida: 10, cacheLeido: 0, cacheEscrito: 0 }, TABLA["gpt-5"]);

  it("suma los que se saben", () => {
    expect(sumaCostes([a, b])!.total).toBeCloseTo(a!.total * 2, 12);
  });

  it("ignora los que no, pero deja contarlos para poder decirlo", () => {
    expect(sumaCostes([a, null])!.total).toBeCloseTo(a!.total, 12);
    expect(cuantosSinPrecio([a, null, null])).toBe(2);
  });

  it("sin ninguno válido devuelve null: un total de nada no es cero", () => {
    expect(sumaCostes([null, null])).toBeNull();
    expect(sumaCostes([])).toBeNull();
  });
});

describe("escribir el importe", () => {
  it("los céntimos de céntimo no se redondean a «0,00 $»", () => {
    // redondear a dos decimales convertiría todas las llamadas en «gratis»
    expect(fmtDinero(0.0023)).toBe("0,0023 $");
    expect(fmtDinero(0.12)).toBe("0,120 $");
    expect(fmtDinero(3.5)).toBe("3,50 $");
  });

  it("lo demasiado pequeño se dice con «<», no con un cero", () => {
    expect(fmtDinero(0.00001)).toBe("< 0,0001 $");
  });

  it("un cero de verdad sí es cero, y lo que no se sabe es «sin dato»", () => {
    expect(fmtDinero(0)).toBe("0 $");
    expect(fmtDinero(null)).toBe("sin dato");
    expect(fmtDinero(NaN)).toBe("sin dato");
  });
});

describe("la fecha viaja con el precio", () => {
  const HOY = Date.parse("2026-09-04T12:00:00Z");

  it("cuenta los días desde la instantánea", () => {
    expect(diasDesde("2026-09-01", HOY)).toBe(3);
  });

  it("pasado el umbral se avisa de que puede estar viejo", () => {
    const viejo = Date.parse("2026-09-04T00:00:00Z") + (DIAS_PARA_AVISAR + 5) * 86_400_000;
    expect(preciosViejos("2026-09-04", viejo)).toBe(true);
    expect(preciosViejos("2026-09-04", HOY)).toBe(false);
    expect(pieDePrecios("2026-09-04", viejo)).toMatch(/npm run precios/);
  });

  it("el pie SIEMPRE nombra la fuente y la fecha", () => {
    const pie = pieDePrecios("2026-09-04", HOY);
    expect(pie).toContain("LiteLLM");
    expect(pie).toContain("2026-09-04");
    expect(pie, "y deja claro que no es una factura").toMatch(/estimación/i);
  });
});

describe("la tabla que se empaqueta", () => {
  it("trae precio para TODOS los modelos que Prism cuenta como de pago", () => {
    // es el dato que justifica que esta app enseñe importes: si un solo
    // modelo de pago se quedara fuera, el total mentiría por defecto
    const sinPrecio: string[] = [];
    for (const p of PROVIDERS) {
      for (const m of p.defaultModels ?? []) {
        if (isFreeModel(p.id, m)) continue;
        if (!buscarPrecio(p.id, m, PRECIOS)) sinPrecio.push(`${p.id}::${m}`);
      }
    }
    expect(sinPrecio).toEqual([]);
  });

  it("ningún precio es cero o negativo: eso sería afirmar que algo es gratis", () => {
    for (const [k, v] of Object.entries(PRECIOS)) {
      expect(v.in, k).toBeGreaterThan(0);
      if (v.out != null) expect(v.out, k).toBeGreaterThan(0);
      if (v.cr != null) expect(v.cr, k).toBeGreaterThan(0);
    }
  });

  it("la lectura de caché nunca es más cara que la entrada nueva", () => {
    // si lo fuera, el «ahorro» que enseña el panel sería negativo y estaría
    // mal leído el catálogo
    for (const [k, v] of Object.entries(PRECIOS)) {
      if (v.cr != null) expect(v.cr, k).toBeLessThanOrEqual(v.in);
    }
  });

  it("la instantánea tiene fecha con formato de fecha", () => {
    expect(PRECIOS_FECHA).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
