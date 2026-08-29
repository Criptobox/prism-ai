import { describe, expect, it } from "vitest";
import { CADA_MS, copiaServida, hayCopiaNueva, tocaComprobar } from "../../src/lib/prism/app-update";

describe("hayCopiaNueva", () => {
  it("el commit distinto basta, aunque la versión no se mueva", () => {
    // El caso normal: veinte arreglos seguidos sin subir el número.
    expect(hayCopiaNueva({ version: "3.6.0", commit: "aaaaaaa" }, { version: "3.6.0", commit: "bbbbbbb" })).toBe(true);
  });

  it("el mismo commit no avisa", () => {
    expect(hayCopiaNueva({ version: "3.6.0", commit: "aaaaaaa" }, { version: "3.6.0", commit: "aaaaaaa" })).toBe(false);
  });

  it("sin commits, avisa solo si la versión del servidor es mayor", () => {
    expect(hayCopiaNueva({ version: "3.6.0", commit: "" }, { version: "3.7.0", commit: "" })).toBe(true);
    expect(hayCopiaNueva({ version: "3.6.0", commit: "" }, { version: "3.6.0", commit: "" })).toBe(false);
  });

  it("un servidor que responde una versión MÁS VIEJA no avisa", () => {
    // Un despliegue a medias o una caché intermedia. Avisar aquí solo enseña a
    // ignorar el aviso, que es peor que no tenerlo.
    expect(hayCopiaNueva({ version: "3.6.0", commit: "" }, { version: "3.5.0", commit: "" })).toBe(false);
  });

  it("si falta un commit, decide la versión y no el commit a medias", () => {
    expect(hayCopiaNueva({ version: "3.6.0", commit: "aaaaaaa" }, { version: "3.6.0", commit: "" })).toBe(false);
    expect(hayCopiaNueva({ version: "3.6.0", commit: "" }, { version: "3.7.0", commit: "bbbbbbb" })).toBe(true);
  });
});

describe("tocaComprobar", () => {
  it("la primera vez siempre", () => {
    expect(tocaComprobar(1_000, 0, CADA_MS)).toBe(true);
  });
  it("no se pregunta dos veces seguidas", () => {
    expect(tocaComprobar(1_000, 900, CADA_MS)).toBe(false);
  });
  it("pasado el intervalo, sí", () => {
    expect(tocaComprobar(CADA_MS + 1, 1, CADA_MS)).toBe(true);
  });
});

describe("copiaServida", () => {
  const respuesta = (body: unknown, ok = true) =>
    (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

  it("lee versión y commit", async () => {
    expect(await copiaServida(respuesta({ version: "3.6.0", commit: "abc1234" }))).toEqual({
      version: "3.6.0",
      commit: "abc1234",
    });
  });

  it("sin commit en la respuesta se queda vacío, no rompe", async () => {
    expect(await copiaServida(respuesta({ version: "3.6.0" }))).toEqual({ version: "3.6.0", commit: "" });
  });

  it("un error de red no molesta al usuario: devuelve null", async () => {
    const roto = (async () => {
      throw new Error("sin red");
    }) as unknown as typeof fetch;
    expect(await copiaServida(roto)).toBeNull();
  });

  it("una respuesta que no vale tampoco avisa", async () => {
    expect(await copiaServida(respuesta({}, true))).toBeNull();
    expect(await copiaServida(respuesta({ version: "3.6.0" }, false))).toBeNull();
  });
});
