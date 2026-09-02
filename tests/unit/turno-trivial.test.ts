import { describe, expect, it } from "vitest";
import { esTurnoTrivial } from "../../src/lib/prism/turno-trivial";

describe("esTurnoTrivial — un saludo no arranca el bucle del agente", () => {
  it("los saludos y cortesías lo son", () => {
    for (const t of [
      "Hola",
      "hola!",
      "  HOLA  ",
      "buenas",
      "Buenos días",
      "buenas noches",
      "qué tal",
      "¿cómo estás?",
      "gracias",
      "Muchas gracias",
      "ok",
      "vale",
      "perfecto",
      "adiós",
      "hasta luego",
      "test",
      "probando",
    ]) {
      expect(esTurnoTrivial(t), t).toBe(true);
    }
  });

  it("un encargo NUNCA lo es, por corto que sea", () => {
    // dar por trivial un encargo sería quitarle el agente a quien lo pide:
    // es el error caro, y por eso todo lo dudoso cae de este lado
    for (const t of [
      "arregla el botón",
      "añade una sección",
      "quita el footer",
      "hazme una web",
      "crea un index.html",
      "cambia el color a azul",
      "sigue",
      "continúa",
      "revisa el código",
      "explica esto",
      "traduce al inglés",
      "mejora el diseño",
      "pon un menú",
      "https://ejemplo.com",
      "```js\nconsole.log(1)\n```",
      "actualiza index.html",
    ]) {
      expect(esTurnoTrivial(t), t).toBe(false);
    }
  });

  it("un mensaje largo no es un saludo aunque empiece por hola", () => {
    expect(
      esTurnoTrivial("hola, quiero una landing para una cafetería con reservas y galería")
    ).toBe(false);
  });

  it("una pregunta de verdad no es cortesía", () => {
    expect(esTurnoTrivial("por qué falla el despliegue")).toBe(false);
    expect(esTurnoTrivial("cuánto cuesta OpenRouter")).toBe(false);
  });

  it("vacío o solo signos: no se decide nada", () => {
    expect(esTurnoTrivial("")).toBe(false);
    expect(esTurnoTrivial("   ")).toBe(false);
    expect(esTurnoTrivial("!!!")).toBe(false);
  });
});
