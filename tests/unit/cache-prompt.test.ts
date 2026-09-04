import { describe, expect, it } from "vitest";
import { PROVIDER_MAP } from "../../src/lib/prism/providers";
import {
  MARCA_CACHE,
  MAX_CORTES,
  aciertoDeCache,
  admiteCortes,
  conCorte,
  cortesDeHistorial,
  fundirUso,
  hayUso,
  leerUso,
  lineaUso,
  modoEfectivo,
  sistemaCacheable,
  sumarUso,
  type UsoProveedor,
} from "../../src/lib/prism/cache-prompt";

describe("dónde se marcan los cortes", () => {
  it("solo Anthropic: marcar donde no toca sería mandar campos que no entienden", () => {
    expect(admiteCortes("anthropic")).toBe(true);
    expect(admiteCortes("openai")).toBe(false);
    expect(admiteCortes("gemini")).toBe(false);
  });

  it("el sistema va como bloque con el corte al final", () => {
    const b = sistemaCacheable("Eres un asistente.");
    expect(b).toEqual([
      { type: "text", text: "Eres un asistente.", cache_control: MARCA_CACHE },
    ]);
  });

  it("un sistema vacío no genera bloque: un texto vacío es un error de la API", () => {
    expect(sistemaCacheable("")).toBeNull();
    expect(sistemaCacheable("   ")).toBeNull();
    expect(sistemaCacheable(undefined)).toBeNull();
    expect(sistemaCacheable(null)).toBeNull();
  });

  it("marca el último mensaje y uno anterior, nunca más de dos", () => {
    expect(cortesDeHistorial(10)).toEqual([7, 9]);
    expect(cortesDeHistorial(4)).toEqual([1, 3]);
  });

  it("con historiales cortos no se pasa ni se repite", () => {
    expect(cortesDeHistorial(0)).toEqual([]);
    expect(cortesDeHistorial(1)).toEqual([0]);
    expect(cortesDeHistorial(2)).toEqual([0, 1]);
    expect(cortesDeHistorial(3)).toEqual([0, 2]);
  });

  it("con el corte del sistema caben todos: la API permite cuatro", () => {
    for (const n of [1, 2, 3, 10, 200]) {
      expect(cortesDeHistorial(n).length + 1).toBeLessThanOrEqual(MAX_CORTES);
    }
  });

  it("los cortes son índices válidos y sin duplicados", () => {
    for (const n of [1, 2, 3, 5, 40]) {
      const c = cortesDeHistorial(n);
      expect(new Set(c).size).toBe(c.length);
      for (const i of c) expect(i).toBeGreaterThanOrEqual(0);
      for (const i of c) expect(i).toBeLessThan(n);
    }
  });
});

describe("conCorte", () => {
  it("envuelve una cadena en un bloque de texto marcado", () => {
    expect(conCorte("hola")).toEqual([
      { type: "text", text: "hola", cache_control: MARCA_CACHE },
    ]);
  });

  it("con varios bloques marca el ÚLTIMO: el corte incluye lo anterior", () => {
    const partes = [
      { type: "image", source: { type: "base64" } },
      { type: "text", text: "describe" },
    ];
    const out = conCorte(partes) as Record<string, unknown>[];
    expect(out[0]).not.toHaveProperty("cache_control");
    expect(out[1]).toHaveProperty("cache_control", MARCA_CACHE);
  });

  it("no muta lo que recibe", () => {
    const partes = [{ type: "text", text: "x" }];
    conCorte(partes);
    expect(partes[0]).not.toHaveProperty("cache_control");
  });

  it("una lista vacía se queda vacía en vez de inventarse un bloque", () => {
    expect(conCorte([])).toEqual([]);
  });
});

describe("comprimir y cachear no pueden convivir", () => {
  it("con Anthropic, la compresión se apaga y se dice por qué", () => {
    const r = modoEfectivo("standard", "anthropic");
    expect(r.modo).toBe("off");
    expect(r.motivo).toMatch(/caché/i);
  });

  it("con el resto de proveedores no se toca nada", () => {
    expect(modoEfectivo("standard", "openai")).toEqual({ modo: "standard", motivo: null });
    expect(modoEfectivo("lite", "gemini")).toEqual({ modo: "lite", motivo: null });
  });

  it("si ya estaba apagada no hay nada que explicar", () => {
    expect(modoEfectivo("off", "anthropic")).toEqual({ modo: "off", motivo: null });
  });
});

describe("leer la cuenta del proveedor", () => {
  it("Anthropic, respuesta completa", () => {
    const u = leerUso("anthropic", {
      usage: {
        input_tokens: 120,
        output_tokens: 40,
        cache_read_input_tokens: 3000,
        cache_creation_input_tokens: 0,
      },
    });
    expect(u).toEqual({ entrada: 120, salida: 40, cacheLeido: 3000, cacheEscrito: 0 });
  });

  it("Anthropic en streaming: el uso viene dentro de message_start", () => {
    const u = leerUso("anthropic", {
      type: "message_start",
      message: { usage: { input_tokens: 10, cache_read_input_tokens: 500 } },
    });
    expect(u?.entrada).toBe(10);
    expect(u?.cacheLeido).toBe(500);
    expect(u?.salida).toBeNull();
  });

  it("OpenAI: la caché la reporta en prompt_tokens_details", () => {
    const u = leerUso("openai", {
      usage: { prompt_tokens: 900, completion_tokens: 30, prompt_tokens_details: { cached_tokens: 640 } },
    });
    expect(u).toEqual({ entrada: 900, salida: 30, cacheLeido: 640, cacheEscrito: null });
  });

  it("Gemini: usageMetadata", () => {
    const u = leerUso("gemini", {
      usageMetadata: { promptTokenCount: 77, candidatesTokenCount: 12, cachedContentTokenCount: 50 },
    });
    expect(u).toEqual({ entrada: 77, salida: 12, cacheLeido: 50, cacheEscrito: null });
  });

  it("sin uso en la respuesta devuelve null, no ceros", () => {
    expect(leerUso("anthropic", { content: [] })).toBeNull();
    expect(leerUso("openai", { choices: [] })).toBeNull();
    expect(leerUso("gemini", {})).toBeNull();
    expect(leerUso("openai", null)).toBeNull();
    expect(leerUso("openai", "texto")).toBeNull();
  });

  it("los valores absurdos se descartan en vez de pintarse", () => {
    const u = leerUso("anthropic", {
      usage: { input_tokens: -5, output_tokens: "muchos", cache_read_input_tokens: 10 },
    });
    expect(u?.entrada).toBeNull();
    expect(u?.salida).toBeNull();
    expect(u?.cacheLeido).toBe(10);
  });
});

describe("juntar lecturas", () => {
  const a: UsoProveedor = { entrada: 100, salida: null, cacheLeido: 900, cacheEscrito: null };
  const b: UsoProveedor = { entrada: 100, salida: 50, cacheLeido: 900, cacheEscrito: null };

  it("fundir = trozos de UNA respuesta: gana el que existe, y el mayor", () => {
    expect(fundirUso(a, b)).toEqual({ entrada: 100, salida: 50, cacheLeido: 900, cacheEscrito: null });
  });

  it("sumar = llamadas DISTINTAS: se suman, que es lo que gasta un agente", () => {
    expect(sumarUso(a, b)).toEqual({ entrada: 200, salida: 50, cacheLeido: 1800, cacheEscrito: null });
  });

  it("un campo que un proveedor no reporta no vuelve cero lo que otro sí dijo", () => {
    expect(sumarUso({ entrada: null, salida: null, cacheLeido: null, cacheEscrito: null }, b)).toEqual(b);
    expect(fundirUso(null, b)).toEqual(b);
    expect(sumarUso(null, null)).toBeNull();
  });
});

describe("acierto de caché", () => {
  it("es la parte del prompt que no se pagó como entrada nueva", () => {
    expect(aciertoDeCache({ entrada: 100, salida: 0, cacheLeido: 900, cacheEscrito: 0 })).toBe(90);
  });

  it("sin caché reportada es «sin dato», no un 0 %", () => {
    expect(aciertoDeCache({ entrada: 100, salida: 0, cacheLeido: null, cacheEscrito: null })).toBeNull();
    expect(aciertoDeCache(null)).toBeNull();
  });

  it("una caché que no acertó sí es un 0 % de verdad", () => {
    expect(aciertoDeCache({ entrada: 100, salida: 0, cacheLeido: 0, cacheEscrito: 0 })).toBe(0);
  });

  it("sin nada de entrada tampoco hay denominador", () => {
    expect(aciertoDeCache({ entrada: 0, salida: 0, cacheLeido: 0, cacheEscrito: 0 })).toBeNull();
  });
});

describe("lineaUso", () => {
  it("resume lo que hay", () => {
    expect(lineaUso({ entrada: 12, salida: 3, cacheLeido: 900, cacheEscrito: null })).toBe(
      "12 entrada · 900 de caché · 3 salida"
    );
  });

  it("sin caché no la menciona", () => {
    expect(lineaUso({ entrada: 12, salida: 3, cacheLeido: 0, cacheEscrito: null })).toBe(
      "12 entrada · 3 salida"
    );
  });

  it("sin nada, null", () => {
    expect(lineaUso(null)).toBeNull();
    expect(hayUso(null)).toBe(false);
    expect(lineaUso({ entrada: null, salida: null, cacheLeido: null, cacheEscrito: null })).toBeNull();
  });
});

/** El catálogo de modelos envejece en silencio: un id retirado sigue en la
 * lista, el desplegable lo ofrece y el usuario se come un 404 sin entender por
 * qué. Esto no puede saber qué modelos existen hoy —eso lo dice el proveedor—
 * pero sí puede impedir que vuelvan los patrones de los que ya se retiraron. */
describe("catálogo de Anthropic", () => {
  const modelos = PROVIDER_MAP.anthropic.defaultModels;

  it("no ofrece ids con sufijo de fecha: los actuales van sin él", () => {
    for (const m of modelos) {
      expect(m, `«${m}» lleva fecha pegada`).not.toMatch(/-20\d{6}$/);
    }
  });

  it("no ofrece generaciones ya retiradas", () => {
    for (const m of modelos) {
      expect(m, `«${m}» es de una generación vieja`).not.toMatch(/^claude-[123](\.|-)/);
    }
  });

  it("sigue habiendo algo que elegir", () => {
    expect(modelos.length).toBeGreaterThan(0);
  });
});
