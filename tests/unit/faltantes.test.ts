/** Prism AI — El diagnóstico de archivos que el HTML pide y no están.
 *
 * El caso real: un ZIP con `index.html`, `css.css` y `javascript.js`, y un
 * HTML que pide `styles.css` y `script.js`. La vista previa salía pelada y la
 * app no decía por qué.
 */
import { describe, expect, it } from "vitest";
import {
  diagnosticar,
  explicar,
  arregloDeUnClic,
  resumenFaltantes,
  MAX_CANDIDATOS,
  aplicarArreglo,
} from "../../src/lib/prism/faltantes";
import { resolvePath } from "../../src/lib/prism/sandbox";

const PROYECTO_REAL = [
  "web ambueguesa/index.html",
  "web ambueguesa/css.css",
  "web ambueguesa/javascript.js",
];
const FALTAN_REAL = ["web ambueguesa/styles.css", "web ambueguesa/script.js"];

describe("el caso del usuario", () => {
  it("señala el único .css del proyecto como candidato", () => {
    const [css] = diagnosticar(["web ambueguesa/styles.css"], PROYECTO_REAL);
    expect(css.motivo).toBe("unico-de-su-tipo");
    expect(css.candidatos).toEqual(["web ambueguesa/css.css"]);
    expect(explicar(css)).toContain("css.css");
    expect(explicar(css), "hay que decir qué hacer, no solo qué pasa").toMatch(/renómbralo|cambia la referencia/i);
  });

  it("hace lo mismo con el .js", () => {
    const [js] = diagnosticar(["web ambueguesa/script.js"], PROYECTO_REAL);
    expect(js.candidatos).toEqual(["web ambueguesa/javascript.js"]);
  });

  it("los dos tienen arreglo de un clic", () => {
    const fs = diagnosticar(FALTAN_REAL, PROYECTO_REAL);
    expect(fs.every((f) => arregloDeUnClic(f) !== null)).toBe(true);
    expect(arregloDeUnClic(fs[0])).toEqual({
      de: "web ambueguesa/css.css",
      a: "web ambueguesa/styles.css",
    });
  });

  it("el resumen no exagera ni se queda corto", () => {
    expect(resumenFaltantes(diagnosticar(FALTAN_REAL, PROYECTO_REAL))).toBe(
      "2 archivos que el HTML pide no están en el proyecto. Todos tienen un candidato claro."
    );
    expect(resumenFaltantes([])).toBe("");
  });
});

describe("los otros casos", () => {
  it("el mismo nombre en otra carpeta: es la ruta, no el nombre", () => {
    const [f] = diagnosticar(["styles.css"], ["index.html", "css/styles.css"]);
    expect(f.motivo).toBe("misma-ruta-otra-carpeta");
    expect(explicar(f)).toContain("Es la ruta, no el nombre");
    expect(arregloDeUnClic(f)).toEqual({ de: "css/styles.css", a: "styles.css" });
  });

  it("con VARIOS del mismo tipo no se adivina: se enseña la lista", () => {
    // Adivinar entre tres es acertar una de cada tres veces y haberlo
    // estropeado las otras dos.
    const [f] = diagnosticar(["styles.css"], ["a.css", "b.css", "c.css"]);
    expect(f.motivo).toBe("varios-del-tipo");
    expect(arregloDeUnClic(f), "sin arreglo automático").toBeNull();
    expect(explicar(f)).toContain("a.css");
  });

  it("sin ningún archivo de ese tipo lo dice y ya", () => {
    const [f] = diagnosticar(["fondo.png"], ["index.html", "estilos.css"]);
    expect(f.motivo).toBe("ninguno");
    expect(f.candidatos).toEqual([]);
    expect(explicar(f)).toContain("ni hay ningún .png");
    expect(arregloDeUnClic(f)).toBeNull();
  });

  it("un archivo sin extensión no inventa un tipo", () => {
    const [f] = diagnosticar(["LICENCIA"], ["index.html"]);
    expect(f.ext).toBe("");
    expect(f.motivo).toBe("ninguno");
    expect(explicar(f)).not.toContain("ningún .");
  });

  it("el mismo archivo pedido dos veces sale una", () => {
    const fs = diagnosticar(["a.css", "a.css", "a.css"], ["b.css"]);
    expect(fs.length).toBe(1);
  });

  it("no propone más candidatos de la cuenta", () => {
    const muchos = Array.from({ length: 10 }, (_, i) => `f${i}.css`);
    const [f] = diagnosticar(["styles.css"], muchos);
    expect(f.candidatos.length).toBe(MAX_CANDIDATOS);
  });

  it("la extensión no distingue mayúsculas", () => {
    const [f] = diagnosticar(["styles.CSS"], ["estilo.css"]);
    expect(f.motivo).toBe("unico-de-su-tipo");
  });

  it("sin nada que falte, no hay diagnóstico", () => {
    expect(diagnosticar([], ["index.html"])).toEqual([]);
  });
});

describe("aplicarArreglo", () => {
  // el mismo resolutor que usa el Sandbox de verdad
  const resolver = (baseDir: string, ref: string) => resolvePath(baseDir, ref);

  const HTML_REAL = [
    "<!DOCTYPE html><html><head>",
    '<link rel="stylesheet" href="styles.css">',
    '<link href="https://fonts.googleapis.com/css2?family=Poppins" rel="stylesheet">',
    "</head><body>",
    '<a href="#menu">Menú</a>',
    '<img src="https://via.placeholder.com/300x200" alt="x">',
    '<script src="script.js"></script>',
    "</body></html>",
  ].join("\n");

  it("cambia la referencia del CSS al archivo que sí existe", () => {
    const r = aplicarArreglo(
      HTML_REAL,
      "web ambueguesa",
      "web ambueguesa/styles.css",
      "web ambueguesa/css.css",
      resolver
    );
    expect(r.cambios).toBe(1);
    expect(r.refAnterior).toBe("styles.css");
    expect(r.refNueva).toBe("css.css");
    expect(r.html).toContain('href="css.css"');
    expect(r.html).not.toContain('href="styles.css"');
  });

  it("no toca enlaces externos, anclas ni el resto de la página", () => {
    const r = aplicarArreglo(
      HTML_REAL,
      "web ambueguesa",
      "web ambueguesa/script.js",
      "web ambueguesa/javascript.js",
      resolver
    );
    expect(r.html).toContain("fonts.googleapis.com");
    expect(r.html).toContain('href="#menu"');
    expect(r.html).toContain("via.placeholder.com");
    expect(r.html).toContain('src="javascript.js"');
  });

  it("cambia TODAS las que apuntan al mismo archivo", () => {
    const html = '<link href="a.css"><link href="./a.css"><link href="otra.css">';
    const r = aplicarArreglo(html, "", "a.css", "b.css", resolver);
    expect(r.cambios).toBe(2);
    expect(r.html).toContain('href="otra.css"');
  });

  it("si no encuentra ninguna referencia, devuelve el HTML intacto", () => {
    const r = aplicarArreglo(HTML_REAL, "web ambueguesa", "web ambueguesa/nada.css", "web ambueguesa/css.css", resolver);
    expect(r.cambios).toBe(0);
    expect(r.html).toBe(HTML_REAL);
    expect(r.refAnterior).toBeNull();
  });

  it("un archivo fuera de la carpeta del HTML se escribe desde la raíz", () => {
    const r = aplicarArreglo('<link href="e.css">', "paginas", "paginas/e.css", "css/e.css", resolver);
    expect(r.refNueva).toBe("/css/e.css");
  });

  it("una cadena parecida dentro de un script NO se toca", () => {
    // solo se sustituyen href/src que resuelven al archivo ausente
    const html = '<script>var x = "styles.css";</script><link href="styles.css">';
    const r = aplicarArreglo(html, "", "styles.css", "css.css", resolver);
    expect(r.cambios).toBe(1);
    expect(r.html).toContain('var x = "styles.css"');
    expect(r.html).toContain('href="css.css"');
  });

  it("respeta las comillas simples", () => {
    const r = aplicarArreglo("<link href='a.css'>", "", "a.css", "b.css", resolver);
    expect(r.html).toContain("href='b.css'");
  });
});
