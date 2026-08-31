/** Prism AI — Pulsar los botones de lo que genera el agente.
 *
 * Lo delicado no es pulsar: es qué se puede AFIRMAR después. «Este botón no
 * funciona» es indecidible —un «Cancelar» que cierra algo ya cerrado no hace
 * nada visible y está perfecto—, así que estos tests fijan la frontera entre
 * lo que se reporta como fallo y lo que se reporta como dato.
 */
import { describe, it, expect } from "vitest";
import {
  botonesRotos,
  botonesSinEfecto,
  hayBotonesQueCorregir,
  promptDeBotones,
  resumenBotones,
  reglaDeBotones,
  MAX_BOTONES,
  type InformeBotones,
} from "../../src/lib/prism/prueba-botones";

const inf = (o: Partial<InformeBotones> = {}): InformeBotones => ({
  hecho: true,
  resultados: [],
  total: 0,
  ...o,
});

const roto = (rotulo: string, error: string) => ({ rotulo, ok: false, error, cambio: false });
const bien = (rotulo: string) => ({ rotulo, ok: true, cambio: true });
const mudo = (rotulo: string) => ({ rotulo, ok: true, cambio: false });

describe("qué cuenta como fallo", () => {
  it("un botón que lanza un error al pulsarlo, sí", () => {
    const i = inf({ resultados: [roto("Sumar", "cuenta is not defined")], total: 1 });
    expect(botonesRotos(i)).toHaveLength(1);
    expect(hayBotonesQueCorregir(i)).toBe(true);
  });

  /* Esta es la regla que evita acusar en falso. Un botón puede no hacer nada
   * visible y estar bien; decir que está roto sería inventarse un veredicto. */
  it("un botón que no cambia nada NO se le manda al modelo", () => {
    const i = inf({ resultados: [mudo("Cancelar")], total: 1 });
    expect(botonesSinEfecto(i)).toHaveLength(1);
    expect(hayBotonesQueCorregir(i), "no se le hace perseguir un fallo que puede no existir").toBe(
      false
    );
  });

  it("si el barrido no se pudo hacer, no se concluye nada", () => {
    expect(hayBotonesQueCorregir(inf({ hecho: false, motivo: "no respondió" }))).toBe(false);
  });

  it("una página sin botones no es un fallo", () => {
    expect(hayBotonesQueCorregir(inf())).toBe(false);
  });
});

describe("promptDeBotones", () => {
  const i = inf({
    resultados: [roto("Sumar", "cuenta is not defined"), bien("Reiniciar")],
    total: 2,
  });

  it("nombra el botón y da el error tal cual", () => {
    const p = promptDeBotones(i, "index.html");
    expect(p).toContain("«Sumar»");
    expect(p).toContain("cuenta is not defined");
  });

  it("no menciona los que funcionaron", () => {
    expect(promptDeBotones(i, "index.html")).not.toContain("Reiniciar");
  });

  it("pide el archivo completo y que arregle, no que explique", () => {
    const p = promptDeBotones(i, "index.html");
    expect(p).toContain("index.html");
    expect(p).toMatch(/completo/i);
    expect(p).toMatch(/no expliques/i);
  });
});

describe("resumenBotones — sin veredictos sobre lo que no se sabe", () => {
  it("con errores, los cuenta", () => {
    expect(resumenBotones(inf({ resultados: [roto("A", "x"), bien("B")], total: 2 }))).toContain(
      "1 de 2"
    );
  });

  it("los mudos se enseñan como algo que MIRAR, no como un fallo", () => {
    const t = resumenBotones(inf({ resultados: [mudo("A"), bien("B")], total: 2 }));
    expect(t).toContain("no cambiaron nada visible");
    expect(t).toMatch(/puede ser correcto/i);
  });

  it("todo bien se dice sin adornos", () => {
    expect(resumenBotones(inf({ resultados: [bien("A")], total: 1 }))).toContain("todos hicieron algo");
  });

  it("si se pulsaron menos de los que había, se dice cuántos había", () => {
    expect(resumenBotones(inf({ resultados: [bien("A")], total: 20 }))).toContain("(de 20)");
  });

  it("sin botones, lo dice; sin barrido, da el motivo", () => {
    expect(resumenBotones(inf())).toContain("no tiene botones");
    expect(resumenBotones(inf({ hecho: false, motivo: "El proyecto no respondió." }))).toBe(
      "El proyecto no respondió."
    );
  });
});

describe("reglaDeBotones", () => {
  it("solo se apunta lo verificado pulsando", () => {
    const r = reglaDeBotones(inf({ resultados: [roto("Sumar", "cuenta is not defined")], total: 1 }));
    expect(r!.titulo).toContain("Sumar");
    expect(reglaDeBotones(inf({ resultados: [mudo("A")], total: 1 }))).toBeNull();
  });
});

describe("los topes", () => {
  it("se pulsan como mucho 10: con más, el orden contamina el resultado", () => {
    expect(MAX_BOTONES).toBe(10);
  });
});
