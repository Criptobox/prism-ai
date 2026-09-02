import { describe, expect, it } from "vitest";
import {
  buscarEnMapa,
  resumenMemoria,
  MAX_RESULTADOS_MEMORIA,
} from "../../src/lib/prism/project-map";
import type { ProjectMap } from "../../src/lib/prism/types";

function mapa(over: Partial<ProjectMap> = {}): ProjectMap {
  return {
    name: "Cafetería Prima",
    description: "Landing de una cafetería de especialidad",
    files: [
      {
        name: "index.html",
        kind: "html",
        summary: "Portada con hero y sección de precios",
        features: ["formulario de contacto"],
        tech: ["Tailwind (CDN)"],
        links: ["estilos.css"],
      },
      { name: "estilos.css", kind: "css", summary: "Paleta y tipografías" },
    ],
    features: ["carrito de la compra"],
    notes: ["paleta cálida, acento violeta", "el gradiente del hero se descartó"],
    updatedAt: 0,
    ...over,
  };
}

describe("buscarEnMapa", () => {
  it("encuentra la decisión guardada en una nota", () => {
    const r = buscarEnMapa(mapa(), "¿qué decidí sobre la paleta?");
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].origen).toBe("nota");
    expect(r[0].texto).toContain("paleta cálida");
  });

  it("las notas del usuario ganan al archivo que menciona lo mismo", () => {
    // «estilos.css» resume «Paleta y tipografías» y hay una nota sobre la
    // paleta: manda lo que decidió el usuario, no lo que dedujo Prism.
    const r = buscarEnMapa(mapa(), "paleta");
    expect(r[0].origen).toBe("nota");
  });

  it("encuentra un archivo por su resumen", () => {
    const r = buscarEnMapa(mapa(), "dónde está la sección de precios");
    expect(r.some((x) => x.origen === "archivo" && x.titulo === "index.html")).toBe(true);
  });

  it("encuentra funcionalidades y tecnologías", () => {
    expect(buscarEnMapa(mapa(), "carrito").some((x) => x.origen === "funcionalidad")).toBe(true);
    expect(buscarEnMapa(mapa(), "tailwind").some((x) => x.origen === "tecnologia")).toBe(true);
  });

  it("ignora las tildes: «cafetería» encuentra «cafeteria»", () => {
    const m = mapa({ notes: ["la cafeteria abre a las 8"] });
    expect(buscarEnMapa(m, "cafetería").length).toBeGreaterThan(0);
  });

  it("no devuelve nada cuando la pregunta es solo palabras de relleno", () => {
    // Sin esto «¿qué hay?» casaba con todo lo que contuviera «que».
    expect(buscarEnMapa(mapa(), "¿qué hay?")).toEqual([]);
  });

  it("no inventa resultados: sin coincidencia, lista vacía", () => {
    expect(buscarEnMapa(mapa(), "criptomonedas")).toEqual([]);
  });

  it("sin mapa devuelve lista vacía en vez de lanzar", () => {
    expect(buscarEnMapa(null, "paleta")).toEqual([]);
    expect(buscarEnMapa(undefined, "paleta")).toEqual([]);
  });

  it("respeta el límite y su tope duro", () => {
    const notes = Array.from({ length: 40 }, (_, i) => `nota ${i} sobre la paleta`);
    expect(buscarEnMapa(mapa({ notes }), "paleta").length).toBe(MAX_RESULTADOS_MEMORIA);
    expect(buscarEnMapa(mapa({ notes }), "paleta", 3).length).toBe(3);
    // el tope duro es 20 aunque se pida más
    expect(buscarEnMapa(mapa({ notes }), "paleta", 999).length).toBe(20);
  });
});

describe("resumenMemoria", () => {
  it("cuando no hay nada lo dice sin fingir que buscó mal", () => {
    const txt = resumenMemoria([], "criptomonedas");
    expect(txt).toContain("No hay nada en el mapa del proyecto sobre «criptomonedas»");
  });

  it("etiqueta el origen de cada resultado", () => {
    const txt = resumenMemoria(buscarEnMapa(mapa(), "paleta"), "paleta");
    expect(txt).toContain("Nota de memoria (decisión del usuario)");
  });
});
