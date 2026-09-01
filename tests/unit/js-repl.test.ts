/** Tests del REPL de JS (tool run_js): la parte pura.
 *
 * El iframe solo funciona en navegador (lo cubre el E2E); aquí se
 * prueba el serializador — que es donde un valor hostil (circular,
 * profundo, función) puede romper la respuesta al modelo — y el srcdoc
 * (que un `</script>` del usuario no parta el HTML).
 */
import { describe, expect, it } from "vitest";
import { buildSrcdoc, serializar } from "../../src/lib/prism/js-repl";

describe("serializar", () => {
  it("primitivos tal cual (los strings con comillas)", () => {
    expect(serializar("hola")).toBe('"hola"');
    expect(serializar(42)).toBe("42");
    expect(serializar(true)).toBe("true");
    expect(serializar(null)).toBe("null");
    expect(serializar(undefined)).toBe("undefined");
  });

  it("arrays y objetos legibles", () => {
    expect(serializar([1, "dos", null])).toBe('[1, "dos", null]');
    expect(serializar({ a: 1, b: "x" })).toBe('{a: 1, b: "x"}');
  });

  it("arrays largos se cortan avisando", () => {
    const r = serializar(Array.from({ length: 50 }, (_, i) => i));
    expect(r).toContain("…(+20)");
    expect(r.startsWith("[0, 1, 2")).toBe(true);
  });

  it("objetos anidados con tope de profundidad", () => {
    const profundo = { a: { b: { c: { d: { e: 1 } } } } };
    const r = serializar(profundo);
    expect(r).toContain("{…}");
  });

  it("referencias circulares no explotan", () => {
    const a: Record<string, unknown> = { nombre: "a" };
    a["yo"] = a;
    expect(serializar(a)).toContain("[circular]");
  });

  it("Error serializado con nombre y mensaje", () => {
    expect(serializar(new TypeError("no es una función"))).toBe(
      "TypeError: no es una función"
    );
  });

  it("funciones serializadas sin volcar su código", () => {
    expect(serializar(() => 42)).toBe("[Function]");
    const nombrada = function miFn() { return 1; };
    expect(serializar(nombrada)).toBe("[Function miFn]");
  });

  it("strings largos se recortan con contador", () => {
    const r = serializar("x".repeat(500));
    expect(r).toContain("…(+200)");
  });

  it("Map y Set con tamaño", () => {
    expect(serializar(new Map([["k", 1]]))).toBe('Map(1) {"k" => 1}');
    expect(serializar(new Set([1, 2]))).toBe("Set(2) {1, 2}");
  });
});

describe("buildSrcdoc", () => {
  it("un </script> del usuario no rompe el srcdoc", () => {
    const maligno = 'const resultado = "</script><script>alert(1)</script>";';
    const doc = buildSrcdoc(maligno);
    // el contenido viaja escapado dentro de un literal JSON, no suelto
    const apariciones = doc.match(/<\/script>/g) ?? [];
    // solo cierra el <script> del propio REPL (una vez), no el del ataque
    expect(apariciones.length).toBe(1);
    expect(doc).toContain("prism-repl");
  });

  it("contiene el contrato de la variable resultado", () => {
    expect(buildSrcdoc("const resultado = 1")).toContain(
      'typeof resultado !== "undefined"'
    );
  });
});
