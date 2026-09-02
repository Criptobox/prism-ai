import { describe, expect, it } from "vitest";
import {
  esRuido,
  zipATexto,
  resumenZip,
  MAX_CHARS_ARCHIVO,
  type EntradaZip,
} from "../../src/lib/prism/zip-a-texto";

const txt = (path: string, text: string): EntradaZip => ({ path, size: text.length, text });
const bin = (path: string, size = 1000): EntradaZip => ({ path, size, text: null });

describe("esRuido", () => {
  it("dependencias, lockfiles y minificados", () => {
    expect(esRuido("node_modules/react/index.js")).toBe(true);
    expect(esRuido("app/dist/bundle.js")).toBe(true);
    expect(esRuido("package-lock.json")).toBe(true);
    expect(esRuido("web/styles.min.css")).toBe(true);
    expect(esRuido("app.js.map")).toBe(true);
  });

  it("el código de verdad NO es ruido", () => {
    expect(esRuido("src/app.js")).toBe(false);
    expect(esRuido("index.html")).toBe(false);
    expect(esRuido("package.json")).toBe(false);
  });
});

describe("zipATexto", () => {
  it("el índice sale ENTERO aunque el contenido no quepa", () => {
    // el modelo tiene que conocer la forma del proyecto aunque no haya leído
    // cada archivo: si no, opina sobre algo que no ha visto
    const entradas = [txt("a.js", "x".repeat(50_000)), txt("b.js", "y".repeat(50_000))];
    const r = zipATexto("p.zip", entradas, 20_000);
    expect(r.texto).toContain("a.js");
    expect(r.texto).toContain("b.js");
    expect(r.texto).toContain("Índice completo");
  });

  it("dice lo que NO viaja, con nombre y motivo", () => {
    const entradas = [
      txt("index.html", "<h1>hola</h1>"),
      txt("gordo.js", "z".repeat(40_000)),
      bin("logo.png"),
      txt("node_modules/x/i.js", "ruido"),
    ];
    const r = zipATexto("p.zip", entradas, 5_000);
    expect(r.texto).toContain("Lo que NO viaja en este mensaje");
    expect(r.texto).toContain("logo.png");
    expect(r.binarios).toEqual(["logo.png"]);
    expect(r.ruido).toEqual(["node_modules/x/i.js"]);
    // el ruido no se cuenta como archivo leído
    expect(r.incluidos).not.toContain("node_modules/x/i.js");
  });

  it("respeta el techo total", () => {
    const entradas = Array.from({ length: 30 }, (_, i) => txt(`f${i}.js`, "a".repeat(5_000)));
    const r = zipATexto("p.zip", entradas, 20_000);
    expect(r.chars).toBeLessThanOrEqual(21_000); // el índice cabe además del techo
    expect(r.fuera.length).toBeGreaterThan(0);
  });

  it("un archivo enorme se recorta y se DICE cuánto falta", () => {
    const r = zipATexto("p.zip", [txt("a.js", "a".repeat(MAX_CHARS_ARCHIVO + 5_000))]);
    expect(r.recortados).toEqual(["a.js"]);
    expect(r.texto).toMatch(/recortado: \d+ caracteres más/);
  });

  it("lo que describe el proyecto entra primero", () => {
    const entradas = [
      txt("zzz/otro.js", "otro"),
      txt("README.md", "es el readme"),
      txt("package.json", "{}"),
    ];
    const r = zipATexto("p.zip", entradas);
    const posReadme = r.texto.indexOf("## README.md");
    const posOtro = r.texto.indexOf("## zzz/otro.js");
    expect(posReadme).toBeGreaterThan(-1);
    expect(posReadme).toBeLessThan(posOtro);
  });

  it("un ZIP solo de binarios no miente: lo dice", () => {
    const r = zipATexto("fotos.zip", [bin("a.png"), bin("b.jpg")]);
    expect(r.incluidos).toEqual([]);
    expect(r.binarios).toEqual(["a.png", "b.jpg"]);
    expect(r.texto).toContain("no legibles como texto");
  });
});

describe("resumenZip", () => {
  it("cuenta lo leído y lo que faltó", () => {
    const r = zipATexto("p.zip", [txt("a.js", "hola"), bin("b.png")]);
    expect(resumenZip(r)).toContain("1 archivo(s) leídos");
    expect(resumenZip(r)).toContain("1 no son texto");
  });
});
