import { describe, it, expect } from "vitest";
import {
  esRutaPlausible,
  filesFromAnswer,
  nombreDescarga,
} from "../../src/lib/prism/answer-files";

const rutas = (c: string) => filesFromAnswer(c).map((f) => f.path);

describe("de dónde sale el nombre", () => {
  it("de la propia cerca, con dos puntos", () => {
    expect(rutas("```html:index.html\n<h1>hola</h1>\n```")).toEqual(["index.html"]);
  });

  it("de la cerca, como atributo", () => {
    expect(rutas('```js title="src/app.js"\nconst a = 1;\n```')).toEqual(["src/app.js"]);
  });

  it("del texto de encima en negrita", () => {
    expect(rutas("**styles.css**\n\n```css\nbody { margin: 0 }\n```")).toEqual(["styles.css"]);
  });

  it("del texto de encima aunque venga con adornos", () => {
    expect(rutas("2. 📄 `src/app.js` (nuevo)\n```js\nconst a = 1;\n```")).toEqual(["src/app.js"]);
  });

  it("de un encabezado", () => {
    expect(rutas("### app.py\n```python\nprint(1)\n```")).toEqual(["app.py"]);
  });

  it("de un comentario en la primera línea", () => {
    expect(rutas("```html\n<!-- pagina.html -->\n<h1>x</h1>\n```")).toEqual(["pagina.html"]);
    expect(rutas("```js\n// utils/fecha.js\nexport const a = 1;\n```")).toEqual(["utils/fecha.js"]);
  });

  it("la cerca manda sobre el texto de encima", () => {
    expect(rutas("**otro.css**\n```css:real.css\nbody{}\n```")).toEqual(["real.css"]);
  });
});

describe("cuando la respuesta no dice el nombre", () => {
  it("se deduce del lenguaje", () => {
    const c = "```html\n<h1>hola</h1>\n```\n\n```css\nbody{}\n```\n\n```js\nconst a=1;\n```";
    expect(rutas(c)).toEqual(["index.html", "styles.css", "app.js"]);
  });

  it("dos del mismo lenguaje no se pisan", () => {
    expect(rutas("```js\nconst a=1;\n```\ntexto\n```js\nconst b=2;\n```")).toEqual([
      "app.js",
      "app-2.js",
    ]);
  });

  it("queda marcado que el nombre es deducido", () => {
    const [f] = filesFromAnswer("```css\nbody{}\n```");
    expect(f.inferido).toBe(true);
    const [g] = filesFromAnswer("```css:tema.css\nbody{}\n```");
    expect(g.inferido).toBe(false);
  });

  it("un lenguaje desconocido sin nombre no se inventa", () => {
    expect(rutas("```brainfuck\n+++\n```")).toEqual([]);
  });

  it("una consola no es un archivo", () => {
    expect(rutas("```bash\nnpm run dev\n```\n```console\n$ npm test\nok\n```")).toEqual([
      "script.sh",
    ]);
  });
});

describe("varias versiones del mismo archivo", () => {
  it("gana la última: es la corregida", () => {
    const c = "```html:index.html\n<h1>v1</h1>\n```\ncorrijo:\n```html:index.html\n<h1>v2</h1>\n```";
    const f = filesFromAnswer(c);
    expect(f).toHaveLength(1);
    expect(f[0].text).toContain("v2");
  });
});

describe("esRutaPlausible", () => {
  it("acepta rutas normales", () => {
    for (const r of ["index.html", "src/app.js", "a/b/c.min.css", "Main.java"]) {
      expect(esRutaPlausible(r), r).toBe(true);
    }
  });
  it("rechaza lo que no debe acabar en un download", () => {
    for (const r of [
      "",
      "sin-extension",
      "con espacio.js",
      "/etc/passwd",
      "../secreto.env",
      "https://ejemplo.com/x.html",
      "C:/Windows/a.dll",
      "data:text/html,x",
      ".",
    ]) {
      expect(esRutaPlausible(r), r).toBe(false);
    }
  });
});

describe("casos de borde", () => {
  it("sin contenido no hay archivos", () => {
    expect(filesFromAnswer(null)).toEqual([]);
    expect(filesFromAnswer("solo texto sin código")).toEqual([]);
  });
  it("un bloque vacío se ignora", () => {
    expect(rutas("```js\n\n```")).toEqual([]);
  });
  it("un bloque sin cerrar (streaming) también cuenta", () => {
    expect(rutas("```html:index.html\n<h1>a medias")).toEqual(["index.html"]);
  });
});

describe("nombreDescarga", () => {
  it("convierte un título en algo guardable", () => {
    expect(nombreDescarga("Página de la cafetería", "zip")).toMatch(
      /^pagina-de-la-cafeteria-\d{4}-\d{2}-\d{2}\.zip$/
    );
  });
  it("sin título usa un respaldo", () => {
    expect(nombreDescarga("", "html")).toMatch(/^prism-\d{4}-\d{2}-\d{2}\.html$/);
    expect(nombreDescarga(null, "html")).toMatch(/^prism-/);
  });
  it("recorta los títulos largos", () => {
    expect(nombreDescarga("palabra ".repeat(30), "zip").length).toBeLessThan(60);
  });
});
