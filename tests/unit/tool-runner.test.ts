/** Tests del ejecutor de herramientas (tool-runner.ts).
 * No toca la red ni React: recibe un `ToolContext` en memoria. */
import { describe, it, expect } from "vitest";
import { runTool, runTools, type ToolContext } from "../../src/lib/prism/tool-runner";
import type { ToolCall } from "../../src/lib/prism/tools-catalog";

const ctx = (over: Partial<ToolContext> = {}): ToolContext => ({
  projectFiles: {
    "index.html": "<!doctype html><body>hola</body>",
    "styles.css": "body { color: red }",
    "src/app.js": "console.log('hola')",
  },
  ...over,
});

const call = (name: string, args: Record<string, unknown> = {}): ToolCall => ({
  id: `call_${name}_${Math.random().toString(36).slice(2, 6)}`,
  name,
  args,
});

describe("read_file", () => {
  it("devuelve el contenido si el archivo existe", async () => {
    const r = await runTool(call("read_file", { path: "index.html" }), ctx());
    expect(r.ok).toBe(true);
    expect(r.content).toContain("<body>hola</body>");
  });
  it("error claro si el archivo no existe", async () => {
    const r = await runTool(call("read_file", { path: "no-existe.js" }), ctx());
    expect(r.ok).toBe(false);
    expect(r.content).toContain("no existe");
    expect(r.content).toContain("list_files");
  });
  it("error si falta path", async () => {
    const r = await runTool(call("read_file", {}), ctx());
    expect(r.ok).toBe(false);
    expect(r.content).toContain("path");
  });
});

describe("write_file", () => {
  it("escribe y actualiza projectFiles", async () => {
    const c = ctx();
    const r = await runTool(call("write_file", { path: "nuevo.txt", content: "hola" }), c);
    expect(r.ok).toBe(true);
    expect(c.projectFiles["nuevo.txt"]).toBe("hola");
  });
  it("reemplaza contenido existente", async () => {
    const c = ctx();
    const r = await runTool(call("write_file", { path: "index.html", content: "NUEVO" }), c);
    expect(r.ok).toBe(true);
    expect(c.projectFiles["index.html"]).toBe("NUEVO");
  });
  it("error si falta content", async () => {
    const r = await runTool(call("write_file", { path: "a.txt" }), ctx());
    expect(r.ok).toBe(false);
    expect(r.content).toContain("content");
  });
});

describe("list_files", () => {
  it("lista todo si no hay prefix", async () => {
    const r = await runTool(call("list_files", {}), ctx());
    expect(r.ok).toBe(true);
    expect(r.content).toContain("index.html");
    expect(r.content).toContain("styles.css");
    expect(r.content).toContain("src/app.js");
  });
  it("filtra por prefix", async () => {
    const r = await runTool(call("list_files", { prefix: "src/" }), ctx());
    expect(r.ok).toBe(true);
    expect(r.content).toContain("src/app.js");
    expect(r.content).not.toContain("index.html");
  });
  it("avisa si no hay archivos que coincidan", async () => {
    const r = await runTool(call("list_files", { prefix: "no/" }), ctx());
    expect(r.ok).toBe(true);
    expect(r.content).toContain("No hay archivos");
  });
});

describe("run_project", () => {
  /* El fallo: `ok` significa «sin errores», no «se pudo ejecutar», y el
   * comentario del tipo decía lo contrario. Con `ok`, esta rama contestaba
   * «No se pudo ejecutar el proyecto» SIEMPRE que había errores — o sea, se
   * le ocultaban al agente los errores de su propio código, que es justo
   * para lo que existe la herramienta. */
  it("cuando el proyecto SÍ se ejecuta y da errores, el modelo los ve", async () => {
    const c = ctx({
      runProject: async () => ({
        ok: false,
        ejecutado: true,
        logs: 1,
        errors: 1,
        logLines: [],
        errorLines: ["Uncaught ReferenceError: pintarTodo is not defined"],
      }),
    });
    const r = await runTool(call("run_project", {}), c);
    expect(r.content, "no puede decir que no se pudo ejecutar").not.toContain(
      "No se pudo ejecutar"
    );
    expect(r.content).toContain("pintarTodo is not defined");
  });

  it("cuando de verdad no se pudo ejecutar, lo dice con su motivo", async () => {
    const c = ctx({
      runProject: async () => ({
        ok: false,
        ejecutado: false,
        logs: 0,
        errors: 0,
        logLines: [],
        errorLines: [],
        reason: "No hay ningún archivo .html en el proyecto.",
      }),
    });
    const r = await runTool(call("run_project", {}), c);
    expect(r.content).toContain("No hay ningún archivo .html");
  });

  it("devuelve logs y errores del outcome", async () => {
    const c = ctx({
      runProject: async () => ({
        // se ejecutó y dio un error: `ok` es «sin errores», así que aquí es
        // false. Antes este fixture ponía `ok: true` con `errors: 1`, una
        // combinación que en la realidad no se da nunca.
        ok: false,
        ejecutado: true,
        logs: 3,
        errors: 1,
        logLines: ["log1", "log2", "log3"],
        errorLines: ["err1"],
      }),
    });
    const r = await runTool(call("run_project", {}), c);
    expect(r.ok).toBe(true);
    expect(r.content).toContain("3 logs");
    expect(r.content).toContain("1 errores");
    expect(r.content).toContain("log1");
    expect(r.content).toContain("err1");
  });
  it("avisa si no hay Sandbox disponible", async () => {
    const r = await runTool(call("run_project", {}), ctx());
    expect(r.ok).toBe(false);
    expect(r.content).toContain("No hay Sandbox");
  });
  it("pasa qa al runProject", async () => {
    let seen = false;
    const c = ctx({
      runProject: async (opts) => {
        seen = opts?.qa === true;
        return { ok: true, ejecutado: true, logs: 0, errors: 0, logLines: [], errorLines: [], qaFindings: 2 };
      },
    });
    await runTool(call("run_project", { qa: true }), c);
    expect(seen).toBe(true);
  });
});

describe("get_quota", () => {
  it("devuelve los datos si hay snapshot", async () => {
    const c = ctx({
      getQuota: () => ({
        providerId: "openai",
        modelId: "gpt-4o",
        requestsRemaining: 42,
        tokensRemaining: 1000,
      }),
    });
    const r = await runTool(call("get_quota", {}), c);
    expect(r.ok).toBe(true);
    expect(r.content).toContain("42");
    expect(r.content).toContain("1000");
  });
  it("mensaje claro si el proveedor no expone cuota", async () => {
    const c = ctx({ getQuota: () => null });
    const r = await runTool(call("get_quota", {}), c);
    expect(r.ok).toBe(true);
    expect(r.content).toContain("no expone");
  });
  it("avisa si no hay getter", async () => {
    const r = await runTool(call("get_quota", {}), ctx());
    expect(r.ok).toBe(true);
    expect(r.content).toContain("No hay datos de cuota");
  });
});

describe("herramientas desconocidas", () => {
  it("rechaza con lista de las disponibles", async () => {
    const r = await runTool(call("search_web", { q: "hola" }), ctx());
    expect(r.ok).toBe(false);
    expect(r.content).toContain("Herramienta desconocida");
    expect(r.content).toContain("read_file");
    expect(r.content).toContain("write_file");
  });
});

describe("runTools (paralelo)", () => {
  it("ejecuta varias llamadas a la vez y devuelve en orden", async () => {
    const c = ctx();
    const results = await runTools(
      [
        call("read_file", { path: "index.html" }),
        call("read_file", { path: "styles.css" }),
        call("list_files", {}),
      ],
      c
    );
    expect(results).toHaveLength(3);
    expect(results[0].content).toContain("hola");
    expect(results[1].content).toContain("color: red");
    expect(results[2].content).toContain("index.html");
  });
});
