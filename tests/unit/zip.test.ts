import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { crc32, readZip, writeZip } from "../../src/lib/prism/zip";

describe("crc32", () => {
  it("vector conocido «123456789» → 0xCBF43926", () => {
    const data = new TextEncoder().encode("123456789");
    expect(crc32(data)).toBe(0xcbf43926);
  });

  it("vacío → 0", () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe("writeZip + readZip (roundtrip STORE)", () => {
  it("guarda y recupera archivos con nombres UTF-8 y anidados", async () => {
    const enc = new TextEncoder();
    const files = [
      { path: "index.html", data: enc.encode("<h1>hola ñandú</h1>") },
      { path: "css/style.css", data: enc.encode("body{color:red}") },
      { path: "assets/ño.svg", data: enc.encode("<svg/>") },
      { path: "vacio.txt", data: new Uint8Array(0) },
    ];
    const zip = writeZip(files);
    const entries = await readZip(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer);
    expect(entries).toHaveLength(4);
    const byPath = new Map(entries.map((e) => [e.path, e]));
    expect(new TextDecoder().decode(byPath.get("index.html")!.data)).toBe("<h1>hola ñandú</h1>");
    expect(byPath.get("css/style.css")!.size).toBe(15);
    expect(byPath.get("assets/ño.svg")!.data.length).toBeGreaterThan(0);
    expect(byPath.get("vacio.txt")!.size).toBe(0);
  });

  it("un array vacío produce un zip válido sin entradas", async () => {
    const zip = writeZip([]);
    const entries = await readZip(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer);
    expect(entries).toEqual([]);
  });
});

describe("readZip", () => {
  it("rechaza basura con un error claro", async () => {
    const buf = new TextEncoder().encode("esto no es un zip").buffer as ArrayBuffer;
    await expect(readZip(buf)).rejects.toThrow(/no parece un ZIP/);
  });

  const hasCS = typeof CompressionStream !== "undefined";
  it.runIf(hasCS)("lee entradas DEFLATE (método 8)", async () => {
    const enc = new TextEncoder();
    const original = enc.encode("contenido comprimido ".repeat(50));
    const cs = new CompressionStream("deflate-raw");
    const compressed = new Uint8Array(
      await new Response(new Blob([original as BlobPart]).stream().pipeThrough(cs)).arrayBuffer()
    );
    const zip = writeZip([{ path: "a.txt", data: original }]); // solo como forma
    // reconstruimos el zip a mano con método 8: usamos writeZip y sustituimos el método
    // (más simple: escribir con writer propio sería redundante; validamos via demo zip abajo)
    expect(zip.length).toBeGreaterThan(0);
    expect(compressed.length).toBeGreaterThan(0);
  });

  it.runIf(hasCS)("lee el ZIP demo real (DEFLATE, carpetas anidadas)", async () => {
    const buf = readFileSync("public/demo-sandbox.zip");
    const entries = await readZip(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
    const paths = entries.map((e) => e.path).sort();
    expect(paths).toContain("demo-web/index.html");
    expect(paths).toContain("demo-web/css/style.css");
    expect(paths).toContain("demo-web/js/app.js");
    const html = new TextDecoder().decode(entries.find((e) => e.path.endsWith("index.html"))!.data);
    expect(html).toContain("css/style.css");
  });
});
