/** Prism AI — Catálogo de skills.
 *
 * Instalar desde URL ya funcionaba, y con la puerta de permisos delante. Lo
 * que faltaba no era el mecanismo: era el índice. Aquí se prueba que el índice
 * se valida sin fiarse de él y que la búsqueda hace lo que dice.
 */
import { describe, it, expect } from "vitest";
import {
  parseCatalogo,
  buscarEnCatalogo,
  yaInstalada,
  URL_CATALOGO,
  type EntradaCatalogo,
} from "../../src/lib/prism/catalogo-skills";
import { readFileSync } from "node:fs";

describe("parseCatalogo — no fiarse del índice", () => {
  it("acepta una entrada bien formada", () => {
    const r = parseCatalogo({
      skills: [{ id: "a", name: "Una", description: "d", icon: "🧩", url: "/x.md" }],
    });
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe("Una");
  });

  it("descarta las rotas pero conserva las buenas", () => {
    const r = parseCatalogo({
      skills: [
        { id: "a", name: "Buena", url: "/a.md" },
        { name: "Sin id", url: "/b.md" },
        { id: "c", name: "Sin url" },
        "esto no es un objeto",
        null,
      ],
    });
    expect(r.map((e) => e.id)).toEqual(["a"]);
  });

  it("descarta ids repetidos: el primero manda", () => {
    const r = parseCatalogo({
      skills: [
        { id: "a", name: "Primera", url: "/1.md" },
        { id: "a", name: "Segunda", url: "/2.md" },
      ],
    });
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe("Primera");
  });

  it("filtra los tipos de encargo inventados", () => {
    const r = parseCatalogo({
      skills: [{ id: "a", name: "X", url: "/a.md", kinds: ["web", "magia", 42] }],
    });
    expect(r[0].kinds).toEqual(["web"]);
  });

  it("un índice que no es lo que dice no revienta, devuelve vacío", () => {
    expect(parseCatalogo(null)).toEqual([]);
    expect(parseCatalogo({})).toEqual([]);
    expect(parseCatalogo({ skills: "no es lista" })).toEqual([]);
    expect(parseCatalogo("texto")).toEqual([]);
  });

  it("recorta los textos largos en vez de aceptarlos enteros", () => {
    const r = parseCatalogo({
      skills: [{ id: "a", name: "x".repeat(500), description: "y".repeat(999), url: "/a.md" }],
    });
    expect(r[0].name.length).toBeLessThanOrEqual(60);
    expect(r[0].description.length).toBeLessThanOrEqual(200);
  });
});

describe("buscarEnCatalogo", () => {
  const cat: EntradaCatalogo[] = [
    { id: "1", name: "Revisor de accesibilidad", description: "contraste y foco", icon: "♿", kinds: ["web"], url: "/1.md" },
    { id: "2", name: "Descifrador de errores", description: "stack traces", icon: "🔍", kinds: ["code"], url: "/2.md" },
    { id: "3", name: "Sin tipos", description: "cualquier cosa", icon: "⚡", url: "/3.md" },
  ];

  it("sin filtros los devuelve todos", () => {
    expect(buscarEnCatalogo(cat, "")).toHaveLength(3);
  });

  it("busca en el nombre y en la descripción", () => {
    expect(buscarEnCatalogo(cat, "accesib").map((e) => e.id)).toEqual(["1"]);
    expect(buscarEnCatalogo(cat, "stack").map((e) => e.id)).toEqual(["2"]);
  });

  it("filtra por tipo de encargo, y las que no declaran tipos quedan fuera", () => {
    expect(buscarEnCatalogo(cat, "", "web").map((e) => e.id)).toEqual(["1"]);
    expect(buscarEnCatalogo(cat, "", "data")).toEqual([]);
  });
});

describe("yaInstalada", () => {
  const e: EntradaCatalogo = { id: "1", name: "Revisor de accesibilidad", description: "", icon: "♿", url: "/1.md" };
  it("compara por nombre, que es lo que sobrevive a la instalación", () => {
    expect(yaInstalada(e, ["revisor de accesibilidad"])).toBe(true);
    expect(yaInstalada(e, ["Otra cosa"])).toBe(false);
  });
});

describe("el índice que se publica de verdad", () => {
  // si el JSON del repo se rompe, esto lo caza antes que el usuario
  const crudo = JSON.parse(readFileSync("public/skills/index.json", "utf8"));
  const entradas = parseCatalogo(crudo);

  it("todas sus entradas sobreviven a la validación", () => {
    expect(entradas.length).toBe(crudo.skills.length);
    expect(entradas.length).toBeGreaterThan(0);
  });

  it("cada skill apunta a un archivo que existe de verdad", () => {
    for (const e of entradas) {
      const ruta = "public" + e.url;
      const texto = readFileSync(ruta, "utf8");
      expect(texto.length, `${e.name} tiene contenido`).toBeGreaterThan(200);
      expect(texto.trimStart().startsWith("#"), `${e.name} empieza por un título`).toBe(true);
    }
  });

  it("todas declaran para qué encargo sirven, o no se podrían filtrar", () => {
    for (const e of entradas) expect(e.kinds?.length, e.name).toBeGreaterThan(0);
  });

  it("la URL del catálogo apunta al índice publicado", () => {
    expect(URL_CATALOGO).toBe("/skills/index.json");
  });
});
