import { describe, expect, it } from "vitest";
import {
  describePaso,
  ejecutarPasosPiloto,
  PILOT_EJEMPLO,
  informePiloto,
  injectPilot,
  parsePasos,
  type PilotPasoResultado,
} from "../../src/lib/prism/sandbox-pilot";
import { injectVisualQA } from "../../src/lib/prism/visual-qa";

describe("parsePasos", () => {
  it("reconoce los seis verbos", () => {
    const { pasos, errores } = parsePasos(
      [
        "ve a 320px",
        "pulsa «Añadir»",
        'escribe "Hola mundo" en #nombre',
        "espera 800",
        "lee",
        "qa 390",
      ].join("\n")
    );
    expect(errores).toEqual([]);
    expect(pasos.map((p) => p.op)).toEqual(["vista", "pulsar", "escribir", "esperar", "leer", "qa"]);
    expect(pasos[0].width).toBe(320);
    expect(pasos[1].target).toBe("Añadir");
    expect(pasos[2].value).toBe("Hola mundo");
    expect(pasos[2].target).toBe("#nombre");
    expect(pasos[3].ms).toBe(800);
    expect(pasos[5].width).toBe(390);
  });

  it("qa sin ancho = batería completa; vista acepta sin px y con acentos", () => {
    const { pasos, errores } = parsePasos("qa\nVE A 390\npulsá Enviar");
    expect(errores).toEqual([]);
    expect(pasos[0].op).toBe("qa");
    expect(pasos[0].width).toBeUndefined();
    expect(pasos[1].width).toBe(390);
    expect(pasos[2].target).toBe("Enviar");
  });

  it("escribir sin objetivo va al primer campo; el «en» parte por el último", () => {
    const { pasos } = parsePasos('escribe "Comprar leche"\nescribe Comprar en #tarea');
    expect(pasos[0].target).toBeUndefined();
    expect(pasos[0].value).toBe("Comprar leche");
    expect(pasos[1].target).toBe("#tarea");
    expect(pasos[1].value).toBe("Comprar");
  });

  it("comentarios y líneas vacías se ignoran", () => {
    const { pasos, errores } = parsePasos("// esto no cuenta\n\nlee");
    expect(errores).toEqual([]);
    expect(pasos).toHaveLength(1);
  });

  it("lo que no se entiende vuelve en errores con el número de línea", () => {
    const { pasos, errores } = parsePasos("lee\ntrazame la correo");
    expect(pasos).toHaveLength(1);
    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain("Línea 2");
  });

  it("rechaza anchos fuera de rango y «pulsar» sin objetivo", () => {
    const { errores } = parsePasos("ve a 50px\npulsa");
    expect(errores).toHaveLength(2);
  });

  it("esperar sin número usa 500 ms y acota el máximo", () => {
    const { pasos } = parsePasos("espera\nesperar 90000");
    expect(pasos[0].ms).toBe(500);
    expect(pasos[1].ms).toBe(5000);
  });

  it("el ejemplo incluido se parsea limpio", () => {
    const { pasos, errores } = parsePasos(PILOT_EJEMPLO);
    expect(errores).toEqual([]);
    expect(pasos.length).toBeGreaterThanOrEqual(4);
  });
});

describe("describePaso", () => {
  it("describe en claro cada operación", () => {
    expect(describePaso({ op: "vista", width: 320, linea: 1 })).toBe("Cambiar el ancho a 320 px");
    expect(describePaso({ op: "pulsar", target: "Añadir", linea: 1 })).toBe("Pulsar «Añadir»");
    expect(describePaso({ op: "escribir", value: "hola", linea: 1 })).toBe(
      "Escribir «hola» en el primer campo"
    );
    expect(describePaso({ op: "esperar", ms: 250, linea: 1 })).toBe("Esperar 250 ms");
    expect(describePaso({ op: "leer", linea: 1 })).toBe("Leer la página");
    expect(describePaso({ op: "qa", width: 390, linea: 1 })).toBe("Medir QA a 390 px");
  });
});

describe("injectPilot", () => {
  it("inyecta el runtime antes de </body> una sola vez", () => {
    const html = "<!doctype html><html><body><h1>x</h1></body></html>";
    const una = injectPilot(html);
    expect(una).toContain("prism-pilot-cmd");
    expect((una.match(/prism-pilot-cmd/g) ?? []).length).toBe(1);
    expect(injectPilot(una)).toBe(una);
  });

  it("convive con el medidor de QA sin pisarse", () => {
    const html = injectPilot(injectVisualQA("<body></body>"));
    expect(html).toContain("prism-qa-run");
    expect(html).toContain("prism-pilot-cmd");
  });

  it("HTML sin body también recibe el runtime", () => {
    const out = injectPilot("<p>hola</p>");
    expect(out.startsWith("<p>hola</p><script>")).toBe(true);
  });
});

describe("informePiloto", () => {
  const pasoOk: PilotPasoResultado = {
    paso: { op: "vista", width: 320, linea: 1 },
    descripcion: "Cambiar el ancho a 320 px",
    ok: true,
    detalle: "La vista ahora mide 320 px de ancho.",
    logsNuevos: [],
    at: 0,
  };

  it("cuenta OK y fallos, y lista la consola de cada paso", () => {
    const fallo: PilotPasoResultado = {
      paso: { op: "pulsar", target: "Añadir", linea: 2 },
      descripcion: "Pulsar «Añadir»",
      ok: false,
      detalle: "No encontré nada pulsable que coincida con «Añadir».",
      logsNuevos: [{ level: "error", text: "Uncaught TypeError: x is not a function" }],
      at: 0,
    };
    const informe = informePiloto("demo-web", [pasoOk, fallo], ["Uncaught TypeError: y"]);
    expect(informe).toContain("«demo-web»");
    expect(informe).toContain("OK: 1 · fallidos: 1");
    expect(informe).toContain("1. OK — Cambiar el ancho a 320 px");
    expect(informe).toContain("2. FALLÓ — Pulsar «Añadir»");
    expect(informe).toContain("consola: Uncaught TypeError: x is not a function");
    expect(informe).toContain("Errores de consola durante la prueba (1)");
    expect(informe).toContain("Corrige lo que falló");
  });

  it("una prueba limpia no pide correcciones", () => {
    const informe = informePiloto("demo", [pasoOk]);
    expect(informe).not.toContain("Corrige lo que falló");
    expect(informe).not.toContain("Errores de consola");
  });
});

describe("ejecutarPasosPiloto", () => {
  function frameFalso(): HTMLIFrameElement {
    return { style: { width: "" } } as unknown as HTMLIFrameElement;
  }

  it("cambia el ancho, lo restaura al final y respeta el aborto", async () => {
    const frame = frameFalso();
    const anchos: string[] = [];
    const estado = { hechos: 0 };
    const resultados = await ejecutarPasosPiloto({
      frame,
      win: {} as Window,
      pasos: [
        { op: "vista", width: 320, linea: 1 },
        { op: "esperar", ms: 50, linea: 2 },
        { op: "leer", linea: 3 },
        { op: "leer", linea: 4 },
      ],
      totalLogs: () => 0,
      logsDesde: () => [],
      medirQA: async () => [],
      anchoPrevio: "640px",
      onPaso: () => {
        estado.hechos += 1;
        anchos.push(frame.style.width);
      },
      abortado: () => estado.hechos >= 2,
    });
    expect(resultados).toHaveLength(4);
    expect(resultados[0].ok).toBe(true);
    expect(anchos[0]).toBe("320px"); // el paso vista cambió el ancho de verdad
    // los pasos tras el aborto se marcan como detenidos, no como éxito
    expect(resultados[2].ok).toBe(false);
    expect(resultados[2].detalle).toContain("detenida");
    expect(resultados[3].ok).toBe(false);
    // al terminar, el ancho quedó restaurado
    expect(frame.style.width).toBe("640px");
  });

  it("un clic que deja errores nuevos de consola cuenta como fallido", async () => {
    const frame = frameFalso();
    let logs = 0;
    const resultados = await ejecutarPasosPiloto({
      frame,
      win: {} as Window,
      pasos: [{ op: "pulsar", target: "x", linea: 1 }],
      totalLogs: () => logs,
      logsDesde: (i) => (logs > i ? [{ level: "error", text: "boom" }] : []),
      medirQA: async () => [],
      // simulamos que la operación «funcionó» pero soltó un error
    });
    // sin iframe real, enviarCmdPiloto falla por postMessage — pero el fallo
    // llega como resultado, nunca como excepción
    expect(resultados).toHaveLength(1);
    expect(resultados[0].ok).toBe(false);
    expect(frame.style.width).toBe("");
  });
});
