import { describe, it, expect } from "vitest";
import {
  buildModuleGraph,
  importMapTag,
  isModulePath,
  isRelativeSpecifier,
  MODULE_SCHEME,
  resolveModule,
  rewriteSpecifiers,
  toModuleDataUrl,
} from "../../src/lib/prism/sandbox-modules";
import { buildRunHtml } from "../../src/lib/prism/sandbox";

function filesOf(spec: Record<string, string>): Map<string, Uint8Array> {
  const m = new Map<string, Uint8Array>();
  for (const [k, v] of Object.entries(spec)) m.set(k, new TextEncoder().encode(v));
  return m;
}

/** Decodifica una URL data: de módulo para poder comprobar el código reescrito. */
function decodeDataUrl(url: string): string {
  const b64 = url.slice(url.indexOf(",") + 1);
  const bin = Buffer.from(b64, "base64");
  return new TextDecoder().decode(bin);
}

describe("isModulePath / isRelativeSpecifier", () => {
  it("reconoce los archivos que pueden ser módulos", () => {
    expect(isModulePath("js/app.js")).toBe(true);
    expect(isModulePath("js/app.mjs")).toBe(true);
    expect(isModulePath("estilo.css")).toBe(false);
  });
  it("distingue relativos de paquetes", () => {
    expect(isRelativeSpecifier("./util.js")).toBe(true);
    expect(isRelativeSpecifier("../lib/x.js")).toBe(true);
    expect(isRelativeSpecifier("/raiz.js")).toBe(true);
    expect(isRelativeSpecifier("react")).toBe(false);
  });
});

describe("resolveModule", () => {
  const has = (p: string) =>
    ["js/util.js", "js/dir/index.js", "raiz.mjs"].includes(p);
  it("resuelve la ruta exacta", () => {
    expect(resolveModule("js/app.js", "./util.js", has)).toBe("js/util.js");
  });
  it("añade .js cuando falta", () => {
    expect(resolveModule("js/app.js", "./util", has)).toBe("js/util.js");
  });
  it("resuelve una carpeta por su index.js", () => {
    expect(resolveModule("js/app.js", "./dir", has)).toBe("js/dir/index.js");
  });
  it("resuelve rutas absolutas del proyecto y .mjs", () => {
    expect(resolveModule("js/sub/a.js", "/raiz.mjs", has)).toBe("raiz.mjs");
  });
  it("devuelve null si no existe", () => {
    expect(resolveModule("js/app.js", "./nada.js", has)).toBeNull();
  });
});

describe("rewriteSpecifiers", () => {
  const has = (p: string) => ["js/util.js", "js/otro.js"].includes(p);
  const noop = () => {};

  it("reescribe import, export-from e import() dinámico", () => {
    const code = [
      'import { a } from "./util.js";',
      'import def from "./util.js";',
      'import "./otro.js";',
      'export { b } from "./util.js";',
      'export * from "./otro.js";',
      'const m = await import("./util.js");',
    ].join("\n");
    const out = rewriteSpecifiers("js/app.js", code, has, noop, noop);
    expect(out).not.toMatch(/["']\.\//);
    expect(out.match(/prism:js\/util\.js/g)).toHaveLength(4);
    expect(out.match(/prism:js\/otro\.js/g)).toHaveLength(2);
  });

  it("deja intactos los paquetes de npm y los avisa", () => {
    const bare: string[] = [];
    const out = rewriteSpecifiers(
      "js/app.js",
      'import React from "react";',
      has,
      noop,
      (s) => bare.push(s)
    );
    expect(out).toContain('"react"');
    expect(bare).toEqual(["react"]);
  });

  it("no toca las URL absolutas ni las considera paquetes", () => {
    const bare: string[] = [];
    const out = rewriteSpecifiers(
      "js/app.js",
      'import x from "https://cdn.ejemplo.com/x.js";',
      has,
      noop,
      (s) => bare.push(s)
    );
    expect(out).toContain("https://cdn.ejemplo.com/x.js");
    expect(bare).toEqual([]);
  });

  it("avisa de los módulos relativos que no existen", () => {
    const missing: string[] = [];
    rewriteSpecifiers("js/app.js", 'import "./nada.js";', has, (t) => missing.push(t), noop);
    expect(missing).toEqual(["js/nada.js"]);
  });
});

describe("buildModuleGraph", () => {
  it("mete todos los módulos en el mapa con su código reescrito", () => {
    const graph = buildModuleGraph(
      filesOf({
        "index.html": "<html></html>",
        "js/app.js": 'import { saludo } from "./util.js";\nsaludo();',
        "js/util.js": 'export const saludo = () => console.log("hola");',
      })
    );
    expect(graph.count).toBe(2);
    expect(Object.keys(graph.imports).sort()).toEqual([
      "prism:js/app.js",
      "prism:js/util.js",
    ]);
    const app = decodeDataUrl(graph.imports["prism:js/app.js"]);
    expect(app).toContain('from "prism:js/util.js"');
  });

  it("resuelve importaciones anidadas a cualquier profundidad", () => {
    const graph = buildModuleGraph(
      filesOf({
        "a.js": 'import "./lib/b.js";',
        "lib/b.js": 'import "./sub/c.js";',
        "lib/sub/c.js": "export const c = 1;",
      })
    );
    expect(decodeDataUrl(graph.imports["prism:a.js"])).toContain("prism:lib/b.js");
    expect(decodeDataUrl(graph.imports["prism:lib/b.js"])).toContain("prism:lib/sub/c.js");
  });

  it("aguanta los ciclos de importación", () => {
    const graph = buildModuleGraph(
      filesOf({ "a.js": 'import "./b.js";', "b.js": 'import "./a.js";' })
    );
    expect(graph.count).toBe(2);
    expect(decodeDataUrl(graph.imports["prism:a.js"])).toContain("prism:b.js");
    expect(decodeDataUrl(graph.imports["prism:b.js"])).toContain("prism:a.js");
  });

  it("recoge los paquetes que no puede resolver", () => {
    const graph = buildModuleGraph(filesOf({ "a.js": 'import React from "react";' }));
    expect(graph.bare).toEqual(["react"]);
  });

  it("sin módulos, el mapa queda vacío y no se emite etiqueta", () => {
    const graph = buildModuleGraph(filesOf({ "index.html": "<html></html>" }));
    expect(graph.count).toBe(0);
    expect(importMapTag(graph)).toBe("");
  });
});

describe("importMapTag", () => {
  it("escapa el cierre de etiqueta dentro del JSON", () => {
    const tag = importMapTag({
      imports: { "prism:a.js": toModuleDataUrl("const x = '</script>';") },
      missing: [],
      bare: [],
      count: 1,
    });
    expect(tag).toContain('type="importmap"');
    expect(tag).not.toContain("</script>\"");
  });
});

describe("buildRunHtml con módulos ES", () => {
  const files = filesOf({
    "index.html": `<!doctype html><html><head><title>t</title></head>
<body><script type="module" src="js/app.js"></script></body></html>`,
    "js/app.js": 'import { saludo } from "./util.js";\nsaludo();',
    "js/util.js": 'export const saludo = () => console.log("hola");',
  });
  const res = buildRunHtml("index.html", files);

  it("emite el import map antes de cualquier módulo", () => {
    const map = res.html.indexOf('type="importmap"');
    const mod = res.html.indexOf('type="module" data-prism-from');
    expect(map).toBeGreaterThan(-1);
    expect(mod).toBeGreaterThan(map);
  });

  it("el <script type=module src> pasa a importar su especificador", () => {
    expect(res.html).toContain(`import "${MODULE_SCHEME}js/app.js";`);
    // no se pega el código en línea: lo sirve el mapa
    expect(res.html).not.toContain("import { saludo } from \"./util.js\"");
  });

  it("cuenta los módulos incluidos", () => {
    expect(res.modules).toBe(2);
    expect(res.bareImports).toEqual([]);
  });

  it("reescribe también un módulo escrito dentro del HTML", () => {
    const r = buildRunHtml(
      "index.html",
      filesOf({
        "index.html":
          '<html><body><script type="module">import { saludo } from "./js/util.js"; saludo();</script></body></html>',
        "js/util.js": "export const saludo = () => {};",
      })
    );
    expect(r.html).toContain('from "prism:js/util.js"');
  });

  it("un proyecto clásico sin módulos sigue inlineándose igual", () => {
    const r = buildRunHtml(
      "index.html",
      filesOf({
        "index.html": '<html><body><script src="a.js"></script></body></html>',
        "a.js": "var x = 1;",
      })
    );
    expect(r.html).toContain("var x = 1;");
    // sin sintaxis ESM no hay mapa: nada se duplica en base64
    expect(r.modules).toBe(0);
    expect(r.html).not.toContain("importmap");
    expect(r.html).not.toContain("prism:a.js");
  });
});
