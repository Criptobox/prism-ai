/** Prism AI — «Auto Context»: qué contexto viajó de verdad.
 *
 * Idea de `PLAN-EVOLUCION.md` §12, en la parte que se puede hacer sin
 * inventar: enseñar lo que se USÓ, no adivinar lo que haría falta.
 *
 * Lo que se prueba aquí es sobre todo cuándo NO se enseña: un chip que sale en
 * todas las respuestas diciendo «0 archivos» es ruido que la gente aprende a
 * ignorar en dos días, y entonces tampoco lo mira cuando sí hay algo.
 */
import { describe, expect, it } from "vitest";
import {
  CONTEXTO_VACIO,
  hayContexto,
  lineaContexto,
  detalleContexto,
  type ContextoUsado,
} from "../../src/lib/prism/contexto-usado";

const ctx = (over: Partial<ContextoUsado> = {}): ContextoUsado => ({ ...CONTEXTO_VACIO, ...over });

describe("hayContexto", () => {
  it("sin nada del proyecto, no se enseña", () => {
    expect(hayContexto(CONTEXTO_VACIO)).toBe(false);
  });

  it("los caracteres solos NO cuentan: el prompt base viaja siempre", () => {
    // Si contaran, el chip saldría en el 100% de las respuestas y dejaría de
    // significar algo.
    expect(hayContexto(ctx({ chars: 4000 }))).toBe(false);
  });

  it("los mensajes solos tampoco: el historial también viaja siempre", () => {
    expect(hayContexto(ctx({ mensajes: 12 }))).toBe(false);
  });

  it("cualquier cosa del proyecto sí lo enseña", () => {
    expect(hayContexto(ctx({ archivos: ["a.html"] }))).toBe(true);
    expect(hayContexto(ctx({ notas: 1 }))).toBe(true);
    expect(hayContexto(ctx({ reglas: 1 }))).toBe(true);
    expect(hayContexto(ctx({ skills: ["Diseño"] }))).toBe(true);
    expect(hayContexto(ctx({ fallos: 1 }))).toBe(true);
    expect(hayContexto(ctx({ documentos: 1 }))).toBe(true);
    expect(hayContexto(ctx({ imagenes: 1 }))).toBe(true);
  });
});

describe("lineaContexto", () => {
  it("solo escribe lo que no es cero", () => {
    const l = lineaContexto(ctx({ archivos: ["a", "b"], notas: 1, mensajes: 8 }));
    expect(l).toBe("2 archivos · 1 nota · 8 mensajes");
    expect(l).not.toContain("0");
  });

  it("singular y plural, sin «1 archivos»", () => {
    expect(lineaContexto(ctx({ archivos: ["a"] }))).toBe("1 archivo");
    expect(lineaContexto(ctx({ imagenes: 1 }))).toBe("1 imagen");
    expect(lineaContexto(ctx({ imagenes: 3 }))).toBe("3 imágenes");
    expect(lineaContexto(ctx({ fallos: 1 }))).toBe("1 fallo aprendido");
  });

  it("sin nada, cadena vacía (no «0 cosas»)", () => {
    expect(lineaContexto(CONTEXTO_VACIO)).toBe("");
  });
});

describe("detalleContexto", () => {
  it("NOMBRA los archivos y las skills: saber «4 archivos» no sirve de nada", () => {
    const d = detalleContexto(
      ctx({ archivos: ["index.html", "estilos.css"], skills: ["Diseño"], notas: 2 })
    );
    expect(d.join("\n")).toContain("index.html, estilos.css");
    expect(d.join("\n")).toContain("Diseño");
    expect(d.join("\n")).toContain("2 nota(s)");
  });

  it("no lista lo que vale cero", () => {
    const d = detalleContexto(ctx({ archivos: ["a.html"] }));
    expect(d.join("\n")).not.toMatch(/0 /);
  });

  it("los caracteres del prompt se dicen", () => {
    // Sin comprobar el separador de miles: `toLocaleString("es")` lo pone en el
    // navegador, pero Node puede correr sin los datos de ICU completos y
    // devolver «4321». Atar el test a eso sería atarlo al entorno, no al
    // comportamiento.
    const t = detalleContexto(ctx({ chars: 4321 })).join("");
    expect(t).toMatch(/4\.?321/);
    expect(t).toContain("instrucciones de sistema");
  });

  it("sin nada, lista vacía", () => {
    expect(detalleContexto(CONTEXTO_VACIO)).toEqual([]);
  });
});
