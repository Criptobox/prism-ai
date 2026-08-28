import { describe, expect, it } from "vitest";
import { detectPII, maskPII, luhnValid } from "../../src/lib/prism/pii";

describe("escudo PII local", () => {
  it("luhnValid acepta tarjetas reales y rechaza números largos cualesquiera", () => {
    expect(luhnValid("4539 1488 0343 6467")).toBe(true); // visa de test
    expect(luhnValid("5500 0000 0000 0004")).toBe(true); // mastercard de test
    expect(luhnValid("1234 5678 9012 3456")).toBe(false);
    expect(luhnValid("123")).toBe(false);
  });

  it("enmascara correos conservando inicial y dominio", () => {
    const r = maskPII("Escríbeme a juan.perez@gmail.com por favor");
    expect(r.masked).toContain("***@gmail.com");
    expect(r.masked).not.toContain("juan.perez@gmail.com");
    expect(r.findings.some((f) => f.type === "email")).toBe(true);
  });

  it("enmascara teléfonos españoles con +34 y móviles 6xx", () => {
    const r = maskPII("Mi número es +34 612 345 678 y el fijo 912 345 678");
    expect(r.masked).not.toContain("612 345 678");
    expect(r.findings.filter((f) => f.type === "phone").length).toBeGreaterThanOrEqual(2);
  });

  it("solo enmascara tarjetas que pasan Luhn (no cualquier número largo)", () => {
    const r = maskPII("Tarjeta 4539 1488 0343 6467 y pedido 1234567890123");
    expect(r.masked).toContain("**** **** **** 6467");
    expect(r.masked).toContain("1234567890123"); // no es tarjeta: se queda
  });

  it("enmascara IBAN español y DNI", () => {
    const r = maskPII("Cuenta ES91 2100 0418 4502 0005 1332 y DNI 12345678Z");
    expect(r.masked).not.toContain("2100 0418 4502 0005 1332");
    expect(r.masked).not.toContain("12345678Z");
    expect(r.findings.some((f) => f.type === "iban")).toBe(true);
    expect(r.findings.some((f) => f.type === "dni")).toBe(true);
  });

  it("el código entre vallas NO se enmascara", () => {
    const code = '```\nconst email = "test@example.com";\nconst card = 4539148803436467;\n```';
    const r = maskPII(`mira este código:\n${code}`);
    expect(r.masked).toContain("test@example.com");
    expect(r.masked).toContain("4539148803436467");
  });

  it("el texto sin datos personales queda EXACTAMENTE igual", () => {
    const txt = "¿Cómo optimizo esta consulta de SQL sin tocar los índices actuales?";
    expect(maskPII(txt).masked).toBe(txt);
    expect(detectPII(txt)).toHaveLength(0);
  });

  it("es idempotente: los trozos ya enmascarados no se re-enmascaran", () => {
    const once = maskPII("Llama al 612 345 678").masked;
    const twice = maskPII(once).masked;
    expect(twice).toBe(once);
  });
});
