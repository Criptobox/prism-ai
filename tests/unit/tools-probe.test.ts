/** Tests del clasificador de capacidad de tools (tools-probe.ts).
 * La red no se toca: solo se prueba `classifyToolsSupport` y la cache. */
import { describe, it, expect, beforeEach } from "vitest";
import {
  classifyToolsSupport,
  supportsTools,
  mensajeTools,
  _clearToolsCacheForTests,
  getCachedToolsProbe,
  type ToolsSupport,
} from "../../src/lib/prism/tools-probe";

beforeEach(() => {
  _clearToolsCacheForTests();
});

describe("classifyToolsSupport", () => {
  it("200 → ok (soporta tools)", () => {
    expect(classifyToolsSupport(200)).toBe("ok");
    expect(classifyToolsSupport(204)).toBe("ok");
  });

  it("429 → limitado (soporta, solo se acabó la cuota)", () => {
    expect(classifyToolsSupport(429, "rate limit")).toBe("limitado");
  });

  it("401 → sin-clave", () => {
    expect(classifyToolsSupport(401, "bad api key")).toBe("sin-clave");
  });

  it("403 → sin-permiso (o no, si el body habla de tools)", () => {
    expect(classifyToolsSupport(403, "your plan does not include this")).toBe("sin-permiso");
    expect(classifyToolsSupport(403, "tools not supported on this model")).toBe("no");
    expect(classifyToolsSupport(403, "this function is not available")).toBe("no");
  });

  it("400 + mención de tools/function → no", () => {
    expect(classifyToolsSupport(400, "tools parameter is not supported")).toBe("no");
    expect(classifyToolsSupport(400, "function calling is not available")).toBe("no");
    expect(classifyToolsSupport(422, "unsupported tool")).toBe("no");
  });

  it("400 sin mención de tools → desconocido (no se sabe, no se rompe el agente)", () => {
    expect(classifyToolsSupport(400, '{"error":"messages: too many tokens"}')).toBe("desconocido");
    expect(classifyToolsSupport(400, "")).toBe("desconocido");
  });

  it("404 → desconocido (el modelo no está, pero no es sobre tools)", () => {
    expect(classifyToolsSupport(404, "model not found")).toBe("desconocido");
  });

  it("5xx → caido", () => {
    expect(classifyToolsSupport(500)).toBe("caido");
    expect(classifyToolsSupport(503, "overloaded")).toBe("caido");
  });

  it("0 → sin-red", () => {
    expect(classifyToolsSupport(0)).toBe("sin-red");
  });
});

describe("supportsTools", () => {
  it("ok y limitado cuentan como soporte", () => {
    expect(supportsTools("ok")).toBe(true);
    expect(supportsTools("limitado")).toBe(true);
  });
  it("el resto no", () => {
    const no: ToolsSupport[] = ["no", "sin-clave", "sin-permiso", "caido", "sin-red", "desconocido"];
    for (const s of no) expect(supportsTools(s), s).toBe(false);
  });
});

describe("mensajeTools", () => {
  it("cada valor tiene un mensaje > 5 car.", () => {
    const all: ToolsSupport[] = ["ok", "no", "sin-clave", "sin-permiso", "limitado", "caido", "sin-red", "desconocido"];
    for (const s of all) {
      const msg = mensajeTools(s);
      expect(msg.length, s).toBeGreaterThan(5);
    }
  });
});

describe("cache", () => {
  it("cache vacía inicialmente", () => {
    expect(getCachedToolsProbe("openai", { apiKey: "sk-x", baseUrl: "", enabled: true, models: [] } as never, "gpt-4o")).toBeNull();
  });
});
