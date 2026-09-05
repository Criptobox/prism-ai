import { describe, expect, it } from "vitest";
import {
  MEMORIA_VACIA,
  addDecision,
  addDiseno,
  addError,
  addTarea,
  aArchivosPrism,
  deArchivosPrism,
  hayPrismEn,
  leerMemoria,
  guardarMemoria,
  ultimoDiseno,
  reintentosDeModelo,
  reglasAMemoria,
  renderMemoriaParaPrompt,
} from "../../src/lib/prism/memoria-proyecto";
import { memoriaComoStorage } from "../../src/lib/prism/snapshots";

describe("operaciones de memoria", () => {
  it("addDecision añade al principio y recorta", () => {
    let m = MEMORIA_VACIA;
    for (let i = 0; i < 35; i++) m = addDecision(m, `decisión ${i}`, "usuario");
    expect(m.decisiones.length).toBe(30);
    expect(m.decisiones[0].contenido).toBe("decisión 34");
  });

  it("addDecision ignora contenido vacío", () => {
    const m = addDecision(MEMORIA_VACIA, "   ", "usuario");
    expect(m.decisiones.length).toBe(0);
  });

  it("addError marca resuelto cuando hay solución", () => {
    const m = addError(MEMORIA_VACIA, "TypeError en app.js", {
      causa: "variable no definida",
      solucion: "declarar la variable",
    });
    expect(m.errores[0].resuelto).toBe(true);
    const m2 = addError(MEMORIA_VACIA, "otro error");
    expect(m2.errores[0].resuelto).toBe(false);
  });

  it("addTarea guarda modelo y reintentos (Task DNA)", () => {
    const m = addTarea(MEMORIA_VACIA, "mejora el menú móvil", {
      modelo: "nvidia::kimi-k2",
      estado: "done",
      reintentos: 2,
      archivos: ["index.html", "styles.css"],
    });
    expect(m.tareas[0].modelo).toBe("nvidia::kimi-k2");
    expect(m.tareas[0].reintentos).toBe(2);
    expect(m.tareas[0].archivos).toEqual(["index.html", "styles.css"]);
  });

  it("addDiseno y ultimoDiseno (variación forzada)", () => {
    let m = MEMORIA_VACIA;
    expect(ultimoDiseno(m)).toBeNull();
    m = addDiseno(m, "editorial", "usada en: landing café");
    m = addDiseno(m, "brutalista", "usada en: evento");
    expect(ultimoDiseno(m)).toBe("brutalista");
  });

  it("reintentosDeModelo suma las tareas de ESE modelo", () => {
    let m = MEMORIA_VACIA;
    m = addTarea(m, "tarea 1", { modelo: "a::x", reintentos: 2 });
    m = addTarea(m, "tarea 2", { modelo: "a::x", reintentos: 3 });
    m = addTarea(m, "tarea 3", { modelo: "b::y", reintentos: 1 });
    expect(reintentosDeModelo(m, "a::x")).toBe(5);
    expect(reintentosDeModelo(m, "b::y")).toBe(1);
    expect(reintentosDeModelo(m, "c::z")).toBe(0);
  });

  it("reglasAMemoria mapea las reglas de la sesión", () => {
    const m = reglasAMemoria(MEMORIA_VACIA, [
      { patron: "Header.tsx", motivo: "no tocar" },
    ]);
    expect(m.reglas).toHaveLength(1);
    expect(m.reglas[0].patron).toBe("Header.tsx");
    expect(m.reglas[0].activa).toBe(true);
  });
});

describe("export/import .prism/", () => {
  it("aArchivosPrism solo incluye secciones con contenido", () => {
    const m = addDecision(addTarea(MEMORIA_VACIA, "t"), "d", "usuario");
    const files = aArchivosPrism(m);
    expect(Object.keys(files).sort()).toEqual([".prism/decisions.json", ".prism/tasks.json"]);
  });

  it("ida y vuelta: lo que se exporta se recupera", () => {
    const m = addDecision(
      addDiseno(
        addError(addTarea(MEMORIA_VACIA, "mejora el hero", { reintentos: 1 }), "error X", {
          solucion: "solución X",
        }),
        "minimal",
        "resumen"
      ),
      "la paleta es cálida",
      "usuario",
      "global"
    );
    const files = aArchivosPrism(m);
    const deVuelta = deArchivosPrism(files);
    expect(deVuelta.decisiones[0].contenido).toBe("la paleta es cálida");
    expect(deVuelta.errores[0].solucion).toBe("solución X");
    expect(deVuelta.tareas[0].objetivo).toBe("mejora el hero");
    expect(deVuelta.disenos[0].direccion).toBe("minimal");
  });

  it("tolera JSON corrupto y archivos ausentes", () => {
    const m = deArchivosPrism({
      ".prism/decisions.json": "{{{basura",
      "index.html": "<html></html>",
    });
    expect(m.decisiones).toEqual([]);
    expect(m.errores).toEqual([]);
  });

  it("deArchivosPrism tolera rutas con carpeta raíz (zip)", () => {
    const m = deArchivosPrism({
      "repo-main/.prism/tasks.json": JSON.stringify([
        { objetivo: "t", estado: "done", creadoEl: 1 },
      ]),
    });
    expect(m.tareas).toHaveLength(1);
  });

  it("hayPrismEn detecta la carpeta", () => {
    expect(hayPrismEn({ ".prism/tasks.json": "[]" })).toBe(true);
    expect(hayPrismEn({ "index.html": "" })).toBe(false);
  });
});

describe("persistencia", () => {
  it("guarda y lee por sesión con storage inyectado", () => {
    const st = memoriaComoStorage();
    guardarMemoria("s1", addDecision(MEMORIA_VACIA, "d1", "usuario"), st);
    guardarMemoria("s2", addDecision(MEMORIA_VACIA, "d2", "agente"), st);
    expect(leerMemoria("s1", st).decisiones[0].contenido).toBe("d1");
    expect(leerMemoria("s2", st).decisiones[0].contenido).toBe("d2");
    expect(leerMemoria("s3", st).decisiones).toEqual([]);
  });
});

describe("renderMemoriaParaPrompt", () => {
  it("sin contenido devuelve null", () => {
    expect(renderMemoriaParaPrompt(MEMORIA_VACIA)).toBeNull();
  });
  it("incluye decisiones y errores con su solución", () => {
    let m = addDecision(MEMORIA_VACIA, "paleta cálida", "usuario");
    m = addError(m, "bug del carrusel", { solucion: "usar requestAnimationFrame" });
    const t = renderMemoriaParaPrompt(m)!;
    expect(t).toMatch(/paleta cálida/);
    expect(t).toMatch(/bug del carrusel/);
    expect(t).toMatch(/requestAnimationFrame/);
  });
});
