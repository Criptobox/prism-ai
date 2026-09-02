import { describe, expect, it } from "vitest";
import {
  extraerSeleccion,
  htmlATexto,
  SELECTORES_SOPORTADOS,
} from "../../src/lib/prism/html-a-texto";

const PAGINA = `<!doctype html><html><head><title>Precios</title></head><body>
<nav class="menu"><a href="/">Inicio</a></nav>
<main>
  <section id="precios" class="PricingTable bloque">
    <h2>Planes</h2>
    <div class="plan"><span>Starter</span> 0 €/mes</div>
    <div class="plan"><span>Plus</span> 20 €/mes</div>
  </section>
  <section id="faq"><h2>Preguntas</h2></section>
</main>
<footer>© 2026</footer>
</body></html>`;

describe("extraerSeleccion", () => {
  it("encuentra por id y devuelve el subárbol completo", () => {
    const r = extraerSeleccion(PAGINA, "#precios");
    expect(r.error).toBeNull();
    expect(r.html).toContain("Starter");
    expect(r.html).toContain("Plus");
    expect(r.html?.endsWith("</section>")).toBe(true);
    // no se cuela lo que hay fuera de la sección
    expect(r.html).not.toContain("Preguntas");
    expect(r.html).not.toContain("© 2026");
  });

  it("encuentra por clase aunque el elemento tenga varias", () => {
    const r = extraerSeleccion(PAGINA, ".PricingTable");
    expect(r.error).toBeNull();
    expect(r.html).toContain("Planes");
  });

  it("no confunde una clase con el prefijo de otra", () => {
    const html = `<div class="cardanoide">no</div><div class="card">sí</div>`;
    expect(extraerSeleccion(html, ".card").html).toContain("sí");
  });

  it("encuentra por etiqueta y cuenta el anidamiento", () => {
    // `main` contiene dos `section`: el cierre correcto es el último </main>
    const r = extraerSeleccion(PAGINA, "main");
    expect(r.html).toContain("Preguntas");
    expect(r.html).not.toContain("© 2026");
  });

  it("cierra bien una etiqueta anidada en otra igual", () => {
    const html = `<div id="a"><div>dentro</div>final</div><p>fuera</p>`;
    const r = extraerSeleccion(html, "#a");
    expect(r.html).toBe(`<div id="a"><div>dentro</div>final</div>`);
  });

  it("acepta etiqueta + id y etiqueta + clase", () => {
    expect(extraerSeleccion(PAGINA, "section#precios").html).toContain("Planes");
    expect(extraerSeleccion(PAGINA, "div.plan").html).toContain("Starter");
  });

  it("no casa una etiqueta distinta con el mismo id", () => {
    const r = extraerSeleccion(PAGINA, "article#precios");
    expect(r.html).toBeNull();
    expect(r.error).toContain("Ningún elemento");
  });

  it("rechaza los selectores que NO sabe resolver, en vez de fingir", () => {
    for (const sel of ["div p", "a > b", "[data-x=1]", "h1, h2", ".a.b", "#a #b"]) {
      const r = extraerSeleccion(PAGINA, sel);
      expect(r.html, sel).toBeNull();
      expect(r.error, sel).toContain("no se soporta");
    }
    expect(extraerSeleccion(PAGINA, "div p").error).toContain(SELECTORES_SOPORTADOS);
  });

  it("cuando no casa, lo dice: NUNCA devuelve la página entera en silencio", () => {
    const r = extraerSeleccion(PAGINA, "#no-existe");
    expect(r.html).toBeNull();
    expect(r.error).toContain("Ningún elemento");
  });

  it("ignora las etiquetas que se cierran solas", () => {
    // `<img class="x">` no abre subárbol: la que vale es la de después
    const html = `<img class="x" src="a.png"><div class="x">contenido</div>`;
    expect(extraerSeleccion(html, ".x").html).toBe(`<div class="x">contenido</div>`);
  });

  it("una etiqueta autocerrada es su propio subárbol, no media página", () => {
    const html = `<section id="a"/><p>otra cosa</p><footer>pie</footer>`;
    const r = extraerSeleccion(html, "#a");
    expect(r.html).toBe(`<section id="a"/>`);
    expect(r.html).not.toContain("pie");
  });

  it("con HTML roto (sin cierre) entrega desde ahí, como haría un navegador", () => {
    const html = `<p>antes</p><section id="a">contenido sin cerrar`;
    const r = extraerSeleccion(html, "#a");
    expect(r.error).toBeNull();
    expect(r.html).toContain("contenido sin cerrar");
    expect(r.html).not.toContain("antes");
  });

  it("acepta comillas simples y sin comillas en los atributos", () => {
    expect(extraerSeleccion(`<div id='a'>x</div>`, "#a").html).toContain("x");
    expect(extraerSeleccion(`<div id=a>x</div>`, "#a").html).toContain("x");
  });

  it("recortar antes gasta el tope en la zona pedida y no en el menú", () => {
    const zona = extraerSeleccion(PAGINA, "#precios").html!;
    const textoZona = htmlATexto(zona, 200);
    expect(textoZona).toContain("Starter");
    expect(textoZona).not.toContain("Inicio");
  });
});
