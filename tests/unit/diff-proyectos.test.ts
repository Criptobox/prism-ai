import { describe, it, expect } from "vitest";
import {
  compararProyectos,
  resumenProyectos,
  MAX_ARCHIVOS_RESUMEN,
} from "../../src/lib/prism/diff-proyectos";

describe("compararProyectos", () => {
  it("no ve diferencias entre dos estados idénticos", () => {
    const a = { "index.html": "<h1>Hola</h1>\n", "app.js": "console.log(1)\n" };
    const d = compararProyectos(a, { ...a });
    expect(d.cambios).toEqual([]);
    expect(d.iguales).toBe(2);
    expect(d.totalAdded).toBe(0);
    expect(d.totalRemoved).toBe(0);
  });

  it("cuenta archivo nuevo, borrado y modificado por separado", () => {
    const antes = { "a.txt": "1\n2\n3\n", "viejo.txt": "x\n" };
    const despues = { "a.txt": "1\n2\n3\n4\n", "nuevo.txt": "hola\n" };
    const d = compararProyectos(antes, despues);
    expect(d.nuevos).toBe(1);
    expect(d.borrados).toBe(1);
    expect(d.modificados).toBe(1);
    const porPath = Object.fromEntries(d.cambios.map((c) => [c.path, c]));
    expect(porPath["a.txt"]).toMatchObject({ estado: "modificado", added: 1, removed: 0 });
    expect(porPath["nuevo.txt"]).toMatchObject({ estado: "nuevo", added: 1, removed: 0 });
    expect(porPath["viejo.txt"]).toMatchObject({ estado: "borrado", added: 0, removed: 1 });
  });

  it("un archivo VACÍO que aparece se reporta como nuevo, no como «sin tocar»", () => {
    // `fileDiff("", "")` dice «sin cambios», pero aparecer SÍ es un cambio.
    const d = compararProyectos({}, { "vacio.txt": "" });
    expect(d.nuevos).toBe(1);
    expect(d.cambios[0]).toMatchObject({ path: "vacio.txt", estado: "nuevo", added: 0, removed: 0 });
    expect(d.iguales).toBe(0);
  });

  it("ordena por volumen de cambio, no por nombre", () => {
    const antes = { "a.txt": "1\n", "z.txt": "1\n" };
    const despues = { "a.txt": "1\n2\n", "z.txt": "1\n2\n3\n4\n5\n" };
    const d = compararProyectos(antes, despues);
    expect(d.cambios.map((c) => c.path)).toEqual(["z.txt", "a.txt"]);
  });

  it("suma los totales de líneas", () => {
    const d = compararProyectos({ "a.txt": "1\n2\n3\n" }, { "a.txt": "9\n" });
    expect(d.totalAdded).toBe(1);
    expect(d.totalRemoved).toBe(3);
  });
});

describe("resumenProyectos", () => {
  it("dice explícitamente qué se compara con qué", () => {
    const d = compararProyectos({ "a.txt": "1\n" }, { "a.txt": "2\n" });
    const txt = resumenProyectos(d, "s1 («inicio»)", "el proyecto actual");
    expect(txt).toContain("s1 («inicio») → el proyecto actual");
  });

  it("cuando no hay diferencias lo dice, sin listar nada", () => {
    const d = compararProyectos({ "a.txt": "1\n" }, { "a.txt": "1\n" });
    const txt = resumenProyectos(d, "s1", "s2");
    expect(txt).toContain("Sin diferencias");
    expect(txt).not.toContain("Total:");
  });

  it("recorta la lista larga y dice cuántos faltan", () => {
    const antes: Record<string, string> = {};
    const despues: Record<string, string> = {};
    for (let i = 0; i < MAX_ARCHIVOS_RESUMEN + 3; i++) {
      antes[`f${i}.txt`] = "a\n";
      despues[`f${i}.txt`] = "b\n";
    }
    const txt = resumenProyectos(compararProyectos(antes, despues), "s1", "s2");
    expect(txt).toContain("y 3 archivo(s) más");
  });

  it("no inventa un diff detallado de un archivo demasiado grande", () => {
    const grande = Array.from({ length: 5000 }, (_, i) => `l${i}`).join("\n");
    const d = compararProyectos({ "big.txt": grande }, { "big.txt": grande + "\nextra" });
    const txt = resumenProyectos(d, "s1", "s2");
    expect(d.cambios[0].tooBig).toBe(true);
    expect(txt).toContain("demasiado grande para el detalle");
  });
});
