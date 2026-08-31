/** Prism AI — HTML a texto legible para el agente.
 *
 * Mandarle el HTML crudo al modelo es tirar su contexto: entre scripts,
 * estilos y la maraña de divs, el texto útil suele ser menos de la décima
 * parte. Y con modelos de 8.000 tokens eso no es «mucho contexto»: es la
 * petición entera rechazada.
 */
import { describe, it, expect } from "vitest";
import { htmlATexto, tituloDeHtml, MAX_TEXTO_URL } from "../../src/lib/prism/html-a-texto";

describe("htmlATexto", () => {
  it("tira el JavaScript CON su contenido, no solo las etiquetas", () => {
    const html = "<p>Hola</p><script>var secreto = 1; alert('ruido');</script><p>Adiós</p>";
    const t = htmlATexto(html);
    expect(t).toContain("Hola");
    expect(t).toContain("Adiós");
    expect(t, "el código no se queda suelto en medio del texto").not.toContain("alert");
    expect(t).not.toContain("var secreto");
  });

  it("tira también estilos, comentarios y svg", () => {
    const t = htmlATexto(
      "<style>.a{color:red}</style><!-- nota interna --><svg><path d='M0'/></svg><p>Texto</p>"
    );
    expect(t).toBe("Texto");
  });

  it("conserva la separación de párrafos", () => {
    const t = htmlATexto("<h1>Título</h1><p>Uno</p><p>Dos</p>");
    expect(t.split("\n")).toEqual(["Título", "Uno", "Dos"]);
  });

  it("descodifica las entidades", () => {
    expect(htmlATexto("<p>a &lt; b &gt; c</p>")).toBe("a < b > c");
    expect(htmlATexto("<p>&#191;qu&#233;?</p>")).toBe("¿qué?");
  });

  /* Media web en español escribe los acentos así. Sin esto al modelo le
   * llegaba «art&iacute;culo», que además le gasta el triple de tokens. */
  it("descodifica los acentos y la eñe, respetando mayúsculas", () => {
    expect(htmlATexto("<p>Caf&eacute; con az&uacute;car</p>")).toBe("Café con azúcar");
    expect(htmlATexto("<p>El ni&ntilde;o de A&ntilde;over</p>")).toBe("El niño de Añover");
    // Á y á son entidades distintas: bajarlo todo a minúsculas rompía esto
    expect(htmlATexto("<p>&Aacute;lvaro y &aacute;rbol</p>")).toBe("Álvaro y árbol");
    expect(htmlATexto("<p>&iquest;qu&eacute; tal&#63;</p>")).toBe("¿qué tal?");
  });

  it("recorta y DICE que ha recortado, con el tamaño real", () => {
    const t = htmlATexto("<p>" + "x".repeat(50_000) + "</p>");
    expect(t.length).toBeLessThan(MAX_TEXTO_URL + 200);
    expect(t).toContain("recortado");
    expect(t).toContain("50000");
  });

  it("una página sin texto devuelve cadena vacía, no basura", () => {
    expect(htmlATexto("<html><head><script>1</script></head><body></body></html>")).toBe("");
  });
});

describe("tituloDeHtml", () => {
  it("saca el título y lo limpia", () => {
    expect(tituloDeHtml("<html><head><title>  Mi   página  </title></head>")).toBe("Mi página");
  });
  it("sin título, null: no se inventa uno", () => {
    expect(tituloDeHtml("<html><body>hola</body></html>")).toBeNull();
    expect(tituloDeHtml("<title>   </title>")).toBeNull();
  });
});
