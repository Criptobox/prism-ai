/** Tests de las herramientas nuevas del agente (v3.32, PLAN-V7).
 *
 * edit_file, run_js, read_console, search_web, fetch_api y git_snapshot
 * se prueban aquí a través de `runTool` con un contexto falso — sin
 * navegador (run_js recibe un REPL falso; el iframe real va en js-repl
 * y el E2E) y sin red (fetch se simula).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runTool, type ToolContext, type RunOutcome } from "../../src/lib/prism/tool-runner";
import type { ToolCall, ToolResult } from "../../src/lib/prism/tools-catalog";
import { memoriaComoStorage } from "../../src/lib/prism/snapshots";

function llamar(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const call: ToolCall = { id: "c1", name, args };
  return runTool(call, ctx);
}

function ctxBase(extra: Partial<ToolContext> = {}): ToolContext {
  return {
    projectFiles: { "index.html": "<h1>Hola</h1>", "styles.css": ".hero { color: red; }" },
    snapshotStorage: memoriaComoStorage(),
    ...extra,
  };
}

const REPL_OK = async (code: string) => ({
  ok: true,
  valor: `["4,50 €", "9,00 €"]`,
  logs: [`[log] dos precios`],
  ms: 120,
});
const REPL_THROW = async () => ({
  ok: false,
  valor: "TypeError: precios.map is not a function",
  logs: [],
  ms: 30,
});

/* ------------------------------------------------------------------ */
/* edit_file                                                           */
/* ------------------------------------------------------------------ */

describe("edit_file", () => {
  it("reemplaza un fragmento único y actualiza el archivo", async () => {
    const ctx = ctxBase();
    const r = await llamar("edit_file", {
      path: "styles.css",
      find: "color: red;",
      replace: "color: var(--prism-violet);",
    }, ctx);
    expect(r.ok).toBe(true);
    expect(ctx.projectFiles["styles.css"]).toBe(".hero { color: var(--prism-violet); }");
  });

  it("archivo que no existe: error con sugerencia", async () => {
    const r = await llamar("edit_file", { path: "nope.css", find: "a", replace: "b" }, ctxBase());
    expect(r.ok).toBe(false);
    expect(r.content).toContain("no existe");
    expect(r.content).toContain("list_files");
  });

  it("find que no está: error que manda re-leer, no a ciegas", async () => {
    const r = await llamar("edit_file", { path: "styles.css", find: "color: blue;", replace: "x" }, ctxBase());
    expect(r.ok).toBe(false);
    expect(r.content).toContain("read_file");
  });

  it("find con varias apariciones SIN all: se niega (seguridad)", async () => {
    const ctx = ctxBase({ projectFiles: { "a.css": ".x{color:red}.y{color:red}" } });
    const r = await llamar("edit_file", { path: "a.css", find: "color:red", replace: "color:blue" }, ctx);
    expect(r.ok).toBe(false);
    expect(r.content).toContain("2 veces");
    // y no ha tocado nada
    expect(ctx.projectFiles["a.css"]).toBe(".x{color:red}.y{color:red}");
  });

  it("con all: true reemplaza todas", async () => {
    const ctx = ctxBase({ projectFiles: { "a.css": ".x{color:red}.y{color:red}" } });
    const r = await llamar(
      "edit_file",
      { path: "a.css", find: "color:red", replace: "color:blue", all: true },
      ctx
    );
    expect(r.ok).toBe(true);
    expect(r.content).toContain("2 reemplazo");
    expect(ctx.projectFiles["a.css"]).toBe(".x{color:blue}.y{color:blue}");
  });

  it("find vacío: error de argumento", async () => {
    const r = await llamar("edit_file", { path: "styles.css", find: "", replace: "x" }, ctxBase());
    expect(r.ok).toBe(false);
    expect(r.content).toContain("find");
  });
});

/* ------------------------------------------------------------------ */
/* run_js                                                              */
/* ------------------------------------------------------------------ */

describe("run_js", () => {
  it("devuelve consola y resultado del REPL", async () => {
    const ctx = ctxBase({ runJs: REPL_OK });
    const r = await llamar("run_js", { code: "const resultado = precios.map(f)" }, ctx);
    expect(r.ok).toBe(true);
    expect(r.content).toContain("[log] dos precios");
    expect(r.content).toContain("resultado (120 ms)");
    expect(r.content).toContain("4,50 €");
  });

  it("el error del código del usuario viaja en el contenido (contrato de run_project)", async () => {
    const ctx = ctxBase({ runJs: REPL_THROW });
    const r = await llamar("run_js", { code: "const resultado = precios.map(f)" }, ctx);
    // la TOOL funcionó y el código del usuario reventó: igual que run_project
    // con errores de consola, ok:true y el error VIAJA en el contenido para
    // que el modelo lo corrija (convención desde la v3.17, §1.5 de INSTRUCCIONES).
    expect(r.ok).toBe(true);
    expect(r.content).toContain("TypeError");
  });

  it("sin code: error de argumento", async () => {
    const r = await llamar("run_js", {}, ctxBase({ runJs: REPL_OK }));
    expect(r.ok).toBe(false);
    expect(r.content).toContain("code");
  });

  it("sin REPL disponible: error claro, no silencio", async () => {
    const r = await llamar("run_js", { code: "1+1" }, ctxBase());
    expect(r.ok).toBe(false);
    expect(r.content).toContain("REPL");
  });
});

/* ------------------------------------------------------------------ */
/* read_console                                                        */
/* ------------------------------------------------------------------ */

describe("read_console", () => {
  it("sin ejecución previa lo dice, con ok:true (no es un error de la tool)", async () => {
    const r = await llamar("read_console", {}, ctxBase());
    expect(r.ok).toBe(true);
    expect(r.content).toContain("run_project");
  });

  it("tras run_project devuelve las líneas con su nivel", async () => {
    const ctx = ctxBase();
    ctx.runProject = async () => ({
      ok: false,
      ejecutado: true,
      logs: 3,
      errors: 1,
      logLines: ["[log] carga"],
      errorLines: ["boom"],
      consola: [
        { level: "log", text: "carga" },
        { level: "error", text: "boom: precios is not defined" },
      ],
    });
    await llamar("run_project", {}, ctx);
    const r = await llamar("read_console", {}, ctx);
    expect(r.ok).toBe(true);
    expect(r.content).toContain("[error] boom");
    expect(r.content).toContain("[log] carga");
  });

  it("filtra por nivel y avisa si no hay de ese nivel", async () => {
    const ctx = ctxBase();
    ctx.lastConsole = {
      lines: [{ level: "log", text: "solo logs" }],
      fecha: Date.now(),
    };
    const r = await llamar("read_console", { level: "error" }, ctx);
    expect(r.ok).toBe(true);
    expect(r.content).toContain("No hay líneas de nivel «error»");
  });
});

/* ------------------------------------------------------------------ */
/* search_web                                                          */
/* ------------------------------------------------------------------ */

const HTML_DDG = `
<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fmdn.example%2Fscroll&amp;rut=x">Scroll snap en <b>MDN</b></a>
<a class="result__snippet" href="x">La guía completa de scroll snap.</a>
`;

describe("search_web", () => {
  const fetchReal = globalThis.fetch;
  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = fetchReal;
  });

  it("devuelve resultados formateados y el consejo de read_url", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(HTML_DDG, { status: 200, headers: { "content-type": "text/html" } })
    ) as unknown as typeof fetch;
    const r = await llamar("search_web", { query: "css scroll snap" }, ctxBase());
    expect(r.ok).toBe(true);
    expect(r.content).toContain("MDN");
    expect(r.content).toContain("https://mdn.example/scroll");
    expect(r.content).toContain("read_url");
    // pidió el HTML del buscador por el proxy
    const llamada = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    expect(llamada[0]).toBe("/api/proxy");
    const headers = (llamada[1] as RequestInit).headers as Record<string, string>;
    expect(headers["x-target-url"]).toContain("html.duckduckgo.com");
  });

  it("sin resultados legibles: ok:false con consejo, sin inventar", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response("<html>captcha</html>", { status: 200, headers: { "content-type": "text/html" } })
    ) as unknown as typeof fetch;
    const r = await llamar("search_web", { query: "nada" }, ctxBase());
    expect(r.ok).toBe(false);
    expect(r.content).toContain("Prueba otros términos");
  });

  it("error HTTP del proxy llega con su estado", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: "bloqueado" }), { status: 403 })
    ) as unknown as typeof fetch;
    const r = await llamar("search_web", { query: "x" }, ctxBase());
    expect(r.ok).toBe(false);
    expect(r.content).toContain("403");
    expect(r.content).toContain("bloqueado");
  });
});

/* ------------------------------------------------------------------ */
/* fetch_api                                                           */
/* ------------------------------------------------------------------ */

const JSON_TIEMPO = {
  current: { temperature_2m: 28.4, wind_speed_10m: 11.2, soil_0cm: 25 },
  hourly: Array.from({ length: 24 }, (_, i) => ({ time: `h${i}`, t: 20 + i })),
};

describe("fetch_api", () => {
  const fetchReal = globalThis.fetch;
  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = fetchReal;
  });

  it("con fields devuelve SOLO los pedidos (y ahorra tokens)", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(JSON_TIEMPO), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    ) as unknown as typeof fetch;
    const r = await llamar(
      "fetch_api",
      { url: "https://api.open-meteo.com/v1/forecast", fields: ["current.temperature_2m", "current.wind_speed_10m"] },
      ctxBase()
    );
    expect(r.ok).toBe(true);
    expect(r.content).toContain("current.temperature_2m: 28.4");
    expect(r.content).not.toContain("soil_0cm");
    expect(r.content).not.toContain("hourly");
  });

  it("un campo que no existe dice «sin dato», no se inventa", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ a: 1 }), { status: 200 })
    ) as unknown as typeof fetch;
    const r = await llamar("fetch_api", { url: "https://api.example.com/x", fields: ["a", "b.c"] }, ctxBase());
    expect(r.ok).toBe(true);
    expect(r.content).toContain("a: 1");
    expect(r.content).toContain("b.c: sin dato");
  });

  it("índices de array por ruta de puntos", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ lista: [10, 20, 30] }), { status: 200 })
    ) as unknown as typeof fetch;
    const r = await llamar("fetch_api", { url: "https://api.example.com/l", fields: ["lista.1"] }, ctxBase());
    expect(r.content).toContain("lista.1: 20");
  });

  it("respuesta que no es JSON: error claro sugiriendo read_url", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response("<html>hola</html>", { status: 200, headers: { "content-type": "text/html" } })
    ) as unknown as typeof fetch;
    const r = await llamar("fetch_api", { url: "https://example.com" }, ctxBase());
    expect(r.ok).toBe(false);
    expect(r.content).toContain("no devolvió JSON");
    expect(r.content).toContain("read_url");
  });

  it("sin fields devuelve el JSON entero recortado", async () => {
    const grande = { data: "x".repeat(6000) };
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(grande), { status: 200 })
    ) as unknown as typeof fetch;
    const r = await llamar("fetch_api", { url: "https://example.com/big" }, ctxBase());
    expect(r.ok).toBe(true);
    expect(r.content).toContain("recortado");
  });

  it("URL inválida o no-http: error", async () => {
    const r1 = await llamar("fetch_api", { url: "no-es-url" }, ctxBase());
    expect(r1.ok).toBe(false);
    const r2 = await llamar("fetch_api", { url: "ftp://x" }, ctxBase());
    expect(r2.ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* git_snapshot                                                        */
/* ------------------------------------------------------------------ */

describe("git_snapshot", () => {
  it("create + list + restore redondo", async () => {
    const ctx = ctxBase();
    const creacion = await llamar("git_snapshot", { action: "create", message: "antes del cambio" }, ctx);
    expect(creacion.ok).toBe(true);

    // el agente rompe algo
    ctx.projectFiles["styles.css"] = ".hero { color: MAL }";
    const lista = await llamar("git_snapshot", { action: "list" }, ctx);
    expect(lista.ok).toBe(true);
    expect(lista.content).toContain("antes del cambio");

    const id = /«(s\w+)»/.exec(creacion.content)?.[1];
    expect(id).toBeTruthy();
    const restore = await llamar("git_snapshot", { action: "restore", id }, ctx);
    expect(restore.ok).toBe(true);
    // el archivo volvió al estado del snapshot
    expect(ctx.projectFiles["styles.css"]).toBe(".hero { color: red; }");
  });

  it("restore con id desconocido: error con sugerencia de list", async () => {
    const r = await llamar("git_snapshot", { action: "restore", id: "sX" }, ctxBase());
    expect(r.ok).toBe(false);
    expect(r.content).toContain("list");
  });

  it("list sin snapshots: ok con mensaje útil (no error)", async () => {
    const r = await llamar("git_snapshot", { action: "list" }, ctxBase());
    expect(r.ok).toBe(true);
    expect(r.content).toContain("No hay snapshots");
  });

  it("acción desconocida: error", async () => {
    const r = await llamar("git_snapshot", { action: "magic" }, ctxBase());
    expect(r.ok).toBe(false);
    expect(r.content).toContain("Acción desconocida");
  });

  it("create con proyecto vacío: error claro", async () => {
    const r = await llamar("git_snapshot", { action: "create" }, ctxBase({ projectFiles: {} }));
    expect(r.ok).toBe(false);
    expect(r.content).toContain("vacío");
  });
});

/* ------------------------------------------------------------------ */
/* catálogo y mensajes de error                                        */
/* ------------------------------------------------------------------ */

describe("catálogo v3.32", () => {
  it("herramienta desconocida lista las 12 disponibles", async () => {
    const r = await llamar("inventada", {}, ctxBase());
    expect(r.ok).toBe(false);
    expect(r.content).toContain("edit_file");
    expect(r.content).toContain("run_js");
    expect(r.content).toContain("search_web");
    expect(r.content).toContain("fetch_api");
    expect(r.content).toContain("git_snapshot");
    expect(r.content).toContain("read_console");
  });
});
