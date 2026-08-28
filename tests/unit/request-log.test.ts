import { describe, expect, it, beforeEach } from "vitest";
import {
  beginRequest,
  buildCurl,
  clearRecentRequests,
  getRecentRequests,
  redactHeaders,
  sanitizeBody,
} from "../../src/lib/prism/request-log";

const base = {
  providerId: "aihubmix",
  providerName: "AiHubMix",
  modelId: "gpt-4.1-free",
  url: "https://aihubmix.com/v1/chat/completions",
  method: "POST",
};

describe("registro de peticiones (copiar como cURL)", () => {
  beforeEach(() => clearRecentRequests());

  it("registra y cierra peticiones con estado y duración", () => {
    const finish = beginRequest({ ...base, headers: { Authorization: "Bearer sk-abc" }, body: "{}" });
    expect(getRecentRequests()).toHaveLength(1);
    finish({ ok: true, status: 200, ms: 850 });
    const [entry] = getRecentRequests();
    expect(entry.ok).toBe(true);
    expect(entry.status).toBe(200);
    expect(entry.ms).toBe(850);
  });

  it("el anillo se acota a 10 entradas y la más reciente va primera", () => {
    for (let i = 0; i < 14; i++) {
      beginRequest({ ...base, modelId: `m-${i}`, headers: {}, body: "{}" })({ ok: true, status: 200, ms: 1 });
    }
    const all = getRecentRequests();
    expect(all).toHaveLength(10);
    expect(all[0].modelId).toBe("m-13");
  });

  it("REDACTA las claves en las cabeceras guardadas", () => {
    beginRequest({
      ...base,
      headers: {
        Authorization: "Bearer sk-secreto",
        "x-api-key": "sk-123",
        "x-goog-api-key": "AIzaXXXX",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    const [entry] = getRecentRequests();
    expect(JSON.stringify(entry)).not.toContain("sk-secreto");
    expect(JSON.stringify(entry)).not.toContain("sk-123");
    expect(entry.headers["Authorization"]).toBe("TU_API_KEY");
    expect(entry.headers["Content-Type"]).toBe("application/json");
  });

  it("sanitizeBody quita data URLs y recorta contenidos largos", () => {
    const body = JSON.stringify({
      messages: [
        { role: "user", content: "x".repeat(2000) },
        { role: "user", content: [{ type: "image_url", image_url: { url: "data:image/jpeg;base64,AAAA" } }] },
      ],
    });
    const clean = sanitizeBody(body);
    expect(clean).not.toContain("AAAA");
    expect(clean).toContain("[imagen omitida]");
    expect(clean.length).toBeLessThan(body.length);
  });

  it("buildCurl produce un comando válido con TU_API_KEY y la URL", () => {
    beginRequest({ ...base, headers: { Authorization: "Bearer sk-xyz" }, body: '{"model":"gpt"}' })({
      ok: false,
      status: 429,
      ms: 40,
    });
    const curl = buildCurl(getRecentRequests()[0]);
    expect(curl.startsWith("curl -X POST 'https://aihubmix.com/v1/chat/completions'")).toBe(true);
    expect(curl).toContain("TU_API_KEY");
    expect(curl).not.toContain("sk-xyz");
    expect(curl).toContain('"model": "gpt"'); // el body se guarda formateado (pretty-print)
  });
});
