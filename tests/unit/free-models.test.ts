import { describe, expect, it } from "vitest";
import {
  filterFreeModels,
  isFreeModel,
  isQuotaError,
  pickFailoverCandidate,
} from "../../src/lib/prism/free-models";

describe("isFreeModel", () => {
  it("detecta sufijo -free de AiHubMix", () => {
    expect(isFreeModel("aihubmix", "coding-kimi-k3-free")).toBe(true);
    expect(isFreeModel("aihubmix", "gpt-4.1-mini-free")).toBe(true);
  });

  it("detecta sufijo :free de OpenRouter", () => {
    expect(isFreeModel("openrouter", "deepseek/deepseek-chat-v3-0324:free")).toBe(true);
  });

  it("proveedores con capa gratuita completa", () => {
    expect(isFreeModel("gemini", "gemini-2.5-pro")).toBe(true);
    expect(isFreeModel("groq", "llama-3.3-70b-versatile")).toBe(true);
    expect(isFreeModel("ollama", "cualquier-cosa")).toBe(true);
  });

  it("modelos curados de Z.ai", () => {
    expect(isFreeModel("zai", "glm-4.5-flash")).toBe(true);
    expect(isFreeModel("zai", "glm-4.6")).toBe(false);
  });

  it("un modelo de pago normal no es gratis", () => {
    expect(isFreeModel("openai", "gpt-4o")).toBe(false);
    expect(isFreeModel("anthropic", "claude-sonnet-4-5")).toBe(false);
  });
});

describe("filterFreeModels", () => {
  it("filtra la lista dejando solo gratis", () => {
    const out = filterFreeModels("aihubmix", ["gpt-4o-free", "gpt-4o", "kimi-free"]);
    expect(out).toEqual(["gpt-4o-free", "kimi-free"]);
  });
});

describe("isQuotaError", () => {
  it("detecta el aviso real de AiHubMix", () => {
    expect(isQuotaError("accounts that have not been recharged can only try 10 times")).toBe(true);
  });

  it("detecta 429/402 y variantes de saldo", () => {
    expect(isQuotaError("HTTP 429 too many requests")).toBe(true);
    expect(isQuotaError("insufficient balance")).toBe(true);
    expect(isQuotaError("quota exceeded for this project")).toBe(true);
  });

  it("un error normal no es de cuota", () => {
    expect(isQuotaError("Invalid username or password")).toBe(false);
  });
});

describe("pickFailoverCandidate", () => {
  const cfg = (apiKey: string, enabled = true, models: string[] = ["x-free"]) => ({
    apiKey,
    enabled,
    models,
  });

  it("elige el primer proveedor conectado con modelos gratis por orden de preferencia", () => {
    const providers = {
      gemini: cfg("k1", true, ["gemini-2.5-flash"]),
      groq: cfg("k2", true, ["llama-3.3-70b-versatile"]),
    };
    const out = pickFailoverCandidate(providers, "aihubmix");
    expect(out).toEqual({ providerId: "gemini", modelId: "gemini-2.5-flash" });
  });

  it("excluye el proveedor que falló", () => {
    const providers = { gemini: cfg("k1", true, ["gemini-2.5-flash"]) };
    const out = pickFailoverCandidate(providers, "gemini");
    expect(out).toBeNull();
  });

  it("ignora proveedores sin clave (salvo keyless como Ollama)", () => {
    const providers = {
      gemini: cfg("", true, ["gemini-2.5-flash"]),
      ollama: cfg("", true, ["llama3.2"]),
    };
    const out = pickFailoverCandidate(providers, "aihubmix");
    expect(out).toEqual({ providerId: "ollama", modelId: "llama3.2" });
  });

  it("ignora proveedores desactivados", () => {
    const providers = { gemini: cfg("k1", false, ["gemini-2.5-flash"]) };
    expect(pickFailoverCandidate(providers, "aihubmix")).toBeNull();
  });
});
