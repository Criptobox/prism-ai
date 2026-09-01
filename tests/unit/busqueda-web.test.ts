/** Tests del parser de búsqueda web (tool search_web).
 *
 * El parseador es regex puro a propósito: se prueba aquí sin red ni
 * navegador, con un fragmento de HTML real de la página de resultados
 * de html.duckduckgo.com (recortado, con las clases que usa de verdad).
 */
import { describe, expect, it } from "vitest";
import { parsearResultadosDdg, urlReal, urlBusquedaDdg } from "../../src/lib/prism/busqueda-web";

const HTML_DDG = `
<div class="result results_links results_links_deep web-result ">
  <div class="links_main links_deep result__body">
    <h2 class="result__title">
      <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fdeveloper.mozilla.org%2Fes%2Fdocs%2FWeb%2FCSS%2Fscroll-snap-type&amp;rut=abc123">CSS scroll-snap-type - CSS | <b>MDN</b></a>
    </h2>
    <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fdeveloper.mozilla.org%2Fes%2Fdocs%2FWeb%2FCSS%2Fscroll-snap-type&amp;rut=abc123">La propiedad CSS <b>scroll-snap-type</b> define si un contenedor es estricto o relajo.</a>
  </div>
</div>
<div class="result results_links results_links_deep web-result ">
  <div class="links_main links_deep result__body">
    <h2 class="result__title">
      <a rel="nofollow" class="result__a" href="https://caniuse.com/css-snappoints">Can I use: CSS Scroll Snap</a>
    </h2>
    <a class="result__snippet" href="https://caniuse.com/css-snappoints">98,4&nbsp;% de los navegadores globales lo soportan.</a>
  </div>
</div>
<div class="result result--ad">
  <a class="result__a" href="https://duckduckgo.com/y.js?ad_provider=algo">Compra libros de CSS</a>
</div>
`;

describe("parsearResultadosDdg", () => {
  it("saca título, URL decodificada y resumen, y limpia etiquetas <b>", () => {
    const r = parsearResultadosDdg(HTML_DDG);
    expect(r).toHaveLength(2); // el anuncio no cuenta
    expect(r[0].titulo).toBe("CSS scroll-snap-type - CSS | MDN");
    expect(r[0].url).toBe("https://developer.mozilla.org/es/docs/Web/CSS/scroll-snap-type");
    expect(r[0].resumen).toContain("scroll-snap-type");
    expect(r[0].resumen).not.toContain("<b>");
  });

  it("respeta enlaces directos (sin redirect uddg)", () => {
    const r = parsearResultadosDdg(HTML_DDG);
    expect(r[1].url).toBe("https://caniuse.com/css-snappoints");
    // &nbsp; decodificado, no pegado al número
    expect(r[1].resumen).toBe("98,4 % de los navegadores globales lo soportan.");
  });

  it("descarta anuncios (y.js)", () => {
    const r = parsearResultadosDdg(HTML_DDG);
    expect(r.some((x) => x.titulo.includes("Compra libros"))).toBe(false);
  });

  it("con HTML que no es de resultados devuelve lista vacía, sin inventar", () => {
    expect(parsearResultadosDdg("<html><body>Hola</body></html>")).toEqual([]);
    expect(parsearResultadosDdg("")).toEqual([]);
  });

  it("respeta el máximo de resultados", () => {
    const muchos = Array.from(
      { length: 9 },
      (_, i) =>
        `<a class="result__a" href="https://ejemplo.com/${i}">Resultado ${i}</a>`
    ).join("");
    const r = parsearResultadosDdg(muchos, 5);
    expect(r).toHaveLength(5);
  });
});

describe("urlReal", () => {
  it("decodifica el parámetro uddg de un redirect de DDG", () => {
    expect(urlReal("//duckduckgo.com/l/?uddg=https%3A%2F%2Fejemplo.com%2Fa&rut=x")).toBe(
      "https://ejemplo.com/a"
    );
  });
  it("devuelve la URL tal cual si no es un redirect", () => {
    expect(urlReal("https://ejemplo.com")).toBe("https://ejemplo.com");
  });
});

describe("urlBusquedaDdg", () => {
  it("codifica la consulta", () => {
    expect(urlBusquedaDdg("css grid 2026")).toBe(
      "https://html.duckduckgo.com/html/?q=css%20grid%202026"
    );
  });
});
