/** Prism AI — Proveedores a los que NO se manda nada.
 *
 * Tener una clave conectada y querer que un proveedor no vea tu código son
 * cosas compatibles. El veto es tajante: ni una petición, tampoco por los
 * caminos automáticos (failover, panel, ejecutores), que son justo donde un
 * proveedor acabaría recibiendo tu conversación sin que nadie lo eligiera.
 */
import { describe, expect, it } from "vitest";
import {
  permitido,
  sinVetados,
  motivoVetado,
  alternarVeto,
  quedaAlguno,
} from "../../src/lib/prism/vetados";
import type { ProviderId } from "../../src/lib/prism/types";

describe("permitido", () => {
  it("sin vetos, todo pasa", () => {
    expect(permitido("openrouter", [])).toBe(true);
    expect(permitido("openrouter", null)).toBe(true);
    expect(permitido("openrouter", undefined)).toBe(true);
  });

  it("un vetado no pasa, y solo él", () => {
    expect(permitido("openrouter", ["openrouter"])).toBe(false);
    expect(permitido("groq", ["openrouter"])).toBe(true);
  });
});

describe("sinVetados", () => {
  it("limpia la lista de candidatos de los caminos automáticos", () => {
    const cand = [
      { providerId: "openrouter" as ProviderId, modelId: "a" },
      { providerId: "groq" as ProviderId, modelId: "b" },
      { providerId: "gemini" as ProviderId, modelId: "c" },
    ];
    expect(sinVetados(cand, ["groq"]).map((c) => c.providerId)).toEqual(["openrouter", "gemini"]);
    expect(sinVetados(cand, [])).toHaveLength(3);
  });

  it("vetarlos todos deja la lista vacía, no medio llena", () => {
    const cand = [{ providerId: "groq" as ProviderId, modelId: "b" }];
    expect(sinVetados(cand, ["groq"])).toEqual([]);
  });
});

describe("motivoVetado", () => {
  it("dice que la decisión es TUYA y dónde se cambia", () => {
    // Un bloqueo sin puerta de salida se lee como un fallo de la app.
    const m = motivoVetado("OpenRouter");
    expect(m).toContain("OpenRouter");
    expect(m).toContain("tú decidiste");
    expect(m).toContain("Ajustes");
  });
});

describe("alternarVeto", () => {
  it("pone y quita, y no duplica", () => {
    expect(alternarVeto([], "groq")).toEqual(["groq"]);
    expect(alternarVeto(["groq"], "groq")).toEqual([]);
    expect(alternarVeto(["groq"], "openrouter")).toEqual(["groq", "openrouter"]);
    expect(alternarVeto(["groq", "openrouter"], "groq")).toEqual(["openrouter"]);
  });
});

describe("quedaAlguno", () => {
  it("impide vetar al último: sin nadie, la app no responde a nada", () => {
    // Y descubrirlo al enviar es la peor forma de enterarse.
    expect(quedaAlguno(["groq"], [], "groq")).toBe(false);
    expect(quedaAlguno(["groq", "openrouter"], [], "groq")).toBe(true);
    expect(quedaAlguno(["groq", "openrouter"], ["openrouter"], "groq")).toBe(false);
  });

  it("sin proveedores conectados no hay nada que proteger", () => {
    expect(quedaAlguno([], [], "groq")).toBe(false);
  });
});
