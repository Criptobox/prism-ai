import { describe, it, expect } from "vitest";
import { slidesFromHtml } from "../../src/lib/prism/slides";

describe("slidesFromHtml", () => {
  it("devuelve [] si el HTML está vacío", () => {
    expect(slidesFromHtml("")).toEqual([]);
    expect(slidesFromHtml("   ")).toEqual([]);
  });

  it("una diapositiva si no hay secciones ni h2", () => {
    const html = "<!DOCTYPE html><html><body><p>Hola mundo</p></body></html>";
    const slides = slidesFromHtml(html);
    expect(slides.length).toBe(1);
    expect(slides[0].index).toBe(1);
    expect(slides[0].html).toContain("<body>");
  });

  it("una diapositiva por <section> cuando hay ≥2", () => {
    const html = `<!DOCTYPE html><html><body>
      <section><h2>Uno</h2><p>Primera</p></section>
      <section><h2>Dos</h2><p>Segunda</p></section>
      <section><h2>Tres</h2><p>Tercera</p></section>
    </body></html>`;
    const slides = slidesFromHtml(html);
    expect(slides.length).toBe(3);
    expect(slides[0].title).toMatch(/Uno/);
    expect(slides[1].title).toMatch(/Dos/);
    expect(slides[2].title).toMatch(/Tres/);
  });

  it("una diapositiva por <h2> cuando no hay <section>", () => {
    const html = `<!DOCTYPE html><html><body>
      <h1>Título</h1>
      <p>Intro</p>
      <h2>Primera sección</h2>
      <p>Contenido 1</p>
      <h2>Segunda sección</h2>
      <p>Contenido 2</p>
    </body></html>`;
    const slides = slidesFromHtml(html);
    expect(slides.length).toBe(2);
    expect(slides[0].html).toContain("Primera sección");
    expect(slides[1].html).toContain("Segunda sección");
  });

  it("cae a <h1> si hay varios y no hay <section> ni <h2>", () => {
    const html = `<!DOCTYPE html><html><body>
      <h1>Capítulo 1</h1><p>Texto 1</p>
      <h1>Capítulo 2</h1><p>Texto 2</p>
    </body></html>`;
    const slides = slidesFromHtml(html);
    expect(slides.length).toBe(2);
  });

  it("cada diapositiva tiene un <html> completo (abrible como documento)", () => {
    const html = `<!DOCTYPE html><html><head><title>X</title></head><body>
      <section><h2>A</h2></section>
      <section><h2>B</h2></section>
    </body></html>`;
    const slides = slidesFromHtml(html);
    for (const s of slides) {
      expect(s.html.startsWith("<!DOCTYPE html>")).toBe(true);
      expect(s.html).toContain("<html");
      expect(s.html).toContain("</html>");
      expect(s.html).toContain("<body");
    }
  });

  it("el título se extrae del primer h1/h2/h3 de la diapositiva", () => {
    const html = `<!DOCTYPE html><html><body>
      <section><h3>Título raro</h3><p>x</p></section>
      <section><h2>Otro</h2><p>y</p></section>
    </body></html>`;
    const slides = slidesFromHtml(html);
    expect(slides[0].title).toBe("Título raro");
    expect(slides[1].title).toBe("Otro");
  });

  it("conserva el <head> del original (estilos del autor)", () => {
    const html = `<!DOCTYPE html><html><head><style>body{color:red}</style></head><body>
      <section><h2>A</h2></section>
      <section><h2>B</h2></section>
    </body></html>`;
    const slides = slidesFromHtml(html);
    expect(slides[0].html).toContain("body{color:red}");
  });

  it("una sola sección cuenta como documento entero", () => {
    const html = `<!DOCTYPE html><html><body>
      <section><h2>Única</h2><p>Todo</p></section>
    </body></html>`;
    const slides = slidesFromHtml(html);
    expect(slides.length).toBe(1);
  });
});
