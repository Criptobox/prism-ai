import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { TEMPLATES, filterTemplates } from "../../src/lib/prism/templates";
import { readZip } from "../../src/lib/prism/zip";

describe("filterTemplates", () => {
  it("sin query devuelve todo el catálogo", () => {
    expect(filterTemplates(TEMPLATES, "")).toHaveLength(TEMPLATES.length);
  });

  it("filtra por título", () => {
    const r = filterTemplates(TEMPLATES, "modular");
    expect(r.length).toBe(1);
    expect(r[0].title).toMatch(/modular/i);
  });

  it("filtra por teaches (descripción pedagógica)", () => {
    const r = filterTemplates(TEMPLATES, "enlaces relativos");
    expect(r.length).toBeGreaterThanOrEqual(1);
  });

  it("respeta la categoría", () => {
    const r = filterTemplates(TEMPLATES, "", "Demos");
    expect(r.every((t) => t.category === "Demos")).toBe(true);
    expect(r.length).toBe(TEMPLATES.filter((t) => t.category === "Demos").length);
  });

  it("no encuentra nada con un término raro", () => {
    expect(filterTemplates(TEMPLATES, "zzzzzzz")).toEqual([]);
  });
});

describe("TEMPLATES catálogo", () => {
  it("todas las plantillas tienen un zipPath que empieza por /", () => {
    for (const t of TEMPLATES) {
      expect(t.zipPath.startsWith("/")).toBe(true);
      expect(t.zipPath.endsWith(".zip")).toBe(true);
    }
  });

  it("cada plantilla tiene id, título, descripción y teaches no vacíos", () => {
    for (const t of TEMPLATES) {
      expect(t.id.length).toBeGreaterThan(0);
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.teaches.length).toBeGreaterThan(0);
    }
  });

  it("los ids son únicos", () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("fileCount es ≥1", () => {
    for (const t of TEMPLATES) {
      expect(t.fileCount).toBeGreaterThanOrEqual(1);
    }
  });
});

/** El `fileCount` del catálogo se PINTA en la tarjeta («Demos · 5 archivos»),
 *  así que no puede ser una estimación escrita a mano: cuando se escribió
 *  decía 1 y 3 donde el ZIP traía 5 y 8. Esto lo ata al ZIP de verdad, con el
 *  mismo lector que usa el Sandbox, para que no vuelva a desviarse cuando
 *  alguien cambie una demo. */
describe("fileCount dice lo que trae el ZIP de verdad", () => {
  for (const tpl of TEMPLATES) {
    it(`«${tpl.title}» declara los archivos que tiene`, async () => {
      const buf = await readFile(join(process.cwd(), "public", tpl.zipPath));
      const entradas = await readZip(
        buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
      );
      // solo archivos: las entradas de carpeta acaban en «/» y no se cuentan
      const archivos = entradas.filter((e) => !e.path.endsWith("/"));
      expect(archivos.length).toBe(tpl.fileCount);
    });
  }
});
