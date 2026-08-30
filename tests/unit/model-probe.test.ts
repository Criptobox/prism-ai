import { describe, it, expect, vi } from "vitest";
import {
  classifyProbe,
  esCulpaDelModelo,
  esUtilizable,
  mensajeProbe,
  modelosRotos,
  probeAll,
  type ProbeResult,
} from "../../src/lib/prism/model-probe";

const r = (verdict: ProbeResult["verdict"]): ProbeResult => ({ verdict, status: 0, ms: 1, at: 1 });

describe("classifyProbe", () => {
  it("una respuesta buena es que responde", () => {
    expect(classifyProbe(200)).toBe("ok");
    expect(classifyProbe(204)).toBe("ok");
  });

  it("404 es que el modelo no está", () => {
    expect(classifyProbe(404)).toBe("no-existe");
  });

  it("el 400 se decide por lo que dice el proveedor", () => {
    // el caso reportado: se ofrece como gratis y luego no está disponible
    expect(classifyProbe(400, '{"error":{"message":"The model `glm-4.5` does not exist"}}')).toBe(
      "no-existe"
    );
    expect(classifyProbe(400, "Unknown model: foo")).toBe("no-existe");
    expect(classifyProbe(422, "unsupported model for this tier")).toBe("no-existe");
  });

  it("un 400 que NO habla del modelo no lo acusa a él", () => {
    // acusar a un modelo bueno es peor que dejar pasar uno malo
    expect(classifyProbe(400, '{"error":"messages: too many tokens"}')).toBe("caido");
    expect(classifyProbe(400, "")).toBe("caido");
  });

  it("distingue quedarse sin cuota de estar roto", () => {
    expect(classifyProbe(429, "rate limit")).toBe("limitado");
  });

  it("separa clave mala de modelo prohibido", () => {
    expect(classifyProbe(401, "bad api key")).toBe("sin-clave");
    expect(classifyProbe(403, "your plan does not include this")).toBe("sin-permiso");
    // …salvo que el 403 diga explícitamente que es el modelo
    expect(classifyProbe(403, "no permission to access model gpt-5")).toBe("no-existe");
  });

  it("los 5xx son del proveedor y sin respuesta es de red", () => {
    expect(classifyProbe(500)).toBe("caido");
    expect(classifyProbe(503, "overloaded")).toBe("caido");
    expect(classifyProbe(0)).toBe("sin-red");
  });
});

describe("qué hacer con cada veredicto", () => {
  it("un 429 NO descalifica: existe y responde, solo has gastado la cuota", () => {
    expect(esUtilizable("limitado")).toBe(true);
    expect(esCulpaDelModelo("limitado")).toBe(false);
  });

  it("solo se culpa al modelo cuando el fallo es suyo", () => {
    expect(esCulpaDelModelo("no-existe")).toBe(true);
    expect(esCulpaDelModelo("sin-permiso")).toBe(true);
    // estos son del proveedor o de tu conexión: quitar el modelo no arregla nada
    expect(esCulpaDelModelo("caido")).toBe(false);
    expect(esCulpaDelModelo("sin-red")).toBe(false);
    expect(esCulpaDelModelo("sin-clave")).toBe(false);
  });

  it("cada veredicto se puede explicar", () => {
    for (const v of ["ok", "limitado", "no-existe", "sin-permiso", "sin-clave", "caido", "sin-red"] as const) {
      expect(mensajeProbe(v).length).toBeGreaterThan(5);
    }
  });
});

describe("probeAll", () => {
  it("prueba todo y devuelve el resultado de cada uno", async () => {
    const items = ["a", "b", "c", "d", "e"];
    const res = await probeAll(items, async (m) => r(m === "c" ? "no-existe" : "ok"));
    expect(res.size).toBe(5);
    expect(res.get("c")?.verdict).toBe("no-existe");
  });

  it("no abre más peticiones a la vez de las permitidas", async () => {
    let vivas = 0;
    let pico = 0;
    const items = Array.from({ length: 12 }, (_, i) => `m${i}`);
    await probeAll(
      items,
      async () => {
        vivas++;
        pico = Math.max(pico, vivas);
        await new Promise((ok) => setTimeout(ok, 5));
        vivas--;
        return r("ok");
      },
      { concurrency: 3 }
    );
    // con capa gratuita, una ráfaga provoca justo los 429 que se quieren medir
    expect(pico).toBeLessThanOrEqual(3);
  });

  it("va avisando de cada resultado según llega", async () => {
    const visto = vi.fn();
    await probeAll(["a", "b"], async () => r("ok"), { onResult: visto });
    expect(visto).toHaveBeenCalledTimes(2);
  });

  it("una lista vacía no cuelga", async () => {
    expect((await probeAll([], async () => r("ok"))).size).toBe(0);
  });
});

describe("modelosRotos", () => {
  it("propone quitar solo los que fallan por su culpa", () => {
    const m = new Map([
      ["bueno", r("ok")],
      ["gastado", r("limitado")],
      ["fantasma", r("no-existe")],
      ["prohibido", r("sin-permiso")],
      ["proveedor-caido", r("caido")],
    ]);
    expect(modelosRotos(m).sort()).toEqual(["fantasma", "prohibido"]);
  });
});

describe("410: el proveedor retiró el modelo", () => {
  it("se trata como que no existe, no como caído", () => {
    // NVIDIA jubiló varios modelos el 26/08/2026 y devolvía 410 con la fecha
    // dentro. Sin tratarlo caía en «caído», que es transitorio: Prism lo
    // reintentaba una y otra vez contra algo que no va a volver nunca.
    expect(classifyProbe(410, '{"status":410,"detail":"The model \'meta/llama-3.3-70b-instruct\' has reached its end of life"}')).toBe(
      "no-existe"
    );
  });

  it("y por tanto se puede quitar de la lista", () => {
    expect(esCulpaDelModelo(classifyProbe(410, ""))).toBe(true);
    expect(esUtilizable(classifyProbe(410, ""))).toBe(false);
  });
});
