import { describe, expect, it } from "vitest";
import { sugerirModelos, MAX_SUGERIDOS } from "../../src/lib/prism/sugeridos";

const DEFAULTS = [
  "deepseek/deepseek-chat-v3-0324:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen3-coder:free",
];

describe("sugerirModelos", () => {
  it("sin catálogo vivo cae a la lista de mano, y lo dice", () => {
    const r = sugerirModelos("openrouter", [], null, DEFAULTS);
    expect(r.origen).toBe("mano");
    expect(r.modelos).toEqual(DEFAULTS);
  });

  it("con catálogo vivo propone de ahí, no de la lista de mano", () => {
    // esto es el fallo real: la lista de mano traía modelos retirados y el
    // catálogo del proveedor traía otros distintos que sí existen
    const vivo = ["nuevo-a:free", "nuevo-b:free", "de-pago/pro"];
    const r = sugerirModelos("openrouter", [], vivo, DEFAULTS);
    expect(r.origen).toBe("catalogo");
    expect(r.modelos).toEqual(["nuevo-a:free", "nuevo-b:free"]);
    for (const viejo of DEFAULTS) expect(r.modelos).not.toContain(viejo);
  });

  it("del catálogo solo salen los gratis", () => {
    const r = sugerirModelos("openrouter", [], ["x:free", "caro/premium"], DEFAULTS);
    expect(r.modelos).toEqual(["x:free"]);
  });

  it("no propone lo que ya tienes (aunque cambie el casing)", () => {
    const r = sugerirModelos("openrouter", ["Nuevo-A:Free"], ["nuevo-a:free", "nuevo-b:free"], DEFAULTS);
    expect(r.modelos).toEqual(["nuevo-b:free"]);
  });

  it("un catálogo vivo SIN gratis que falten no rellena con la lista de mano", () => {
    // rellenar sería volver a proponer justo lo que no existe
    const r = sugerirModelos("openrouter", ["x:free"], ["x:free", "caro/premium"], DEFAULTS);
    expect(r.origen).toBe("catalogo");
    expect(r.modelos).toEqual([]);
  });

  it("un catálogo vacío (el proveedor no devolvió nada) no cuenta como catálogo", () => {
    const r = sugerirModelos("openrouter", [], [], DEFAULTS);
    expect(r.origen).toBe("mano");
  });

  it("recorta al máximo pero el total dice cuántos había", () => {
    const vivo = Array.from({ length: 20 }, (_, i) => `m${i}:free`);
    const r = sugerirModelos("openrouter", [], vivo, DEFAULTS);
    expect(r.modelos).toHaveLength(MAX_SUGERIDOS);
    expect(r.total).toBe(20);
  });
});
