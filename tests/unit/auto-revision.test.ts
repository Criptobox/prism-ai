/** Prism AI — Que el agente pruebe su propio código.
 *
 * `PLAN-V4` §3 lo pedía y se hizo a medias: el agente ejecuta el proyecto
 * cuando el modelo soporta `tools`, pero **la mayoría de los gratis no las
 * soportan**. Esos van por el camino XML y entregaban código sin comprobarlo,
 * o sea que el arreglo llegaba justo a los modelos para los que Prism no
 * existe.
 */
import { describe, it, expect } from "vitest";
import {
  proyectoDeLaRespuesta,
  hayQueCorregir,
  promptDeCorreccion,
  resumenRevision,
  reglaDeFallo,
  esErrorDelEntorno,
  erroresDelModelo,
  MAX_REVISIONES,
} from "../../src/lib/prism/auto-revision";
import type { RunOutcome } from "../../src/lib/prism/tool-runner";

const F = "```";
const salida = (o: Partial<RunOutcome> = {}): RunOutcome => ({
  ok: true,
  ejecutado: true,
  logs: 0,
  errors: 0,
  logLines: [],
  errorLines: [],
  ...o,
});

describe("proyectoDeLaRespuesta", () => {
  it("saca los archivos de una respuesta con HTML", () => {
    const p = proyectoDeLaRespuesta(
      `Aquí va:\n\n${F}html\n<!DOCTYPE html><html><body>hola</body></html>\n${F}`
    );
    expect(p).not.toBeNull();
    expect(p!.entry).toMatch(/\.html?$/);
    expect(Object.keys(p!.files)).toHaveLength(1);
  });

  it("recoge también el CSS y el JS que acompañan", () => {
    const p = proyectoDeLaRespuesta(
      [
        `${F}html`,
        '<!DOCTYPE html><html><head><link rel="stylesheet" href="styles.css"></head><body></body></html>',
        F,
        `${F}css`,
        "body{margin:0}",
        F,
        `${F}js`,
        "console.log(1)",
        F,
      ].join("\n")
    );
    expect(Object.keys(p!.files).length).toBeGreaterThanOrEqual(3);
  });

  /* Sin HTML no hay nada que abrir en un iframe. Fingir que se revisa sería
   * peor que no revisar: daría un visto bueno que no se ha comprobado. */
  it("sin un HTML de entrada NO se revisa", () => {
    expect(proyectoDeLaRespuesta(`${F}css\nbody{margin:0}\n${F}`)).toBeNull();
    expect(proyectoDeLaRespuesta(`${F}python\nprint(1)\n${F}`)).toBeNull();
  });

  it("una respuesta sin código no se revisa", () => {
    expect(proyectoDeLaRespuesta("Hola, ¿en qué te ayudo?")).toBeNull();
    expect(proyectoDeLaRespuesta("")).toBeNull();
  });
});

describe("hayQueCorregir", () => {
  it("con errores de consola, sí", () => {
    expect(hayQueCorregir(salida({ errors: 2, errorLines: ["x is not defined"] }))).toBe(true);
  });

  it("sin errores, no se le da la lata al modelo", () => {
    expect(hayQueCorregir(salida())).toBe(false);
  });

  /* Si no se pudo ni ejecutar, el problema es nuestro (no había entry, el
   * iframe falló). Mandarle al modelo a «corregir» eso es hacerle perseguir
   * un fallo que no es suyo. */
  it("si no se pudo ejecutar, NO se le echa la culpa al modelo", () => {
    expect(hayQueCorregir(salida({ ok: false, ejecutado: false, reason: "sin archivos" }))).toBe(false);
  });
});

describe("promptDeCorreccion", () => {
  const r = salida({
    errors: 2,
    errorLines: ["Uncaught ReferenceError: cuenta is not defined", "TypeError: null"],
    logLines: ["cargando"],
  });

  it("le da el error TAL CUAL, que es el dato", () => {
    const p = promptDeCorreccion(r, "index.html");
    expect(p).toContain("Uncaught ReferenceError: cuenta is not defined");
  });

  it("pide el archivo COMPLETO: un parche suelto rompe la vista previa", () => {
    const p = promptDeCorreccion(r, "index.html");
    expect(p).toContain("index.html");
    expect(p).toMatch(/completo/i);
  });

  it("le dice que arregle, no que explique", () => {
    expect(promptDeCorreccion(r, "index.html")).toMatch(/no expliques el error/i);
  });
});

describe("resumenRevision", () => {
  it("dice lo que devolvió la ejecución, sin adornos", () => {
    expect(resumenRevision(salida({ errors: 1, errorLines: ["x"] }))).toContain("1 error");
    expect(resumenRevision(salida())).toContain("sin errores");
    expect(resumenRevision(salida({ qaFindings: 3 }))).toContain("3 avisos");
  });
  it("si no se pudo ejecutar, lo dice con el motivo del runner", () => {
    expect(resumenRevision(salida({ ok: false, ejecutado: false, reason: "El proyecto no tiene archivos." }))).toBe(
      "El proyecto no tiene archivos."
    );
  });
});

describe("reglaDeFallo", () => {
  it("solo se apunta lo verificable: esto salió de EJECUTAR el código", () => {
    const r = reglaDeFallo(salida({ errors: 1, errorLines: ["cuenta is not defined"] }));
    expect(r).not.toBeNull();
    expect(r!.titulo).toContain("cuenta is not defined");
  });
  it("sin errores no se apunta nada", () => {
    expect(reglaDeFallo(salida())).toBeNull();
    expect(reglaDeFallo(salida({ ok: false, ejecutado: false }))).toBeNull();
  });
});

describe("el tope", () => {
  it("son dos rondas: a la tercera el modelo suele dar vueltas y gastar cuota", () => {
    expect(MAX_REVISIONES).toBe(2);
  });
});

/* ------------------------------------------------------------------ */
/* Errores que NO son del modelo                                       */
/* ------------------------------------------------------------------ */

describe("el sandbox propio no se le factura al modelo", () => {
  /* La vista previa corre sin `allow-same-origin` para que el proyecto no
   * pueda tocar la app. El precio: el navegador prohíbe localStorage ahí
   * dentro. Y una página generada lo usa constantemente —una lista que se
   * guarda, un contador que persiste—, así que sin este filtro Prism le diría
   * al modelo «tu código lanza un error» y le haría arreglar código correcto. */
  const SANDBOX =
    "Uncaught SecurityError: Failed to read the 'localStorage' property from 'Window': The document is sandboxed and lacks the 'allow-same-origin' flag.";

  it("reconoce el error del sandbox como nuestro", () => {
    expect(esErrorDelEntorno(SANDBOX)).toBe(true);
    expect(esErrorDelEntorno("Uncaught ReferenceError: sumar is not defined")).toBe(false);
  });

  it("una página que solo choca con el sandbox NO se manda a corregir", () => {
    const r = salida({ errors: 1, errorLines: [SANDBOX] });
    expect(hayQueCorregir(r)).toBe(false);
    expect(resumenRevision(r)).toContain("sin errores");
  });

  it("pero un error de verdad sigue contando, aunque venga acompañado", () => {
    const r = salida({
      errors: 2,
      errorLines: [SANDBOX, "Uncaught ReferenceError: sumar is not defined"],
    });
    expect(hayQueCorregir(r)).toBe(true);
    expect(erroresDelModelo(r)).toEqual(["Uncaught ReferenceError: sumar is not defined"]);
    // y al modelo solo le llega el suyo
    const p = promptDeCorreccion(r, "index.html");
    expect(p).toContain("sumar is not defined");
    expect(p, "no se le enseña un error que no es suyo").not.toContain("allow-same-origin");
    expect(p, "y el recuento es de los suyos").toContain("1 error");
  });
});
