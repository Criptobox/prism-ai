import { describe, expect, it, beforeEach } from "vitest";
import {
  parseRateLimitHeaders,
  parseResetDuration,
  parseOpenRouterKey,
  useQuota,
  type QuotaWindow,
} from "../../src/lib/prism/quota";

const reset = () => useQuota.setState({ byProvider: {} });

describe("medidor honesto de cuota (parseo de cabeceras)", () => {
  beforeEach(reset);

  it("parsea las cabeceras x-ratelimit-* de Groq (requests y tokens)", () => {
    const r = parseRateLimitHeaders({
      "x-ratelimit-limit-requests": "50",
      "x-ratelimit-remaining-requests": "41",
      "x-ratelimit-reset-requests": "2m 59.31s",
      "x-ratelimit-limit-tokens": "100000",
      "x-ratelimit-remaining-tokens": "92300",
      "x-ratelimit-reset-tokens": "2m 31.02s",
    });
    expect(r).not.toBeNull();
    const w = r!.windows;
    expect(w.requests).toEqual({
      remaining: 41,
      limit: 50,
      resetAt: expect.any(Number),
    });
    expect(w.tokens?.remaining).toBe(92300);
    expect(w.tokens?.limit).toBe(100000);
    // «2m 59.31s» ≈ 179310 ms de reposición
    const resetMs = w.requests!.resetAt - Date.now();
    expect(resetMs).toBeGreaterThan(170_000);
    expect(resetMs).toBeLessThanOrEqual(180_000);
  });

  it("sin cabeceras x-ratelimit devuelve null — nunca se inventa una ventana", () => {
    expect(parseRateLimitHeaders({ "content-type": "application/json" })).toBeNull();
    expect(parseRateLimitHeaders({})).toBeNull();
  });

  it("una cabecera limit sin remaining asume que queda todo el límite", () => {
    const r = parseRateLimitHeaders({ "x-ratelimit-limit-requests": "30" });
    expect(r?.windows.requests).toMatchObject({ remaining: 30, limit: 30, resetAt: 0 });
  });

  it("parseResetDuration entiende compuestos, segundos pelados y basura", () => {
    expect(parseResetDuration("2m 59.31s")).toBeCloseTo(179_310, -1);
    expect(parseResetDuration("1h 0m")).toBe(3_600_000);
    expect(parseResetDuration("45s")).toBe(45_000);
    expect(parseResetDuration("299")).toBe(299_000); // segundos pelados
    expect(parseResetDuration("")).toBe(0);
    expect(parseResetDuration("mañana")).toBe(0);
  });

  it("ignora ventanas con límite o remaining no numéricos", () => {
    const r = parseRateLimitHeaders({
      "x-ratelimit-limit-requests": "abc",
      "x-ratelimit-remaining-requests": "10",
    });
    expect(r).toBeNull();
  });

  it("parseOpenRouterKey lee uso y tope (limit null = sin tope)", () => {
    expect(
      parseOpenRouterKey({ data: { usage: 0.12, limit: 5 } })
    ).toEqual({ used: 0.12, limit: 5 });
    expect(parseOpenRouterKey({ data: { usage: 1.5, limit: null } })).toEqual({
      used: 1.5,
      limit: null,
    });
    expect(parseOpenRouterKey({ error: "nope" })).toBeNull();
    expect(parseOpenRouterKey(null)).toBeNull();
  });
});

describe("store de cuota", () => {
  beforeEach(reset);

  it("recordWindows guarda y actualiza las ventanas medidas", () => {
    const s = useQuota.getState();
    s.recordWindows("groq", {
      requests: { remaining: 10, limit: 50, resetAt: 0 },
    });
    expect(useQuota.getState().byProvider.groq?.kind).toBe("medida");
    s.recordWindows("groq", {
      tokens: { remaining: 1000, limit: 2000, resetAt: 0 },
    });
    const w = useQuota.getState().byProvider.groq?.windows;
    expect(w?.requests).toBeDefined();
    expect(w?.tokens?.remaining).toBe(1000);
  });

  it("recordConsultada guarda el estado consultado", () => {
    useQuota.getState().recordConsulted("openrouter", {
      used: 0.5,
      limit: null,
      unit: "créditos",
    });
    const q = useQuota.getState().byProvider.openrouter;
    expect(q?.kind).toBe("consultada");
    expect(q?.consulted?.limit).toBeNull();
    expect(q?.consulted?.unit).toBe("créditos");
  });

  it("clear olvida un proveedor concreto", () => {
    useQuota.getState().recordWindows("groq", {
      requests: { remaining: 1, limit: 2, resetAt: 0 } as QuotaWindow,
    });
    useQuota.getState().clear("groq");
    expect(useQuota.getState().byProvider.groq).toBeUndefined();
  });
});
