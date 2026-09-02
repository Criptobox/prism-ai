/** Prism AI — La herramienta `read_url` del agente.
 *
 * Lee una página CONCRETA y devuelve su texto. No es un buscador: eso aquí no
 * se puede hacer sin servidor, y además no hace falta.
 *
 * Va por `/api/proxy` a propósito, y eso se comprueba: desde el navegador no
 * se puede leer una página ajena (CORS), y el proxy además trae el escudo
 * anti-SSRF de `net-guard.ts`. Un `fetch` directo se saltaría las dos cosas.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { runTool } from "../../src/lib/prism/tool-runner";
import type { ToolCall } from "../../src/lib/prism/tools-catalog";

const ctx = { projectFiles: {} };
const llamada = (args: Record<string, unknown>): ToolCall => ({
  id: "c1",
  name: "read_url",
  args,
});

function respuesta(body: string, init: { status?: number; type?: string } = {}) {
  return new Response(body, {
    status: init.status ?? 200,
    headers: { "content-type": init.type ?? "text/html; charset=utf-8" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("read_url", () => {
  it("pide la página POR EL PROXY, con la URL en la cabecera", async () => {
    const fetchMock = vi.fn(async () => respuesta("<p>hola</p>"));
    vi.stubGlobal("fetch", fetchMock);

    await runTool(llamada({ url: "https://ejemplo.org/articulo" }), ctx);

    const [destino, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(destino, "no un fetch directo: CORS y escudo").toBe("/api/proxy");
    expect((init.headers as Record<string, string>)["x-target-url"]).toBe(
      "https://ejemplo.org/articulo"
    );
    expect(init.method).toBe("GET");
  });

  it("devuelve el texto limpio, con el título, y sin el JavaScript", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        respuesta(
          "<html><head><title>Mi art&iacute;culo</title><script>var ruido=1</script></head>" +
            "<body><h1>Titular</h1><p>Lo que importa.</p></body></html>"
        )
      )
    );

    const r = await runTool(llamada({ url: "https://ejemplo.org" }), ctx);
    expect(r.ok).toBe(true);
    expect(r.content).toContain("Mi artículo");
    expect(r.content).toContain("Titular");
    expect(r.content).toContain("Lo que importa.");
    expect(r.content, "el JS no llega: sería tirar el contexto del modelo").not.toContain("ruido");
  });

  it("un 403 del escudo se explica, para que el modelo no reintente en bucle", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: "Destino no permitido: nombre interno", detalle: "localhost" }),
            { status: 403, headers: { "content-type": "application/json" } }
          )
      )
    );

    const r = await runTool(llamada({ url: "http://localhost/admin" }), ctx);
    expect(r.ok).toBe(false);
    expect(r.content).toContain("403");
    expect(r.content).toContain("no permitido");
  });

  it("una URL inválida se rechaza sin tocar la red", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const r = await runTool(llamada({ url: "esto no es una url" }), ctx);
    expect(r.ok).toBe(false);
    expect(fetchMock, "ni se intenta").not.toHaveBeenCalled();
  });

  it("los protocolos raros se rechazan sin tocar la red", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    for (const url of ["file:///etc/passwd", "ftp://x.org/a"]) {
      const r = await runTool(llamada({ url }), ctx);
      expect(r.ok, url).toBe(false);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sin argumento no se inventa una URL", async () => {
    const r = await runTool(llamada({}), ctx);
    expect(r.ok).toBe(false);
    expect(r.content).toContain("url");
  });

  it("una página sin texto legible lo dice, en vez de devolver vacío", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuesta("<html><body><script>1</script></body></html>")));
    const r = await runTool(llamada({ url: "https://ejemplo.org" }), ctx);
    expect(r.ok).toBe(true);
    expect(r.content).toContain("no tiene texto legible");
  });

  it("el JSON se entrega tal cual: convertirlo a «texto» lo estropearía", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respuesta('{"precio": 42}', { type: "application/json" }))
    );
    const r = await runTool(llamada({ url: "https://api.ejemplo.org/x" }), ctx);
    expect(r.content).toContain('{"precio": 42}');
  });
});

describe("read_url · selector y max_chars", () => {
  const PAGINA =
    `<html><head><title>Precios</title></head><body>` +
    `<nav>Inicio Blog Contacto</nav>` +
    `<section id="precios"><h2>Planes</h2><p>Starter 0 euros</p></section>` +
    `<footer>Aviso legal</footer></body></html>`;

  it("con selector devuelve SOLO esa zona, y dice cuál fue", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuesta(PAGINA)));
    const r = await runTool(llamada({ url: "https://ejemplo.org", selector: "#precios" }), ctx);
    expect(r.ok).toBe(true);
    expect(r.content).toContain("Starter 0 euros");
    expect(r.content).toContain("Zona: #precios");
    // lo de fuera de la zona no viaja: para eso se pidió el selector
    expect(r.content).not.toContain("Aviso legal");
    expect(r.content).not.toContain("Inicio Blog Contacto");
  });

  it("si el selector no casa, ERROR: no se devuelve la página entera en silencio", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuesta(PAGINA)));
    const r = await runTool(llamada({ url: "https://ejemplo.org", selector: "#no-existe" }), ctx);
    expect(r.ok).toBe(false);
    expect(r.content).toContain("Ningún elemento");
    expect(r.content).not.toContain("Aviso legal");
  });

  it("si el selector usa sintaxis no soportada, se dice cuál sí vale", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuesta(PAGINA)));
    const r = await runTool(llamada({ url: "https://ejemplo.org", selector: "nav > a" }), ctx);
    expect(r.ok).toBe(false);
    expect(r.content).toContain("no se soporta");
    expect(r.content).toContain("#precios");
  });

  it("un selector sobre algo que no es HTML es un error, no un silencio", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respuesta('{"plan":"starter"}', { type: "application/json" }))
    );
    const r = await runTool(llamada({ url: "https://ejemplo.org/api", selector: "#precios" }), ctx);
    expect(r.ok).toBe(false);
    expect(r.content).toContain("no devolvió HTML");
  });

  it("max_chars recorta el texto y lo dice", async () => {
    const largo = `<body><p>${"palabra ".repeat(2000)}</p></body>`;
    vi.stubGlobal("fetch", vi.fn(async () => respuesta(largo)));
    const r = await runTool(llamada({ url: "https://ejemplo.org", max_chars: 600 }), ctx);
    expect(r.ok).toBe(true);
    expect(r.content).toContain("recortado");
    expect(r.content.length).toBeLessThan(1200);
  });

  it("max_chars se recorta al techo: una página no se come la conversación", async () => {
    const largo = `<body><p>${"palabra ".repeat(20000)}</p></body>`;
    vi.stubGlobal("fetch", vi.fn(async () => respuesta(largo)));
    const r = await runTool(llamada({ url: "https://ejemplo.org", max_chars: 999999 }), ctx);
    expect(r.ok).toBe(true);
    expect(r.content.length).toBeLessThan(21_000);
  });

  it("sin selector ni max_chars se comporta como siempre", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuesta(PAGINA)));
    const r = await runTool(llamada({ url: "https://ejemplo.org" }), ctx);
    expect(r.ok).toBe(true);
    expect(r.content).toContain("Aviso legal");
    expect(r.content).not.toContain("Zona:");
  });
});
