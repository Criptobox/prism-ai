import { describe, it, expect } from "vitest";
import { diffLines, fileDiff, toHunks, wholeFileDiff } from "../../src/lib/prism/diff";

const texto = (...l: string[]) => l.join("\n") + "\n";

describe("diffLines", () => {
  it("dos textos iguales son todo «igual»", () => {
    const d = diffLines(texto("a", "b", "c"), texto("a", "b", "c"));
    expect(d.map((l) => l.op)).toEqual(["igual", "igual", "igual"]);
  });

  it("detecta una línea añadida y numera bien ambos lados", () => {
    const d = diffLines(texto("a", "c"), texto("a", "b", "c"));
    expect(d.map((l) => l.op)).toEqual(["igual", "mas", "igual"]);
    const nueva = d[1];
    expect(nueva.text).toBe("b");
    expect(nueva.antes).toBeNull();
    expect(nueva.despues).toBe(2);
    expect(d[2]).toMatchObject({ antes: 2, despues: 3 });
  });

  it("detecta una línea borrada", () => {
    const d = diffLines(texto("a", "b", "c"), texto("a", "c"));
    expect(d.map((l) => l.op)).toEqual(["igual", "menos", "igual"]);
    expect(d[1]).toMatchObject({ text: "b", antes: 2, despues: null });
  });

  it("una línea modificada sale como borrada + añadida", () => {
    const d = diffLines(texto("a", "viejo", "c"), texto("a", "nuevo", "c"));
    expect(d.map((l) => l.op)).toEqual(["igual", "menos", "mas", "igual"]);
  });

  it("de vacío a contenido es todo añadido, y al revés todo borrado", () => {
    expect(diffLines("", texto("a", "b")).map((l) => l.op)).toEqual(["mas", "mas"]);
    expect(diffLines(texto("a", "b"), "").map((l) => l.op)).toEqual(["menos", "menos"]);
  });

  it("el salto de línea final no inventa una línea vacía", () => {
    expect(diffLines("a\n", "a\n")).toHaveLength(1);
    expect(diffLines("a", "a\n")).toHaveLength(1);
  });

  it("reconstruye ambos textos a partir del diff", () => {
    const a = texto("uno", "dos", "tres", "cuatro");
    const b = texto("uno", "DOS", "tres", "cinco", "cuatro");
    const d = diffLines(a, b);
    const rehechoA = d.filter((l) => l.op !== "mas").map((l) => l.text).join("\n") + "\n";
    const rehechoB = d.filter((l) => l.op !== "menos").map((l) => l.text).join("\n") + "\n";
    expect(rehechoA).toBe(a);
    expect(rehechoB).toBe(b);
  });
});

describe("toHunks", () => {
  it("descarta el contexto lejano y agrupa los cambios", () => {
    const antes = texto(...Array.from({ length: 40 }, (_, i) => `linea ${i}`));
    const despues = antes.replace("linea 20", "linea 20 CAMBIADA");
    const hunks = toHunks(diffLines(antes, despues));
    expect(hunks).toHaveLength(1);
    // 3 de contexto por lado + la borrada + la añadida
    expect(hunks[0].lines.length).toBeLessThanOrEqual(9);
    expect(hunks[0].lines.some((l) => l.text.includes("CAMBIADA"))).toBe(true);
  });

  it("dos cambios lejanos dan dos bloques", () => {
    const antes = texto(...Array.from({ length: 60 }, (_, i) => `l${i}`));
    const despues = antes.replace("l5", "l5 X").replace("l50", "l50 Y");
    expect(toHunks(diffLines(antes, despues))).toHaveLength(2);
  });

  it("sin cambios no hay bloques", () => {
    expect(toHunks(diffLines(texto("a", "b"), texto("a", "b")))).toHaveLength(0);
  });
});

describe("fileDiff", () => {
  it("marca «sin cambios» cuando el texto es idéntico", () => {
    const d = fileDiff("a.js", texto("x"), texto("x"));
    expect(d.unchanged).toBe(true);
    expect(d.hunks).toHaveLength(0);
  });

  it("cuenta las líneas añadidas y borradas", () => {
    const d = fileDiff("a.js", texto("a", "b"), texto("a", "b2", "c"));
    expect(d.added).toBe(2);
    expect(d.removed).toBe(1);
    expect(d.unchanged).toBe(false);
  });

  it("un archivo enorme se marca y no se difiere en detalle", () => {
    const grande = texto(...Array.from({ length: 5000 }, (_, i) => `l${i}`));
    const d = fileDiff("generado.js", grande, grande + "extra\n");
    expect(d.tooBig).toBe(true);
    expect(d.hunks).toHaveLength(0);
  });
});

describe("wholeFileDiff", () => {
  it("un archivo nuevo sale entero como añadido", () => {
    const d = wholeFileDiff("nuevo.js", texto("a", "b"), "nuevo");
    expect(d.added).toBe(2);
    expect(d.removed).toBe(0);
  });
  it("un archivo borrado sale entero como quitado", () => {
    const d = wholeFileDiff("viejo.js", texto("a", "b"), "borrado");
    expect(d.removed).toBe(2);
    expect(d.added).toBe(0);
  });
});
