/** Prism AI — Respuestas cortadas a mitad del código.
 *
 * El síntoma que reportó el usuario: «cuando es largo el código de una web se
 * detienen los modelos y lo dejan a medias». Prism lo daba por respuesta
 * completa, la vista previa recibía HTML sin cerrar y no cargaba.
 */
import { describe, it, expect } from "vitest";
import {
  respuestaCortada,
  continuarCodigoPrompt,
  unirContinuacion,
} from "../../src/lib/prism/continuar";

const F = "```";

describe("respuestaCortada", () => {
  it("una cerca abierta y sin cerrar es un corte", () => {
    const c = `Aquí tienes tu web:\n\n${F}html\n<!DOCTYPE html>\n<html>\n<body>\n<div class="ca`;
    const info = respuestaCortada(c);
    expect(info.cortada).toBe(true);
    expect(info.motivo).toBe("cerca-abierta");
    expect(info.lang).toBe("html");
    expect(info.cola, "la cola sirve para empalmar").toContain("<div class=\"ca");
  });

  it("un bloque cerrado y un documento completo NO es un corte", () => {
    const c = `Listo:\n\n${F}html\n<!DOCTYPE html>\n<html><body>Hola</body></html>\n${F}\n\n¿Algo más?`;
    expect(respuestaCortada(c).cortada).toBe(false);
  });

  it("cerca cerrada pero el documento sin </html> también es un corte", () => {
    const c = `${F}html\n<!DOCTYPE html>\n<html>\n<body>\n<p>a medias</p>\n${F}`;
    const info = respuestaCortada(c);
    expect(info.cortada).toBe(true);
    expect(info.motivo).toBe("html-sin-cerrar");
  });

  it("texto normal sin código no se toca", () => {
    expect(respuestaCortada("Hola, ¿en qué te ayudo?").cortada).toBe(false);
    expect(respuestaCortada("").cortada).toBe(false);
  });

  it("dos bloques cerrados siguen sin ser corte", () => {
    const c = `${F}css\nbody{margin:0}\n${F}\ny ahora el js:\n${F}js\nconsole.log(1)\n${F}`;
    expect(respuestaCortada(c).cortada).toBe(false);
  });

  it("un fragmento suelto sin <html> no se confunde con un documento cortado", () => {
    const c = `${F}html\n<div class="card">hola</div>\n${F}`;
    expect(respuestaCortada(c).cortada).toBe(false);
  });
});

describe("continuarCodigoPrompt", () => {
  it("le prohíbe repetir y reabrir la cerca", () => {
    const p = continuarCodigoPrompt(respuestaCortada(`${F}html\n<html>\n<body>\n<p>x`));
    expect(p).toContain("NO repitas");
    expect(p).toContain("NO abras un bloque de código nuevo");
    expect(p, "le enseña dónde se quedó").toContain("<p>x");
  });
});

describe("unirContinuacion", () => {
  it("quita la cerca que el modelo reabre", () => {
    const previo = `${F}html\n<html>\n<body>\n`;
    expect(unirContinuacion(previo, `${F}html\n<p>sigo</p>\n`)).toBe(
      `${F}html\n<html>\n<body>\n<p>sigo</p>\n`
    );
  });

  it("no duplica el trozo que el modelo repite", () => {
    const previo = "<html>\n<body>\n<h1>Título de la página</h1>\n";
    const nuevo = "<h1>Título de la página</h1>\n<p>y el resto</p>";
    expect(unirContinuacion(previo, nuevo)).toBe(
      "<html>\n<body>\n<h1>Título de la página</h1>\n<p>y el resto</p>"
    );
  });

  it("empalma en el punto exacto, sin meter espacios", () => {
    expect(unirContinuacion("<div class=\"ca", "rd\">hola</div>")).toBe(
      "<div class=\"card\">hola</div>"
    );
  });

  it("quita el preámbulo de cortesía", () => {
    expect(unirContinuacion("<p>", "Claro, continúo:\n</p>")).toBe("<p></p>");
  });

  it("una continuación vacía deja el original intacto", () => {
    expect(unirContinuacion("<p>algo", "   ")).toBe("<p>algo");
  });

  it("el resultado de coser un corte real ya no está cortado", () => {
    const previo = `${F}html\n<!DOCTYPE html>\n<html>\n<body>\n<div class="ca`;
    const unido = unirContinuacion(previo, `rd">hola</div>\n</body>\n</html>\n${F}`);
    expect(respuestaCortada(unido).cortada, "queda entero").toBe(false);
  });
});
