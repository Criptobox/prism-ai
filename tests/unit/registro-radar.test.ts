import { describe, expect, it } from "vitest";
import { RADAR_SOURCES, REGISTRO_LABEL, type Registro } from "../../src/lib/prism/free-radar";
import { PROVIDERS } from "../../src/lib/prism/providers";

const VALIDOS: Registro[] = ["ninguno", "email", "telefono", "tarjeta"];

describe("qué te piden para darte la clave", () => {
  it("todas las fuentes declaran el campo, aunque sea sin dato", () => {
    // que esté SIEMPRE, aunque valga null, obliga a decidirlo al añadir una
    // fuente nueva en vez de dejarlo olvidado
    for (const s of RADAR_SOURCES) {
      expect(Object.hasOwn(s, "registro"), s.id).toBe(true);
    }
  });

  it("los valores son de la lista, o null explícito", () => {
    for (const s of RADAR_SOURCES) {
      if (s.registro === null || s.registro === undefined) continue;
      expect(VALIDOS, s.id).toContain(s.registro);
    }
  });

  it("cada valor tiene su etiqueta en castellano", () => {
    for (const v of VALIDOS) expect(REGISTRO_LABEL[v]).toBeTruthy();
  });

  it("lo local no pide nada: no hay cuenta que crear", () => {
    const ollama = RADAR_SOURCES.find((s) => s.id === "src-ollama");
    expect(ollama?.registro).toBe("ninguno");
  });

  it("el filtro «sin teléfono ni tarjeta» deja fuera lo que no se sabe", () => {
    // «sin dato» no es «no piden nada»: colarlo sería la promesa falsa que
    // el filtro viene a evitar
    const pasan = RADAR_SOURCES.filter(
      (s) => s.registro === "ninguno" || s.registro === "email"
    );
    for (const s of pasan) expect(s.registro, s.id).not.toBeNull();
    const sinDato = RADAR_SOURCES.filter((s) => !s.registro);
    for (const s of sinDato) expect(pasan, s.id).not.toContain(s);
  });
});

describe("runtimes locales conectables", () => {
  const LOCALES = ["llamacpp", "jan", "vllm", "mlx", "llamafile"];

  it("están todos, sin clave y en directo", () => {
    for (const id of LOCALES) {
      const def = PROVIDERS.find((p) => p.id === id);
      expect(def, id).toBeTruthy();
      expect(def?.keyless, id).toBe(true);
      // van directos al localhost: pasar por el proxy del servidor no tiene
      // sentido cuando el servidor eres tú
      expect(def?.directByDefault, id).toBe(true);
    }
  });

  it("apuntan a localhost, no a la nube de nadie", () => {
    for (const id of LOCALES) {
      const def = PROVIDERS.find((p) => p.id === id);
      expect(def?.baseUrl, id).toMatch(/^http:\/\/localhost:\d+/);
    }
  });

  it("NO traen modelos escritos a mano", () => {
    // a un servidor local no se le adivina qué tiene descargado: se le
    // pregunta. Escribir nombres aquí sería repetir el fallo de los
    // sugeridos de OpenRouter, que proponían modelos inexistentes.
    for (const id of LOCALES) {
      const def = PROVIDERS.find((p) => p.id === id);
      expect(def?.defaultModels, id).toEqual([]);
    }
  });

  it("cada uno explica cómo levantar su servidor", () => {
    for (const id of LOCALES) {
      const def = PROVIDERS.find((p) => p.id === id);
      expect(def?.hint, id).toBeTruthy();
    }
  });
});
