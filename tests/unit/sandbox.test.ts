import { describe, it, expect } from "vitest";
import {
  ancestorDirs,
  buildRunHtml,
  buildTree,
  isTextPath,
  localRef,
  pickEntryPath,
  resolvePath,
  SANDBOX_ORIGIN,
} from "../../src/lib/prism/sandbox";

function filesOf(spec: Record<string, string>): Map<string, Uint8Array> {
  const m = new Map<string, Uint8Array>();
  for (const [k, v] of Object.entries(spec)) m.set(k, new TextEncoder().encode(v));
  return m;
}

describe("resolvePath", () => {
  it("resuelve rutas relativas simples desde la raíz", () => {
    expect(resolvePath("", "js/app.js")).toBe("js/app.js");
    expect(resolvePath("", "./js/app.js")).toBe("js/app.js");
  });
  it("resuelve ../ respecto al directorio base", () => {
    expect(resolvePath("css", "../img/a.png")).toBe("img/a.png");
    expect(resolvePath("a/b", "../d.txt")).toBe("a/d.txt");
    expect(resolvePath("a/b", "../../c.txt")).toBe("c.txt");
  });
  it("absolutas dentro del proyecto", () => {
    expect(resolvePath("css", "/js/x.js")).toBe("js/x.js");
  });
});

describe("localRef", () => {
  it("rechaza recursos externos y especiales", () => {
    expect(localRef("https://x.com/a.js")).toBeNull();
    expect(localRef("//cdn.dev/a.js")).toBeNull();
    expect(localRef("data:image/png;base64,xx")).toBeNull();
    expect(localRef("#top")).toBeNull();
    expect(localRef("mailto:a@b.c")).toBeNull();
  });
  it("limpia query/hash de rutas locales", () => {
    expect(localRef("./a.js?v=2#fin")).toBe("a.js");
    expect(localRef("img/a.png")).toBe("img/a.png");
  });
});

describe("pickEntryPath", () => {
  it("elige el preferido si es HTML", () => {
    const paths = ["a.html", "index.html", "js/app.js"];
    expect(pickEntryPath(paths, "a.html")).toBe("a.html");
  });
  it("sin preferido: index.html en la raíz", () => {
    expect(pickEntryPath(["sub/pag.html", "index.html"])).toBe("index.html");
  });
  it("sin index: el HTML más superficial y alfabético", () => {
    expect(pickEntryPath(["z/bien.html", "sub/otro.html", "a/primero.html"])).toBe("a/primero.html");
    expect(pickEntryPath(["bien.html", "sub/otro.html"])).toBe("bien.html");
    expect(pickEntryPath(["sub/otro.html", "sub/a.html"])).toBe("sub/a.html");
  });
  it("devuelve null sin HTML", () => {
    expect(pickEntryPath(["js/app.js", "leeme.md"])).toBeNull();
  });

  /** Lo que rompía de verdad: el «Download ZIP» de GitHub —y cualquier
   *  proyecto exportado— mete todo dentro de una carpeta, y ahí el
   *  `index.html` dejaba de ganar y quedaba el desempate alfabético. */
  it("el index.html gana aunque el ZIP lo envuelva en una carpeta", () => {
    expect(pickEntryPath(["mi-web/about.html", "mi-web/index.html"])).toBe("mi-web/index.html");
    expect(pickEntryPath(["proyecto/contacto.html", "proyecto/index.html"])).toBe(
      "proyecto/index.html"
    );
    // y también con la extensión corta
    expect(pickEntryPath(["sitio/aaa.html", "sitio/index.htm"])).toBe("sitio/index.htm");
  });

  it("el index.html gana aunque esté más hondo que otro HTML", () => {
    // «busca el index» significa eso: no el primero que salga por orden
    expect(pickEntryPath(["assets/plantilla.html", "web/index.html"])).toBe("web/index.html");
    expect(pickEntryPath(["portada.html", "app/sub/index.html"])).toBe("app/sub/index.html");
  });

  it("entre varios index gana el menos hondo, y el desempate es estable", () => {
    expect(pickEntryPath(["a/b/index.html", "a/index.html"])).toBe("a/index.html");
    expect(pickEntryPath(["z/index.html", "a/index.html"])).toBe("a/index.html");
  });

  it("un preferido explícito sigue mandando sobre el index", () => {
    // el usuario abrió otro archivo a mano: eso no se le discute
    expect(pickEntryPath(["web/index.html", "web/otra.html"], "web/otra.html")).toBe(
      "web/otra.html"
    );
  });
});

describe("isTextPath", () => {
  it("clasifica texto y binario", () => {
    expect(isTextPath("a/app.js")).toBe(true);
    expect(isTextPath("a/estilo.CSS")).toBe(true);
    expect(isTextPath("a/imagen.png")).toBe(false);
  });
});

describe("buildRunHtml", () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // cabecera PNG falsa
  const files = new Map<string, Uint8Array>();
  files.set("index.html", new TextEncoder().encode(`<!doctype html>
<html><head>
  <link rel="stylesheet" href="css/style.css">
  <link rel="stylesheet" href="https://cdn.ejemplo.com/afuera.css">
  <script src="js/app.js"></script>
  <script src="falta.js"></script>
</head>
<body>
  <img src="img/a.png">
  <img src="https://remoto.ejemplo.com/x.png">
  <img src="img/nope.png">
</body></html>`));
  files.set(
    "css/style.css",
    new TextEncoder().encode(`@import "extra.css";
body { background: url(../img/a.png); }
`)
  );
  files.set("css/extra.css", new TextEncoder().encode(".extra { color: violet }"));
  files.set("js/app.js", new TextEncoder().encode("console.log('desde app.js');"));
  files.set("img/a.png", PNG);

  const res = buildRunHtml("index.html", files);

  it("inlinea el CSS local con @import y url() reescritos", () => {
    expect(res.html).toContain(".extra { color: violet }");
    expect(res.html).toContain('data-prism-from="css/style.css"');
    expect(res.html).toMatch(/url\("data:image\/png;base64,/);
    expect(res.html).not.toMatch(/@import\s+(?:url\(|["'])/);
  });

  it("inlinea los script locales y deja los externos intactos", () => {
    expect(res.html).toContain("console.log('desde app.js');");
    expect(res.html).toContain('https://cdn.ejemplo.com/afuera.css');
    expect(res.html).not.toMatch(/<script src="js\/app\.js"/);
  });

  it("convierte imágenes locales a data URL y no toca remotas", () => {
    expect(res.html).toMatch(/src="data:image\/png;base64,/);
    expect(res.html).toContain("https://remoto.ejemplo.com/x.png");
  });

  it("registra los recursos que faltan sin romper el HTML", () => {
    expect(res.missing).toContain("falta.js");
    expect(res.missing).toContain("img/nope.png");
  });

  it("inyecta el puente de consola exactamente una vez", () => {
    const veces = res.html.split(SANDBOX_ORIGIN).length - 1;
    expect(veces).toBeGreaterThanOrEqual(1);
    expect(res.html.match(/prism-sandbox/g)?.length).toBe(1);
  });

  it("si falta la entrada devuelve un HTML de error controlado", () => {
    const r = buildRunHtml("noexiste.html", files);
    expect(r.html).toContain("No se encontró la entrada");
  });
});

describe("buildRunHtml — correcciones", () => {
  it("sustituye el elemento <script src> entero, sin dejar un cierre huérfano", () => {
    const files = filesOf({
      "index.html": '<html><body><script src="a.js"></script></body></html>',
      "a.js": "var x = 1;",
    });
    const res = buildRunHtml("index.html", files);
    // un solo par de etiquetas script para el archivo inlineado
    expect(res.html.match(/<\/script>/g)?.length).toBe(2); // el inlineado + el puente de consola
    expect(res.html).toContain("var x = 1;");
  });

  it("escapa </script> dentro del código inlineado", () => {
    const files = filesOf({
      "index.html": '<html><body><script src="a.js"></script></body></html>',
      "a.js": 'document.write("</script>");',
    });
    const res = buildRunHtml("index.html", files);
    expect(res.html).toContain('document.write("<\\/script>");');
  });

  it("no reescribe cadenas «src=» que viven dentro del JS inlineado", () => {
    const files = filesOf({
      "index.html": '<html><body><script src="a.js"></script></body></html>',
      "a.js": 'el.setAttribute("src=foto.png", 1);',
      "foto.png": "x",
    });
    const res = buildRunHtml("index.html", files);
    expect(res.html).toContain('el.setAttribute("src=foto.png", 1);');
  });

  it("no repite en «missing» el mismo recurso referenciado dos veces", () => {
    const files = filesOf({
      "index.html": '<html><body><img src="no.png"><img src="no.png"></body></html>',
    });
    const res = buildRunHtml("index.html", files);
    expect(res.missing.filter((m) => m === "no.png")).toHaveLength(1);
  });
});

describe("buildTree", () => {
  it("agrupa por carpetas, ordena y cuenta los archivos", () => {
    const tree = buildTree(["index.html", "js/app.js", "css/a.css", "css/sub/b.css"]);
    expect(tree.map((n) => n.name)).toEqual(["css", "js", "index.html"]);
    const css = tree[0];
    expect(css.dir).toBe(true);
    expect(css.count).toBe(2); // a.css + sub/b.css
    expect(css.children.map((n) => n.name)).toEqual(["sub", "a.css"]);
    expect(tree[2].dir).toBe(false);
  });

  it("una lista vacía da un árbol vacío", () => {
    expect(buildTree([])).toEqual([]);
  });

  it("mantiene la ruta completa en cada nodo", () => {
    const tree = buildTree(["a/b/c.txt"]);
    expect(tree[0].path).toBe("a");
    expect(tree[0].children[0].path).toBe("a/b");
    expect(tree[0].children[0].children[0].path).toBe("a/b/c.txt");
  });
});

describe("ancestorDirs", () => {
  it("devuelve todas las carpetas que contienen la ruta", () => {
    expect(ancestorDirs("a/b/c.txt")).toEqual(["a", "a/b"]);
    expect(ancestorDirs("raiz.txt")).toEqual([]);
    expect(ancestorDirs("")).toEqual([]);
  });
});
