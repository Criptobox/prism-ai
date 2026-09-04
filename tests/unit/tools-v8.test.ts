/** Prism AI — Las tres herramientas nuevas del agente (v3.40).
 *
 * `run_regression` mide su propio cambio, `snapshot_diff` dice qué se movió y
 * `ask_memory` consulta el mapa del proyecto. Lo que más se prueba aquí no es
 * que acierten: es que cuando NO pueden responder lo digan, en vez de devolver
 * un cero que parece un aprobado.
 */
import { describe, it, expect, vi } from "vitest";
import { runTool, type ToolContext, type RunOutcome } from "../../src/lib/prism/tool-runner";
import type { ToolCall } from "../../src/lib/prism/tools-catalog";
import { memoriaComoStorage, guardarSnapshot, crearSnapshot } from "../../src/lib/prism/snapshots";
import type { ProjectMap } from "../../src/lib/prism/types";
import type { QAResult } from "../../src/lib/prism/visual-qa";
import type { PermisosConcedidos } from "../../src/lib/prism/tool-permissions";
import { crearRegla } from "../../src/lib/prism/reglas-no";

const call = (name: string, args: Record<string, unknown> = {}): ToolCall => ({
  id: `c_${name}`,
  name,
  args,
});

function outcome(over: Partial<RunOutcome> = {}): RunOutcome {
  return {
    ok: true,
    ejecutado: true,
    logs: 0,
    errors: 0,
    logLines: [],
    errorLines: [],
    consola: [],
    entry: "index.html",
    htmlBytes: 1000,
    qa: null,
    ...over,
  };
}

function qa(items: string[], over: Partial<QAResult> = {}): QAResult {
  return {
    width: 390,
    ok: items.length === 0,
    at: Date.now(),
    items: items.map((detalle) => ({ tipo: "scroll" as const, detalle })),
    ...over,
  };
}

/** Un `runProject` que devuelve, en orden, las ejecuciones que se le den. */
function ejecutorEncadenado(...salidas: RunOutcome[]) {
  let i = 0;
  return async () => salidas[Math.min(i++, salidas.length - 1)];
}

/* ------------------------------------------------------------------ */

describe("run_regression", () => {
  it("sin Sandbox lo dice en vez de fingir una medida", async () => {
    const r = await runTool(call("run_regression"), { projectFiles: {} });
    expect(r.ok).toBe(false);
    expect(r.content).toContain("No hay Sandbox");
  });

  it("la PRIMERA vez no compara: guarda la referencia y explica qué hacer", async () => {
    const ctx: ToolContext = {
      projectFiles: {},
      runProject: ejecutorEncadenado(outcome()),
    };
    const r = await runTool(call("run_regression"), ctx);
    expect(r.ok).toBe(true);
    expect(r.content).toContain("NO hay comparación");
    expect(r.content).toContain("vuelve a llamar");
    // la referencia queda guardada para la siguiente
    expect(ctx.lastRun?.entry).toBe("index.html");
  });

  it("la segunda vez compara y dice qué se rompió", async () => {
    const ctx: ToolContext = {
      projectFiles: {},
      runProject: ejecutorEncadenado(
        outcome(),
        outcome({ consola: [{ level: "error", text: "x is not defined" }], errors: 1 })
      ),
    };
    await runTool(call("run_regression"), ctx);
    const r = await runTool(call("run_regression"), ctx);
    expect(r.content).toContain("rompió");
    expect(r.content).toContain("x is not defined");
  });

  it("dice qué arregló el cambio", async () => {
    const ctx: ToolContext = {
      projectFiles: {},
      runProject: ejecutorEncadenado(
        outcome({ consola: [{ level: "error", text: "falta cerrar div" }], errors: 1 }),
        outcome()
      ),
    };
    await runTool(call("run_regression"), ctx);
    const r = await runTool(call("run_regression"), ctx);
    expect(r.content).toContain("arregló");
    expect(r.content).toContain("falta cerrar div");
  });

  it("una ejecución anterior de OTRA página no se compara", async () => {
    const ctx: ToolContext = {
      projectFiles: {},
      runProject: ejecutorEncadenado(
        outcome({ entry: "index.html" }),
        outcome({ entry: "otra.html" })
      ),
    };
    await runTool(call("run_regression"), ctx);
    const r = await runTool(call("run_regression"), ctx);
    expect(r.content).toContain("Son páginas distintas");
  });

  it("una ejecución de run_project sirve de referencia para la siguiente medida", async () => {
    // El flujo natural del agente: ejecuto, edito, mido. Sin esto el modelo
    // tenía que llamar dos veces a run_regression para conseguir un «antes».
    const ctx: ToolContext = {
      projectFiles: {},
      runProject: ejecutorEncadenado(
        outcome({ consola: [{ level: "error", text: "roto" }], errors: 1 }),
        outcome()
      ),
    };
    await runTool(call("run_project"), ctx);
    const r = await runTool(call("run_regression"), ctx);
    expect(r.content).toContain("arregló");
  });

  it("sin QA en los dos lados NO dice «sin cambios»: dice que no se comparó", async () => {
    const ctx: ToolContext = {
      projectFiles: {},
      runProject: ejecutorEncadenado(outcome({ qa: null }), outcome({ qa: qa(["ancho 420px"]) })),
    };
    await runTool(call("run_regression"), ctx);
    const r = await runTool(call("run_regression"), ctx);
    expect(r.content).toContain("QA móvil: sin comparación");
  });

  it("compara el QA cuando el medidor respondió en las dos", async () => {
    const ctx: ToolContext = {
      projectFiles: {},
      runProject: ejecutorEncadenado(
        outcome({ qa: qa(["ancho 420px"]) }),
        outcome({ qa: qa([]) })
      ),
    };
    await runTool(call("run_regression"), ctx);
    const r = await runTool(call("run_regression"), ctx);
    expect(r.content).toContain("QA móvil mejoró");
  });

  it("informa del peso con su signo", async () => {
    const ctx: ToolContext = {
      projectFiles: {},
      runProject: ejecutorEncadenado(outcome({ htmlBytes: 1000 }), outcome({ htmlBytes: 1240 })),
    };
    await runTool(call("run_regression"), ctx);
    const r = await runTool(call("run_regression"), ctx);
    expect(r.content).toContain("+240 bytes");
  });

  it("si el proyecto no llega a ejecutarse, no hay comparación que valga", async () => {
    const ctx: ToolContext = {
      projectFiles: {},
      runProject: async () =>
        outcome({ ejecutado: false, reason: "El proyecto no tiene archivos." }),
    };
    const r = await runTool(call("run_regression"), ctx);
    expect(r.content).toContain("no tiene archivos");
  });
});

/* ------------------------------------------------------------------ */

describe("snapshot_diff", () => {
  /** Dos puntos de restauración reales, con los ids que de verdad genera
   * `crearSnapshot` (derivados de la fecha, NO «s1»/«s2»). */
  function conSnapshots() {
    const st = memoriaComoStorage();
    const a = crearSnapshot({ "index.html": "1\n2\n3\n" }, "inicio", 1_000)!;
    const b = crearSnapshot(
      { "index.html": "1\n2\n3\n", "estilos.css": "body{}\n" },
      "con estilos",
      2_000
    )!;
    guardarSnapshot(a, st);
    guardarSnapshot(b, st);
    return { st, a, b };
  }

  it("los ids NO son «s1»: el catálogo no debe prometer un formato adivinable", () => {
    const { a } = conSnapshots();
    expect(a.id).not.toBe("s1");
    expect(a.id).toMatch(/^s[0-9a-z]+$/);
  });

  it("compara un punto de restauración con el proyecto ACTUAL cuando falta «b»", async () => {
    const { st, a } = conSnapshots();
    const r = await runTool(call("snapshot_diff", { a: a.id }), {
      projectFiles: { "index.html": "1\n2\n3\n4\n" },
      snapshotStorage: st,
    });
    expect(r.ok).toBe(true);
    expect(r.content).toContain("el proyecto actual");
    expect(r.content).toContain("+1");
  });

  it("compara dos puntos entre sí cuando se dan los dos", async () => {
    const { st, a, b } = conSnapshots();
    const r = await runTool(call("snapshot_diff", { a: a.id, b: b.id }), {
      projectFiles: {},
      snapshotStorage: st,
    });
    expect(r.content).toContain("estilos.css");
    expect(r.content).toContain("1 nuevo(s)");
  });

  it("un id que no existe se dice, con la lista de los que sí", async () => {
    const { st, a } = conSnapshots();
    const r = await runTool(call("snapshot_diff", { a: "s1" }), {
      projectFiles: {},
      snapshotStorage: st,
    });
    expect(r.ok).toBe(false);
    expect(r.content).toContain("No existe");
    // el error trae los ids REALES: es lo que salva al modelo de adivinar
    expect(r.content).toContain(a.id);
    expect(r.content).toContain("inicio");
  });

  it("sin ningún punto guardado se dice cómo crearlo", async () => {
    const r = await runTool(call("snapshot_diff", { a: "s1" }), {
      projectFiles: {},
      snapshotStorage: memoriaComoStorage(),
    });
    expect(r.ok).toBe(false);
    expect(r.content).toContain("git_snapshot");
  });

  it("falta «a» → error de argumento", async () => {
    const r = await runTool(call("snapshot_diff", {}), { projectFiles: {} });
    expect(r.ok).toBe(false);
    expect(r.content).toContain("a");
  });
});

/* ------------------------------------------------------------------ */

describe("ask_memory", () => {
  const map: ProjectMap = {
    name: "Cafetería Prima",
    description: "Landing de cafetería",
    files: [{ name: "index.html", kind: "html", summary: "Portada con precios" }],
    features: ["formulario de contacto"],
    notes: ["el gradiente del hero se descartó"],
    updatedAt: 0,
  };

  it("responde con la nota que guarda la decisión", async () => {
    const r = await runTool(call("ask_memory", { q: "qué pasó con el gradiente" }), {
      projectFiles: {},
      projectMap: map,
    });
    expect(r.ok).toBe(true);
    expect(r.content).toContain("se descartó");
    expect(r.content).toContain("decisión del usuario");
  });

  it("sin mapa dice que no hay mapa, no que no encontró nada", async () => {
    // Son cosas distintas y el modelo actúa distinto según cuál sea.
    const r = await runTool(call("ask_memory", { q: "colores" }), { projectFiles: {} });
    expect(r.ok).toBe(true);
    expect(r.content).toContain("Todavía no hay mapa");
  });

  it("con mapa pero sin coincidencia lo dice sin inventarse una respuesta", async () => {
    const r = await runTool(call("ask_memory", { q: "criptomonedas" }), {
      projectFiles: {},
      projectMap: map,
    });
    expect(r.content).toContain("No hay nada en el mapa");
    expect(r.content).toContain("criptomonedas");
  });

  it("respeta el límite pedido", async () => {
    const muchas = { ...map, notes: Array.from({ length: 9 }, (_, i) => `nota ${i} del hero`) };
    const r = await runTool(call("ask_memory", { q: "hero", limit: 2 }), {
      projectFiles: {},
      projectMap: muchas,
    });
    expect(r.content).toContain("2 resultado(s)");
  });

  it("falta «q» → error de argumento", async () => {
    const r = await runTool(call("ask_memory", {}), { projectFiles: {}, projectMap: map });
    expect(r.ok).toBe(false);
    expect(r.content).toContain("q");
  });
});

/* ------------------------------------------------------------------ */

describe("permisos: el runner los HACE CUMPLIR", () => {
  const todo = (v: boolean): PermisosConcedidos => ({
    lee_proyecto: v,
    escribe_proyecto: v,
    ejecuta: v,
    red: v,
  });

  it("con «red» apagada, read_url no llega ni a pedir la página", async () => {
    // Lo que se comprueba no es el mensaje: es que el `fetch` NO ocurre.
    // Un permiso que rechaza después de la petición no es un permiso.
    const fetchMock = vi.fn(async () => new Response("<p>hola</p>"));
    vi.stubGlobal("fetch", fetchMock);
    const r = await runTool(call("read_url", { url: "https://ejemplo.org" }), {
      projectFiles: {},
      permisos: { ...todo(true), red: false },
    });
    expect(r.ok).toBe(false);
    expect(fetchMock, "se salió a internet con el permiso apagado").not.toHaveBeenCalled();
    expect(r.content).toContain("Salir a internet");
    vi.unstubAllGlobals();
  });

  it("con «escribir» apagado, write_file no toca los archivos", async () => {
    const ctx: ToolContext = {
      projectFiles: { "index.html": "original" },
      permisos: { ...todo(true), escribe_proyecto: false },
    };
    const r = await runTool(
      call("write_file", { path: "index.html", content: "pisoteado" }),
      ctx
    );
    expect(r.ok).toBe(false);
    expect(ctx.projectFiles["index.html"], "el archivo se escribió igualmente").toBe("original");
  });

  it("con «ejecutar» apagado, run_project no ejecuta nada", async () => {
    const ejecutar = vi.fn(async () => outcome());
    const r = await runTool(call("run_project"), {
      projectFiles: {},
      permisos: { ...todo(true), ejecuta: false },
      runProject: ejecutar,
    });
    expect(r.ok).toBe(false);
    expect(ejecutar).not.toHaveBeenCalled();
  });

  it("rechaza aunque el modelo pida una herramienta que NO se le ofreció", async () => {
    // El catálogo filtrado es la primera capa; esta es la que manda. Un modelo
    // puede inventarse la llamada o arrastrarla de un turno anterior.
    const r = await runTool(call("search_web", { q: "lo que sea" }), {
      projectFiles: {},
      permisos: todo(false),
    });
    expect(r.ok).toBe(false);
    expect(r.content).toMatch(/no lo vuelvas a intentar/i);
  });

  it("lo permitido sigue funcionando igual", async () => {
    const r = await runTool(call("list_files"), {
      projectFiles: { "index.html": "x" },
      permisos: { lee_proyecto: true, escribe_proyecto: false, ejecuta: false, red: false },
    });
    expect(r.ok).toBe(true);
    expect(r.content).toContain("index.html");
  });

  it("sin permisos en el contexto se aplican los de por defecto (todo concedido)", async () => {
    // Un contexto viejo o un test no deben quedarse sin agente, pero tampoco
    // saltarse la comprobación: pasan la de por defecto.
    const r = await runTool(call("list_files"), { projectFiles: { "a.txt": "x" } });
    expect(r.ok).toBe(true);
  });
});

/* ------------------------------------------------------------------ */

describe("memoria negativa: el runner la HACE CUMPLIR", () => {
  const regla = crearRegla("Header.tsx", "el diseño lo aprobó el cliente", 1);
  const conRegla = (files: Record<string, string>): ToolContext => ({
    projectFiles: files,
    reglasNo: [regla],
  });

  it("write_file no toca el archivo protegido", async () => {
    const ctx = conRegla({ "src/Header.tsx": "original" });
    const r = await runTool(
      call("write_file", { path: "src/Header.tsx", content: "pisoteado" }),
      ctx
    );
    expect(r.ok).toBe(false);
    expect(ctx.projectFiles["src/Header.tsx"], "se escribió igualmente").toBe("original");
    expect(r.content).toContain("el diseño lo aprobó el cliente");
  });

  it("edit_file tampoco: no vale buscar la vuelta con otra herramienta", async () => {
    const ctx = conRegla({ "src/Header.tsx": "hola mundo" });
    const r = await runTool(
      call("edit_file", { path: "src/Header.tsx", find: "hola", replace: "adiós" }),
      ctx
    );
    expect(r.ok).toBe(false);
    expect(ctx.projectFiles["src/Header.tsx"]).toBe("hola mundo");
    expect(r.content).toMatch(/no lo intentes por otra vía/i);
  });

  it("lo NO protegido se escribe con normalidad", async () => {
    const ctx = conRegla({ "src/Footer.tsx": "original" });
    const r = await runTool(
      call("write_file", { path: "src/Footer.tsx", content: "nuevo" }),
      ctx
    );
    expect(r.ok).toBe(true);
    expect(ctx.projectFiles["src/Footer.tsx"]).toBe("nuevo");
  });

  it("sin reglas, todo sigue como estaba", async () => {
    const ctx: ToolContext = { projectFiles: { "src/Header.tsx": "original" } };
    const r = await runTool(
      call("write_file", { path: "src/Header.tsx", content: "nuevo" }),
      ctx
    );
    expect(r.ok).toBe(true);
  });

  it("restaurar un snapshot que cambiaría el archivo protegido se cancela ENTERO", async () => {
    // Restaurar descarta lo hecho después, así que puede llevarse por delante
    // un archivo protegido sin nombrarlo nunca. Y si se cancela, no puede
    // dejar el proyecto a medias.
    const st = memoriaComoStorage();
    const viejo = crearSnapshot(
      { "src/Header.tsx": "версия vieja", "src/App.tsx": "app vieja" },
      "antes",
      1_000
    )!;
    guardarSnapshot(viejo, st);
    const ctx: ToolContext = {
      projectFiles: { "src/Header.tsx": "actual", "src/App.tsx": "app actual" },
      snapshotStorage: st,
      reglasNo: [regla],
    };
    const r = await runTool(call("git_snapshot", { action: "restore", id: viejo.id }), ctx);
    expect(r.ok).toBe(false);
    expect(r.content).toContain("se cancela");
    expect(ctx.projectFiles["src/Header.tsx"], "no se tocó").toBe("actual");
    expect(ctx.projectFiles["src/App.tsx"], "ni a medias").toBe("app actual");
  });

  it("restaurar SÍ va si el archivo protegido no cambiaría", async () => {
    // Bloquear un restore que deja el archivo igual sería bloquear por bloquear.
    const st = memoriaComoStorage();
    const snap = crearSnapshot(
      { "src/Header.tsx": "igual", "src/App.tsx": "app vieja" },
      "antes",
      2_000
    )!;
    guardarSnapshot(snap, st);
    const ctx: ToolContext = {
      projectFiles: { "src/Header.tsx": "igual", "src/App.tsx": "app nueva" },
      snapshotStorage: st,
      reglasNo: [regla],
    };
    const r = await runTool(call("git_snapshot", { action: "restore", id: snap.id }), ctx);
    expect(r.ok).toBe(true);
    expect(ctx.projectFiles["src/App.tsx"]).toBe("app vieja");
  });

  it("un patrón con comodín protege lo que dice", async () => {
    const ctx: ToolContext = {
      projectFiles: { "src/api/pagos.ts": "x", "src/ui/boton.ts": "y" },
      reglasNo: [crearRegla("src/api/*", "toca producción", 3)],
    };
    expect((await runTool(call("write_file", { path: "src/api/pagos.ts", content: "z" }), ctx)).ok).toBe(false);
    expect((await runTool(call("write_file", { path: "src/ui/boton.ts", content: "z" }), ctx)).ok).toBe(true);
  });
});
