import { describe, it, expect } from "vitest";
import { chunkFiles, shouldIgnore, type GhItem } from "../../src/lib/prism/github-upload";

describe("shouldIgnore", () => {
  it("deja fuera los .env con valores reales", () => {
    for (const p of [".env", ".env.local", ".env.production", "app/.env", "app/.env.local"]) {
      expect(shouldIgnore(p), p).toBe(true);
    }
  });

  it("SÍ sube las plantillas de entorno: son las que hay que publicar", () => {
    for (const p of [
      ".env.example",
      ".env.sample",
      ".env.template",
      "app/.env.example",
      "config/.env.sample",
    ]) {
      expect(shouldIgnore(p), p).toBe(false);
    }
  });

  it("deja fuera carpetas generadas y basura del sistema", () => {
    for (const p of [
      "node_modules/react/index.js",
      ".next/build.js",
      "dist/app.js",
      "coverage/lcov.info",
      ".DS_Store",
      "sub/Thumbs.db",
      "salida.log",
      "paquete.zip",
    ]) {
      expect(shouldIgnore(p), p).toBe(true);
    }
  });

  it("no confunde nombres que solo se parecen", () => {
    for (const p of ["environment.ts", "src/env.ts", "docs/node_modules.md", "logica.ts"]) {
      expect(shouldIgnore(p), p).toBe(false);
    }
  });
});

describe("chunkFiles", () => {
  const item = (name: string, size: number): GhItem => ({
    path: name,
    file: { size } as File,
  });

  it("agrupa respetando el número máximo por lote", () => {
    const items = Array.from({ length: 7 }, (_, i) => item(`a${i}.txt`, 10));
    expect(chunkFiles(items, 3, 1_000_000).map((b) => b.length)).toEqual([3, 3, 1]);
  });

  it("corta también por peso total", () => {
    const items = [item("a", 600), item("b", 600), item("c", 100)];
    expect(chunkFiles(items, 100, 1000).map((b) => b.length)).toEqual([1, 2]);
  });

  it("un archivo mayor que el lote va solo, no se pierde", () => {
    const items = [item("grande", 5000), item("pequeño", 10)];
    const lotes = chunkFiles(items, 100, 1000);
    expect(lotes.flat().map((i) => i.path)).toEqual(["grande", "pequeño"]);
  });

  it("sin archivos no hay lotes", () => {
    expect(chunkFiles([], 10, 100)).toEqual([]);
  });
});
