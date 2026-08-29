import { describe, expect, it } from "vitest";
import {
  isNvidiaCatalogPaste,
  looksLikeNimSnippet,
  looksLikeProviderSnippet,
  parseModelPaste,
  parseNimSnippet,
  parseProviderSnippet,
} from "../../src/lib/prism/model-paste";

const NVIDIA = `
import requests

invoke_url = "https://integrate.api.nvidia.com/v1/chat/completions"
stream = True

headers = {
    "Authorization": "Bearer nvapi-TESTKEY_abc-DEF",
    "Accept": "text/event-stream" if stream else "application/json",
}

payload = {
  "model": "moonshotai/kimi-k3",
  "max_tokens": 16384,
  "reasoning_effort": "max"
}
`;

const TOKENROUTER = `
from openai import OpenAI
client = OpenAI(
    api_key="sk-tr-TESTKEY99",
    base_url="https://api.tokenrouter.com/v1",
)
response = client.chat.completions.create(
    model="z-ai/glm-5.3-free",
    messages=[{"role": "user", "content": "Hello!"}],
)
`;

describe("parseModelPaste", () => {
  it("deja pasar el id org/modelo de NVIDIA", () => {
    expect(parseModelPaste("moonshotai/kimi-k3")).toBe("moonshotai/kimi-k3");
  });

  it("saca el id de la URL de build.nvidia.com", () => {
    expect(parseModelPaste("https://build.nvidia.com/moonshotai/kimi-k3")).toBe("moonshotai/kimi-k3");
  });

  it("saca el id del snippet Python/JSON de Build", () => {
    expect(parseModelPaste(NVIDIA)).toBe("moonshotai/kimi-k3");
  });

  it("detecta pegados del catálogo NVIDIA", () => {
    expect(isNvidiaCatalogPaste("https://build.nvidia.com/moonshotai/kimi-k3")).toBe(true);
    expect(isNvidiaCatalogPaste("moonshotai/kimi-k3")).toBe(false);
  });
});

describe("parseProviderSnippet", () => {
  it("NVIDIA Build: clave, modelo y URL", () => {
    expect(looksLikeNimSnippet(NVIDIA)).toBe(true);
    expect(parseNimSnippet(NVIDIA)).toEqual({
      apiKey: "nvapi-TESTKEY_abc-DEF",
      modelId: "moonshotai/kimi-k3",
      baseUrl: "https://integrate.api.nvidia.com/v1",
    });
    expect(parseProviderSnippet(NVIDIA)?.providerId).toBe("nvidia");
  });

  it("TokenRouter estilo OpenAI SDK", () => {
    expect(looksLikeProviderSnippet(TOKENROUTER)).toBe(true);
    expect(parseProviderSnippet(TOKENROUTER)).toEqual({
      providerId: "tokenrouter",
      apiKey: "sk-tr-TESTKEY99",
      modelId: "z-ai/glm-5.3-free",
      baseUrl: "https://api.tokenrouter.com/v1",
    });
  });

  it("tokenrouter.me también cae en TokenRouter", () => {
    const s = `
      client = OpenAI(api_key="sk-tr-TESTKEY99", base_url="https://tokenrouter.me/v1")
      client.chat.completions.create(model="kimi-k2p6")
    `;
    expect(parseProviderSnippet(s)?.providerId).toBe("tokenrouter");
    expect(parseProviderSnippet(s)?.baseUrl).toBe("https://tokenrouter.me/v1");
  });

  it("una clave suelta no es un snippet", () => {
    expect(looksLikeProviderSnippet("nvapi-TESTKEY_abc-DEF")).toBe(false);
    expect(looksLikeNimSnippet("nvapi-TESTKEY_abc-DEF")).toBe(false);
  });
});
