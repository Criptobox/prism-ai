import { describe, it, expect } from "vitest";
import { createReviewer, reviewProject, type ReviewFile } from "../../src/lib/prism/sandbox-review";

function repoDe(n: number): ReviewFile[] {
  const out: ReviewFile[] = [];
  for (let i = 0; i < n; i++) {
    const cuerpo = Array.from({ length: 60 }, (_, l) =>
      `  const v${l} = compute(${l}, "texto de relleno ${i}-${l}"); // comentario`
    ).join("\n");
    const text = `import { compute } from "../util.js";\nexport function f${i}() {\n${cuerpo}\n}\n`;
    out.push({ path: `src/mod${Math.floor(i / 20)}/archivo${i}.js`, text, size: text.length });
  }
  out.push({ path: "src/util.js", text: "export const compute = (a, b) => b;", size: 34 });
  out.push({ path: "index.html", text: '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="w"><title>t</title></head><body></body></html>', size: 130 });
  return out;
}

describe("revisión incremental", () => {
  it("el informe incremental es idéntico al de una pasada completa", () => {
    const files = repoDe(60);
    const r = createReviewer();
    expect(r.review(files)).toEqual(reviewProject(files));
    // y tras editar un archivo, también
    const editados = files.map((f, i) =>
      i === 3 ? { ...f, text: `${f.text}\nconst k = "AKIAIOSFODNN7EXAMPLE";` } : f
    );
    expect(r.review(editados)).toEqual(reviewProject(editados));
  });

  it("al editar un archivo solo reanaliza ese archivo", () => {
    const files = repoDe(300);
    const r = createReviewer();
    r.review(files);
    expect(r.lastAnalyzed).toBe(files.length);
    const editados = files.map((f, i) => (i === 7 ? { ...f, text: `${f.text}\n// tocado` } : f));
    r.review(editados);
    expect(r.lastAnalyzed).toBe(1);
  });

  it("si cambia el conjunto de rutas se rehace todo (los enlaces dependen de él)", () => {
    const files = repoDe(50);
    const r = createReviewer();
    r.review(files);
    r.review([...files, { path: "nuevo.js", text: "export const x = 1;", size: 19 }]);
    expect(r.lastAnalyzed).toBe(files.length + 1);
  });

  it("borrar un archivo lo saca de la caché", () => {
    const files = repoDe(20);
    const r = createReviewer();
    r.review(files);
    const menos = files.slice(0, 10);
    const rep = r.review(menos);
    expect(rep.total).toBe(10);
  });

  for (const n of [800, 1500]) {
    it(`${n} archivos: la edición baja de cientos de ms a casi nada`, () => {
      const files = repoDe(n);
      const t0 = performance.now();
      reviewProject(files);
      const completo = performance.now() - t0;

      const r = createReviewer();
      r.review(files); // primera pasada, inevitable
      const editados = files.map((f, i) => (i === 5 ? { ...f, text: `${f.text}\n// x` } : f));
      const t1 = performance.now();
      r.review(editados);
      const incremental = performance.now() - t1;

      console.log(
        `${n} archivos → completo ${Math.round(completo)} ms · incremental ${incremental.toFixed(1)} ms · ${Math.round(completo / Math.max(incremental, 0.01))}× más rápido`
      );
      expect(incremental).toBeLessThan(completo / 4);
    });
  }
});
