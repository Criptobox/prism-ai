import { describe, expect, it, beforeEach } from "vitest";
import {
  useHealth,
  cooldownRemaining,
  isBlockedProviderAware,
  statusFromError,
  retryAfterFromError,
} from "../../src/lib/prism/health";

const reset = () => useHealth.setState({ entries: {}, lastGood: null });

describe("salud de modelos (circuit breaker lite)", () => {
  beforeEach(reset);

  it("cooldownRemaining devuelve 0 sin entrada y con entrada caducada", () => {
    expect(cooldownRemaining(undefined)).toBe(0);
    expect(cooldownRemaining({ until: Date.now() - 1000, consecutive: 1, lastStatus: 429 })).toBe(0);
  });

  it("cooldownRemaining devuelve los ms restantes", () => {
    const left = cooldownRemaining({ until: Date.now() + 5000, consecutive: 1, lastStatus: 429 });
    expect(left).toBeGreaterThan(4000);
    expect(left).toBeLessThanOrEqual(5000);
  });

  it("un 429 enfría ~60s y el backoff lo duplica en el segundo fallo", () => {
    useHealth.getState().recordFailure("p::m", 429);
    const e1 = useHealth.getState().entries["p::m"];
    expect(e1.until - Date.now()).toBeGreaterThan(55_000);
    useHealth.getState().recordFailure("p::m", 429);
    const e2 = useHealth.getState().entries["p::m"];
    expect(e2.until - Date.now()).toBeGreaterThan(110_000);
    expect(e2.consecutive).toBe(2);
  });

  it("respeta Retry-After del proveedor en el primer enfriamiento", () => {
    useHealth.getState().recordFailure("p::m", 429, 120_000);
    const e = useHealth.getState().entries["p::m"];
    expect(e.until - Date.now()).toBeGreaterThan(115_000);
  });

  it("un 5xx enfría poco; un 402 (cuota) enfría 5 min", () => {
    useHealth.getState().recordFailure("p::a", 503);
    expect(useHealth.getState().entries["p::a"].until - Date.now()).toBeGreaterThan(10_000);
    useHealth.getState().recordFailure("p::b", 402);
    expect(useHealth.getState().entries["p::b"].until - Date.now()).toBeGreaterThan(4 * 60_000);
  });

  it("un 401 marca el motivo pero NO pone cooldown (clave inválida)", () => {
    useHealth.getState().recordFailure("p::k", 401);
    const e = useHealth.getState().entries["p::k"];
    expect(cooldownRemaining(e)).toBe(0);
    expect(e.reason).toBe("clave inválida");
  });

  it("el éxito limpia la entrada y fija lastGood (LKGP)", () => {
    useHealth.getState().recordFailure("p::m", 429);
    useHealth.getState().recordSuccess("p::m");
    expect(useHealth.getState().entries["p::m"]).toBeUndefined();
    expect(useHealth.getState().lastGood?.key).toBe("p::m");
  });

  it("statusFromError entiende objetos con status y mensajes «Proveedor 429: …»", () => {
    expect(statusFromError(Object.assign(new Error("x"), { status: 429 }))).toBe(429);
    expect(statusFromError(new Error("Groq 503: overloaded"))).toBe(503);
    expect(statusFromError(new Error("Fallo de red"))).toBe(0);
  });

  it("retryAfterFromError extrae los ms si el error los trae", () => {
    expect(retryAfterFromError(Object.assign(new Error("x"), { retryAfterMs: 2000 }))).toBe(2000);
    expect(retryAfterFromError(new Error("sin cabecera"))).toBeUndefined();
  });
});

describe("enfriamiento por PROVEEDOR (cuota)", () => {
  beforeEach(() => useHealth.setState({ entries: {}, providerEntries: {}, lastGood: null }));

  it("un 429 de un modelo enfría también al proveedor entero", () => {
    useHealth.getState().recordFailure("groq::llama-3", 429);
    const p = useHealth.getState().providerEntries.groq;
    expect(p).toBeDefined();
    expect(p!.until - Date.now()).toBeGreaterThan(55_000);
    expect(p!.reason).toMatch(/cuota del proveedor/);
  });

  it("el failover salta al otro proveedor: isBlockedProviderAware bloquea todos los modelos del proveedor enfriado", () => {
    useHealth.getState().recordFailure("groq::llama-3", 429);
    const h = useHealth.getState();
    const makeKey = (p: string, m: string) => `${p}::${m}`;
    expect(
      isBlockedProviderAware(h.entries, h.providerEntries, "groq", "llama-70b", makeKey)
    ).toBe(true); // otro modelo del MISMO proveedor: bloqueado
    expect(
      isBlockedProviderAware(h.entries, h.providerEntries, "gemini", "flash", makeKey)
    ).toBe(false); // otro proveedor: libre
  });

  it("un éxito de cualquier modelo del proveedor levanta su enfriamiento", () => {
    useHealth.getState().recordFailure("groq::llama-3", 429);
    useHealth.getState().recordSuccess("groq::llama-70b");
    expect(useHealth.getState().providerEntries.groq).toBeUndefined();
  });

  it("el 402 enfría al proveedor 5 min; un 5xx NO toca al proveedor", () => {
    useHealth.getState().recordFailure("aihubmix::gpt-free", 402);
    expect(useHealth.getState().providerEntries.aihubmix!.until - Date.now()).toBeGreaterThan(
      4 * 60_000
    );
    useHealth.getState().recordFailure("openai::gpt", 503);
    expect(useHealth.getState().providerEntries.openai).toBeUndefined();
  });

  it("recordProviderFailure agrava con backoff y Retry-After manda si es mayor", () => {
    useHealth.getState().recordProviderFailure("cerebras", 429, 120_000);
    expect(useHealth.getState().providerEntries.cerebras!.until - Date.now()).toBeGreaterThan(
      115_000
    );
    useHealth.getState().recordProviderFailure("cerebras", 429);
    const e = useHealth.getState().providerEntries.cerebras;
    expect(e!.consecutive).toBe(2);
    expect(e!.until - Date.now()).toBeGreaterThan(115_000); // 60s × 2
  });
});
