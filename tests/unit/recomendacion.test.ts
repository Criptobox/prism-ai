import { describe, expect, it } from "vitest";
import { recomendarModelo } from "../../src/lib/prism/recomendacion";
import { MEMORIA_VACIA, addTarea } from "../../src/lib/prism/memoria-proyecto";

const PROVIDERS = {
  groq: { enabled: true, apiKey: "k", models: ["llama-3.3-70b"] },
  nvidia: { enabled: true, apiKey: "k", models: ["kimi-k2"] },
  openai: { enabled: true, apiKey: "k", models: ["gpt-4o-mini"] },
};

describe("recomendarModelo", () => {
  it("sin proveedores conectados lo dice y no inventa", () => {
    const r = recomendarModelo("hazme una web", {});
    expect(r.modelKey).toBeNull();
    expect(r.razon).toMatch(/No hay proveedores/);
  });

  it("clasifica la tarea y muestra el porqué", () => {
    const r = recomendarModelo("crea una landing moderna para mi tienda de plantas", PROVIDERS);
    expect(r.tipo).toBe("web");
    expect(r.etiquetaTarea).toMatch(/web|página/);
    expect(r.modelKey).toBeTruthy();
    expect(r.razon.length).toBeGreaterThan(15);
  });

  it("pregunta simple prefiere gratis y lo dice", () => {
    const r = recomendarModelo(
      "explícame qué es una variable en JavaScript y por qué se usa así",
      PROVIDERS,
      { esPago: (pid) => pid === "openai" }
    );
    // chat/write → gratis (groq/nvidia), nunca un pago de primero
    expect(["groq::llama-3.3-70b", "nvidia::kimi-k2"]).toContain(r.modelKey);
    expect(r.razon).toMatch(/gratis/);
  });

  it("un modelo con muchos reintentos en este proyecto pierde el puesto", () => {
    const memoria = addTarea(
      MEMORIA_VACIA,
      "web anterior",
      { modelo: "nvidia::kimi-k2", estado: "failed", reintentos: 9 }
    );
    const sinMemoria = recomendarModelo("crea una web completa con galería", PROVIDERS, {
      esPago: (pid) => pid === "openai",
    });
    const conMemoria = recomendarModelo("crea una web completa con galería", PROVIDERS, {
      memoria,
      esPago: (pid) => pid === "openai",
    });
    expect(sinMemoria.modelKey).toBe("nvidia::kimi-k2");
    expect(conMemoria.modelKey).not.toBe("nvidia::kimi-k2");
    expect(conMemoria.modelKey).toBe("groq::llama-3.3-70b");
  });

  it("pago solo sube si gratis no cubre y entonces da alternativa", () => {
    const soloPago = { openai: PROVIDERS.openai, groq: { enabled: false, apiKey: "", models: [] } };
    const r = recomendarModelo("hazme una landing premium", soloPago, {
      esPago: (pid) => pid === "openai",
      soloGratis: false,
    });
    expect(r.modelKey).toBe("openai::gpt-4o-mini");
    expect(r.alternativa).toBeUndefined(); // no hay gratis conectada
  });

  it("soloGratis excluye a los proveedores de pago", () => {
    const r = recomendarModelo("hazme una landing", PROVIDERS, {
      esPago: (pid) => pid === "openai",
      soloGratis: true,
    });
    expect(r.modelKey?.startsWith("openai::")).toBe(false);
  });
});
