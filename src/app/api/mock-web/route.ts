/** Página de mentira para probar la herramienta `read_url` del agente.
 * Trae de todo lo que hay que saber tirar: script, estilo y entidades. */
export const dynamic = "force-dynamic";

export async function GET() {
  const html = [
    "<!DOCTYPE html><html lang=\"es\"><head>",
    "<title>Página de prueba de Prism</title>",
    "<style>.x{color:red}</style>",
    "<script>var ruidoQueNoDebeLlegar = 1;</script>",
    "</head><body>",
    "<h1>Titular de la p&aacute;gina</h1>",
    "<p>El contenido legible que el agente tiene que traerse.</p>",
    "<script>alert('esto tampoco');</script>",
    "</body></html>",
  ].join("\n");
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
