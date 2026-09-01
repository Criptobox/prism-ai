import { describe, expect, it } from "vitest";
import {
  FAILOVER_ORDER,
  pickFailoverCandidate,
  sanearOrdenFallback,
} from "../../src/lib/prism/free-models";
import type { ProviderId } from "../../src/lib/prism/types";
import { PROVIDERS } from "../../src/lib/prism/providers";

const cfg = (apiKey: string, enabled = true, models: string[] = ["x-free"]) => ({
  apiKey,
  enabled,
  models,
});

describe("pickFailoverCandidate con orden del usuario", () => {
  const providers = {
    gemini: cfg("k1", true, ["gemini-2.5-flash"]),
    groq: cfg("k2", true, ["llama-3.3-70b-versatile"]),
    openrouter: cfg("k3", true, ["a:free"]),
  };

  it("SIN orden usa FAILOVER_ORDER tal cual (nadie que no tocó Ajustes nota nada)", () => {
    const out = pickFailoverCandidate(providers, "aihubmix");
    expect(out).toEqual({ providerId: "gemini", modelId: "gemini-2.5-flash" });
  });

  it("con orden pasado lo respeta: groq antes que gemini sin recompilar", () => {
    const out = pickFailoverCandidate(providers, "aihubmix", undefined, ["groq", "gemini"]);
    expect(out).toEqual({ providerId: "groq", modelId: "llama-3.3-70b-versatile" });
  });

  it("el orden del usuario salta proveedores no conectados aunque estén antes", () => {
    // openrouter manda pero no está en el orden del usuario → cae a gemini
    const out = pickFailoverCandidate(providers, "aihubmix", undefined, ["gemini"]);
    expect(out).toEqual({ providerId: "gemini", modelId: "gemini-2.5-flash" });
  });

  it("un orden vacío se comporta como si no llegara (orden por defecto)", () => {
    const out = pickFailoverCandidate(providers, "aihubmix", undefined, []);
    expect(out?.providerId).toBe("gemini");
  });

  it("sigue respetando isBlocked y el excludeProviderId con orden propio", () => {
    const out = pickFailoverCandidate(
      providers,
      "groq",
      (pid, mid) => pid === "gemini" || mid === "a:free",
      ["gemini", "groq", "openrouter"]
    );
    expect(out).toBeNull();
  });
});

describe("sanearOrdenFallback", () => {
  it("lista vacía devuelve el orden por defecto completo", () => {
    expect(sanearOrdenFallback([])).toEqual(FAILOVER_ORDER);
  });

  it("un id que ya no existe se ignora", () => {
    // un orden guardado por una versión vieja puede traer ids que ya no existen:
    // el cast representa ese dato envejecido, no un valor válido hoy
    const viejo = ["proveedor-retirado", "gemini"] as unknown as ProviderId[];
    const out = sanearOrdenFallback(viejo);
    expect(out).not.toContain("proveedor-retirado");
    expect(out[0]).toBe("gemini");
  });

  it("el proveedor que falta se añade al final", () => {
    const out = sanearOrdenFallback(["groq", "gemini"]);
    expect(out.slice(0, 2)).toEqual(["groq", "gemini"]);
    // y nadie queda fuera: la lista saneada contiene a todos los conocidos
    expect(out.length).toBe(FAILOVER_ORDER.length);
    for (const id of FAILOVER_ORDER) expect(out).toContain(id);
  });

  it("duplicados fuera: un proveedor no puede aparecer dos veces", () => {
    const out = sanearOrdenFallback(["groq", "groq", "gemini"]);
    expect(out.filter((id) => id === "groq").length).toBe(1);
  });

  it("un orden guardado hace seis versiones deja de ser válido si los ids cambiaron", () => {
    const viejo = ["groq", "viejo-id", "gemini"] as unknown as ProviderId[];
    const conocidos = ["groq", "gemini", "nuevo"] as unknown as ProviderId[];
    const out = sanearOrdenFallback(viejo, conocidos);
    expect(out).toEqual(["groq", "gemini", "nuevo"]);
  });
});

/** El orden configurable se sanea contra FAILOVER_ORDER: lo que no esté ahí no
 *  entra en la cadena de failover NI aparece en la lista de Ajustes. O sea que
 *  añadir un proveedor a PROVIDERS y olvidarse de FAILOVER_ORDER lo deja
 *  invisible en los dos sitios, sin error ni aviso. Esto lo vigila. */
describe("FAILOVER_ORDER cubre a todos los proveedores", () => {
  it("ni sobra ni falta ninguno respecto a PROVIDERS", () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect([...FAILOVER_ORDER].sort()).toEqual([...ids].sort());
  });
});
