import { describe, expect, it } from "vitest";
import {
  decryptPayload,
  encryptPayload,
} from "../../src/lib/prism/crypto";

describe("cifrado de la bóveda (AES-GCM + PBKDF2)", () => {
  const payload = {
    keys: { aihubmix: "sk-test-123", gemini: "AIza-456" },
    githubToken: "ghp_dummy",
  };

  it("cifra y descifra correctamente con el mismo PIN", async () => {
    const blob = await encryptPayload("1234", payload);
    expect(blob.v).toBe(1);
    expect(blob.data.length).toBeGreaterThan(0);
    expect(JSON.stringify(blob)).not.toContain("sk-test-123");

    const out = await decryptPayload("1234", blob);
    expect(out).toEqual(payload);
  });

  it("falla con un PIN incorrecto", async () => {
    const blob = await encryptPayload("1234", payload);
    await expect(decryptPayload("9999", blob)).rejects.toThrow();
  });

  it("usa salt e IV aleatorios (dos cifrados difieren)", async () => {
    const a = await encryptPayload("1234", payload);
    const b = await encryptPayload("1234", payload);
    expect(a.salt).not.toEqual(b.salt);
    expect(a.iv).not.toEqual(b.iv);
    expect(a.data).not.toEqual(b.data);
  });

  it("sobrevive a la serialización JSON (como en localStorage)", async () => {
    const blob = await encryptPayload("pass-1234", payload);
    const restored = JSON.parse(JSON.stringify(blob));
    const out = await decryptPayload("pass-1234", restored);
    expect(out.keys.aihubmix).toBe("sk-test-123");
  });
});
