import { describe, it, expect } from "vitest";
import {
  estadoPanel,
  etiqueta,
  necesitaSintesis,
  PANEL_POR_DEFECTO,
  pickPanel,
  pickSintetizador,
  synthesisPrompt,
  type Panelista,
} from "../../src/lib/prism/consensus";
import type { ProviderConfig, ProviderId } from "../../src/lib/prism/types";
import { makeModelKey } from "../../src/lib/prism/types";

const cfg = (models: string[], apiKey = "k", enabled = true): ProviderConfig =>
  ({ apiKey, baseUrl: "", enabled, models }) as ProviderConfig;

const claves = (p: Panelista[]) => p.map((x) => makeModelKey(x.providerId, x.modelId));

describe("pickPanel", () => {
  it("coge un modelo de cada proveedor disponible", () => {
    const panel = pickPanel({
      openai: cfg(["gpt-4o", "gpt-4.1"]),
      groq: cfg(["llama-3.3"]),
      gemini: cfg(["gemini-3.7-flash"]),
    });
    expect(claves(panel)).toEqual(["openai::gpt-4o", "groq::llama-3.3", "gemini::gemini-3.7-flash"]);
  });

  it("nunca repite proveedor: tres del mismo comparten sesgo y límite", () => {
    const panel = pickPanel({ openai: cfg(["a", "b", "c", "d"]) });
    expect(panel).toHaveLength(1);
  });

  it("respeta el tope y por defecto son tres", () => {
    const muchos = {
      openai: cfg(["a"]),
      groq: cfg(["b"]),
      gemini: cfg(["c"]),
      deepseek: cfg(["d"]),
      xai: cfg(["e"]),
    };
    expect(pickPanel(muchos)).toHaveLength(PANEL_POR_DEFECTO);
    expect(pickPanel(muchos, { max: 2 })).toHaveLength(2);
    expect(pickPanel(muchos, { max: 0 })).toHaveLength(1); // nunca cero
  });

  it("salta los proveedores apagados o sin clave", () => {
    const panel = pickPanel({
      openai: cfg(["a"], "", true), // sin clave
      groq: cfg(["b"], "k", false), // apagado
      gemini: cfg(["c"]),
    });
    expect(claves(panel)).toEqual(["gemini::c"]);
  });

  it("los locales no necesitan clave", () => {
    const panel = pickPanel({ ollama: cfg(["llama3.2"], "") });
    expect(claves(panel)).toEqual(["ollama::llama3.2"]);
  });

  it("con «solo gratis» descarta los de pago", () => {
    const panel = pickPanel(
      { openrouter: cfg(["premium-model", "kimi:free"]), openai: cfg(["gpt-4o"]) },
      { soloGratis: true }
    );
    expect(claves(panel)).toEqual(["openrouter::kimi:free"]);
  });

  it("no molesta a un modelo en enfriamiento", () => {
    const panel = pickPanel(
      { openai: cfg(["frio", "templado"]) },
      { enCooldown: (k) => k === "openai::frio" }
    );
    expect(claves(panel)).toEqual(["openai::templado"]);
  });

  it("los favoritos van primero, en su orden", () => {
    const panel = pickPanel(
      { openai: cfg(["a"]), groq: cfg(["b"]), gemini: cfg(["c"]) },
      { max: 2, favoritos: ["gemini::c", "groq::b"] }
    );
    expect(claves(panel)).toEqual(["gemini::c", "groq::b"]);
  });

  it("sin nada configurado devuelve lista vacía en vez de fallar", () => {
    expect(pickPanel({})).toEqual([]);
    expect(pickPanel({ openai: cfg([]) })).toEqual([]);
  });
});

describe("pickSintetizador", () => {
  const a: Panelista = { providerId: "openai", modelId: "a" };
  const b: Panelista = { providerId: "groq", modelId: "b" };

  it("sintetiza el primero del panel que haya respondido", () => {
    expect(pickSintetizador([a, b], [b, a])).toEqual(a);
  });
  it("si el primero no respondió, lo hace otro", () => {
    expect(pickSintetizador([a, b], [b])).toEqual(b);
  });
  it("sin respuestas no hay quien sintetice", () => {
    expect(pickSintetizador([a, b], [])).toBeNull();
  });
});

describe("synthesisPrompt", () => {
  const p: Panelista = { providerId: "openai", modelId: "gpt-4o" };
  const respuestas = [
    { panelista: p, texto: "Usa flexbox" },
    { panelista: { providerId: "groq" as ProviderId, modelId: "llama" }, texto: "Usa grid" },
  ];

  it("mete la petición y todas las respuestas", () => {
    const out = synthesisPrompt("Centra un div", respuestas);
    expect(out).toContain("Centra un div");
    expect(out).toContain("Usa flexbox");
    expect(out).toContain("Usa grid");
  });

  it("las respuestas van ANÓNIMAS: si no, se premia la marca y no el contenido", () => {
    const out = synthesisPrompt("Centra un div", respuestas);
    expect(out).not.toContain("gpt-4o");
    expect(out).not.toContain("llama");
    expect(out).not.toContain("openai");
    expect(out).toContain('id="A"');
    expect(out).toContain('id="B"');
  });

  it("pide una respuesta, no una reseña comparando candidatos", () => {
    const out = synthesisPrompt("x", respuestas);
    expect(out).toMatch(/NO compares/);
    expect(out).toMatch(/mismo\s+formato e idioma/);
  });
});

describe("detalles de la interfaz", () => {
  it("las etiquetas son A, B, C…", () => {
    expect([0, 1, 2].map(etiqueta)).toEqual(["A", "B", "C"]);
  });
  it("el estado dice en qué punto va", () => {
    expect(estadoPanel(1, 3)).toContain("1/3");
    expect(estadoPanel(3, 3)).toMatch(/Combinando/);
  });
  it("con una sola respuesta no se sintetiza: no hay nada que combinar", () => {
    const p: Panelista = { providerId: "openai", modelId: "a" };
    expect(necesitaSintesis([{ panelista: p, texto: "sola" }])).toBe(false);
    expect(necesitaSintesis([{ panelista: p, texto: "a" }, { panelista: p, texto: "  " }])).toBe(false);
    expect(necesitaSintesis([{ panelista: p, texto: "a" }, { panelista: p, texto: "b" }])).toBe(true);
  });
});
