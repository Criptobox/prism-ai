import { describe, expect, it } from "vitest";
import {
  aplicarParches,
  limpiarParche,
  mensajeResultado,
  parsearParches,
  pareceParche,
} from "../../src/lib/prism/patch";

describe("pareceParche", () => {
  it("reconoce texto con bloques", () => {
    expect(pareceParche("<<<<<<< SEARCH\na\n=======\nb\n>>>>>>> REPLACE")).toBe(true);
  });
  it("rechaza texto sin bloques", () => {
    expect(pareceParche("hola")).toBe(false);
    expect(pareceParche("")).toBe(false);
  });
});

describe("parsearParches", () => {
  it("extrae un bloque simple", () => {
    const t = "texto previo\n<<<<<<< SEARCH\nconst a = 1;\n=======\nconst a = 2;\n>>>>>>> REPLACE";
    expect(parsearParches(t)).toEqual([
      { search: "const a = 1;", replace: "const a = 2;" },
    ]);
  });

  it("extrae varios bloques", () => {
    const t = [
      "<<<<<<< SEARCH", "uno", "=======", "dos", ">>>>>>> REPLACE",
      "<<<<<<< SEARCH", "tres", "=======", "cuatro", ">>>>>>> REPLACE",
    ].join("\n");
    expect(parsearParches(t)).toEqual([
      { search: "uno", replace: "dos" },
      { search: "tres", replace: "cuatro" },
    ]);
  });

  it("tolera cabeceras con texto extra y flechas de más", () => {
    const t = "<<<<<<<<< SEARCH — botón\nx\n=======\ny\n>>>>>>>>> REPLACE";
    expect(parsearParches(t)).toEqual([{ search: "x", replace: "y" }]);
  });

  it("descarta el bloque abierto al final (parcial)", () => {
    const t = "<<<<<<< SEARCH\nuno\n=======\ndos\n>>>>>>> REPLACE\n\n<<<<<<< SEARCH\ntres";
    expect(parsearParches(t)).toEqual([{ search: "uno", replace: "dos" }]);
  });

  it("un separador con menos de 7 = no separa", () => {
    // «======» (6) es parte del contenido, no separador
    const t = "<<<<<<< SEARCH\na\n======\nb\n>>>>>>> REPLACE";
    expect(parsearParches(t)).toEqual([]);
  });
});

describe("limpiarParche", () => {
  it("quita la ruta del archivo si el modelo la puso en la primera línea", () => {
    const limpio = limpiarParche({ search: "index.html\n<body>", replace: "index.html\n<BODY>" });
    expect(limpio.search).toBe("<body>");
    expect(limpio.replace).toBe("<BODY>");
  });
  it("no toca un fragmento normal", () => {
    const p = { search: "const a = 1;", replace: "const a = 2;" };
    expect(limpiarParche(p)).toEqual(p);
  });
});

describe("aplicarParches", () => {
  const original = [
    "<html>",
    "  <h1>Hola</h1>",
    "  <p>parrafo</p>",
    "</html>",
  ].join("\n");

  it("aplica un parche exacto", () => {
    const r = aplicarParches(original, [{ search: "  <h1>Hola</h1>", replace: "  <h1>Adiós</h1>" }]);
    expect(r.ok).toBe(true);
    expect(r.resultado).toContain("<h1>Adiós</h1>");
    expect(r.aplicados).toBe(1);
  });

  it("aplica varios en orden (el segundo sobre el resultado del primero)", () => {
    const r = aplicarParches(original, [
      { search: "<h1>Hola</h1>", replace: "<h1>Adiós</h1>" },
      { search: "<p>parrafo</p>", replace: "<p>texto</p>" },
    ]);
    expect(r.ok).toBe(true);
    expect(r.resultado).toContain("Adiós");
    expect(r.resultado).toContain("texto");
  });

  it("falla si el fragmento aparece más de una vez", () => {
    const doble = "a\nb\na";
    const r = aplicarParches(doble, [{ search: "a", replace: "c" }]);
    expect(r.ok).toBe(false);
    expect(r.aplicados).toBe(0);
    expect(r.fallos[0].motivo).toMatch(/2 veces/);
  });

  it("reintenta con coincidencia flexible por sangría", () => {
    // el modelo perdió la sangría del original
    const r = aplicarParches(original, [{ search: "<h1>Hola</h1>", replace: "<h1>Nuevo</h1>" }]);
    expect(r.ok).toBe(true);
    expect(r.resultado).toContain("  <h1>Nuevo</h1>");
  });

  it("no toca nada del archivo si un bloque falla: los que aplican, aplican", () => {
    const r = aplicarParches(original, [
      { search: "<p>parrafo</p>", replace: "<p>ok</p>" },
      { search: "NO-EXISTE", replace: "x" },
    ]);
    expect(r.ok).toBe(false);
    expect(r.aplicados).toBe(1);
    expect(r.resultado).toContain("<p>ok</p>");
  });

  it("bloque SEARCH vacío falla con mensaje claro", () => {
    const r = aplicarParches(original, [{ search: "", replace: "x" }]);
    expect(r.ok).toBe(false);
    expect(r.fallos[0].motivo).toMatch(/vacío/);
  });
});

describe("mensajeResultado", () => {
  it("en éxito dice cuántos aplicaron", () => {
    const r = aplicarParches("a", [{ search: "a", replace: "b" }]);
    expect(mensajeResultado("f.ts", r, 1)).toMatch(/1 bloque/);
  });
  it("en fallo lista los bloques rotos y prohíbe reescribir", () => {
    const r = aplicarParches("a\nb", [{ search: "zzz", replace: "x" }]);
    const m = mensajeResultado("f.ts", r, 3);
    expect(m).toMatch(/Bloque 1/);
    expect(m).toMatch(/NO reescribas/);
  });
});
