/** Prism AI — Fallos que salen cuando TÚ usas la página generada.
 *
 * El barrido automático pulsa a ciegas, en el orden del DOM y sin escribir en
 * los campos. El uso real aporta lo que a ese le falta: tu orden, tus datos y
 * los enlaces que tú eliges. Estos tests fijan las dos reglas que evitan que
 * el aviso se vuelva ruido.
 */
import { describe, it, expect } from "vitest";
import {
  registrarError,
  resumenErroresVivos,
  promptDeErroresVivos,
  MAX_ERRORES_VIVOS,
  type ErrorEnVivo,
} from "../../src/lib/prism/errores-en-vivo";

const SANDBOX =
  "Uncaught SecurityError: Failed to read the 'localStorage' property from 'Window': The document is sandboxed and lacks the 'allow-same-origin' flag.";

describe("registrarError", () => {
  it("guarda el error con el gesto que lo provocó", () => {
    const l = registrarError([], "x is not defined", "Guardar");
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ texto: "x is not defined", gesto: "Guardar", veces: 1 });
  });

  /* La vista previa corre sin allow-same-origin, así que localStorage lanza
   * SecurityError ahí dentro — y una página generada lo usa constantemente.
   * Sin este filtro avisaríamos de un fallo inexistente cada vez que alguien
   * guarda algo. */
  it("los errores de nuestro propio sandbox NO se cuentan", () => {
    expect(registrarError([], SANDBOX, "Guardar")).toEqual([]);
  });

  /* Un fallo dentro de un bucle o de un mousemove llenaría la lista en un
   * segundo y la volvería inútil. */
  it("el mismo error repetido sube el contador, no añade líneas", () => {
    let l = registrarError([], "x is not defined", "Sumar");
    l = registrarError(l, "x is not defined", "Restar");
    expect(l).toHaveLength(1);
    expect(l[0].veces).toBe(2);
    expect(l[0].gesto, "se queda el último camino que lo provocó").toBe("Restar");
  });

  it("errores distintos sí se acumulan, hasta el tope", () => {
    let l: ErrorEnVivo[] = [];
    for (let i = 0; i < MAX_ERRORES_VIVOS + 3; i++) l = registrarError(l, `error ${i}`);
    expect(l).toHaveLength(MAX_ERRORES_VIVOS);
  });

  it("el texto vacío no entra", () => {
    expect(registrarError([], "   ")).toEqual([]);
  });
});

describe("resumenErroresVivos", () => {
  it("con un solo error, dice dónde pasó", () => {
    const l = registrarError([], "boom", "Guardar");
    expect(resumenErroresVivos(l)).toBe("Error al pulsar «Guardar»");
  });

  it("sin gesto, no se inventa uno", () => {
    expect(resumenErroresVivos(registrarError([], "boom"))).toBe("Error al usarla");
  });

  it("cuenta las repeticiones", () => {
    let l = registrarError([], "boom", "A");
    l = registrarError(l, "boom", "A");
    expect(resumenErroresVivos(l)).toContain("×2");
  });

  it("sin errores, no dice nada", () => {
    expect(resumenErroresVivos([])).toBe("");
  });
});

describe("promptDeErroresVivos", () => {
  it("le da el error tal cual y por dónde se llegó", () => {
    const l = registrarError([], "Uncaught ReferenceError: guardar is not defined", "Guardar");
    const p = promptDeErroresVivos(l, "index.html");
    expect(p).toContain("guardar is not defined");
    expect(p).toContain("al pulsar «Guardar»");
    expect(p).toContain("index.html");
    expect(p).toMatch(/no expliques/i);
  });
});
