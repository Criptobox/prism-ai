import { describe, expect, it } from "vitest";
import {
  ETIQUETA_TAREA,
  encargoQueMasGasta,
  filasDeGasto,
  parteDe,
  tareasConModelos,
  sinClasificarDe,
  soloDePago,
  tokensAprox,
  totalDe,
} from "../../src/lib/prism/gasto-modelos";
import type { ModelUsage } from "../../src/lib/prism/usage";

const nombre = (id: string) => ({ gemini: "Google Gemini", openai: "OpenAI" })[id] ?? id;

function uso(over: Partial<ModelUsage> = {}): ModelUsage {
  return {
    requests: 0,
    ok: 0,
    fail: 0,
    totalMs: 0,
    ms: [],
    charsIn: 0,
    charsOut: 0,
    savedChars: 0,
    lastUsed: 0,
    ...over,
  };
}

describe("tokensAprox", () => {
  it("son caracteres entre cuatro, y nunca negativo", () => {
    expect(tokensAprox(400)).toBe(100);
    expect(tokensAprox(0)).toBe(0);
    expect(tokensAprox(-50)).toBe(0);
  });
});

describe("filasDeGasto", () => {
  it("marca de pago lo que no tiene capa gratuita conocida", () => {
    const filas = filasDeGasto(
      {
        "openai::gpt-5": uso({ requests: 3, ok: 3, charsIn: 900 }),
        "gemini::gemini-3-flash": uso({ requests: 9, ok: 9, charsIn: 4000 }),
      },
      nombre
    );
    const openai = filas.find((f) => f.providerId === "openai");
    const gemini = filas.find((f) => f.providerId === "gemini");
    expect(openai?.dePago).toBe(true);
    // Gemini tiene capa gratuita completa: no es lo que preocupa en la factura
    expect(gemini?.dePago).toBe(false);
  });

  it("pone primero lo que cuesta dinero, aunque tenga menos llamadas", () => {
    const filas = filasDeGasto(
      {
        "gemini::gemini-3-flash": uso({ requests: 40, charsIn: 90_000 }),
        "openai::gpt-5": uso({ requests: 1, charsIn: 100 }),
      },
      nombre
    );
    expect(filas[0].providerId).toBe("openai");
  });

  it("da el nombre del proveedor con la función que se le pasa", () => {
    const filas = filasDeGasto({ "openai::gpt-5": uso({ requests: 1 }) }, nombre);
    expect(filas[0].proveedor).toBe("OpenAI");
  });

  it("ignora claves que no son «proveedor::modelo»", () => {
    expect(filasDeGasto({ basura: uso({ requests: 5 }) }, nombre)).toHaveLength(0);
  });

  it("cuenta como «sin clasificar» lo registrado antes de guardar la tarea", () => {
    const filas = filasDeGasto(
      {
        "openai::gpt-5": uso({
          requests: 10,
          charsIn: 1000,
          porTarea: { code: { llamadas: 4, ok: 4, charsIn: 400, charsOut: 200, totalMs: 0 } },
        }),
      },
      nombre
    );
    expect(filas[0].sinClasificar).toBe(6);
    expect(filas[0].tareas).toHaveLength(1);
  });

  it("nunca da un «sin clasificar» negativo aunque los números no cuadren", () => {
    const filas = filasDeGasto(
      {
        "openai::gpt-5": uso({
          requests: 1,
          porTarea: { code: { llamadas: 5, ok: 5, charsIn: 10, charsOut: 10, totalMs: 0 } },
        }),
      },
      nombre
    );
    expect(filas[0].sinClasificar).toBe(0);
  });

  it("ordena los encargos de un modelo por lo que más contexto se llevó", () => {
    const filas = filasDeGasto(
      {
        "openai::gpt-5": uso({
          requests: 6,
          charsIn: 6000,
          porTarea: {
            chat: { llamadas: 4, ok: 4, charsIn: 400, charsOut: 100, totalMs: 0 },
            web: { llamadas: 2, ok: 2, charsIn: 5600, charsOut: 900, totalMs: 0 },
          },
        }),
      },
      nombre
    );
    expect(filas[0].tareas.map((t) => t.tarea)).toEqual(["web", "chat"]);
    expect(filas[0].tareas[0].etiqueta).toBe(ETIQUETA_TAREA.web);
  });

  it("descarta encargos con cero llamadas en vez de pintarlos a cero", () => {
    const filas = filasDeGasto(
      {
        "openai::gpt-5": uso({
          requests: 1,
          porTarea: {
            code: { llamadas: 1, ok: 1, charsIn: 10, charsOut: 5, totalMs: 0 },
            data: { llamadas: 0, ok: 0, charsIn: 0, charsOut: 0, totalMs: 0 },
          },
        }),
      },
      nombre
    );
    expect(filas[0].tareas.map((t) => t.tarea)).toEqual(["code"]);
  });
});

describe("soloDePago / totalDe", () => {
  const filas = filasDeGasto(
    {
      "openai::gpt-5": uso({ requests: 3, ok: 2, fail: 1, charsIn: 900, charsOut: 300 }),
      "openai::gpt-5-mini": uso({ requests: 2, ok: 2, charsIn: 100, charsOut: 50 }),
      "gemini::gemini-3-flash": uso({ requests: 9, ok: 9, charsIn: 4000 }),
    },
    nombre
  );

  it("deja fuera lo gratis", () => {
    expect(soloDePago(filas).map((f) => f.modelId).sort()).toEqual(["gpt-5", "gpt-5-mini"]);
  });

  it("suma solo lo que se le pasa", () => {
    const t = totalDe(soloDePago(filas));
    expect(t).toEqual({ modelos: 2, llamadas: 5, charsIn: 1000, charsOut: 350 });
  });

  it("una lista vacía suma cero, no «sin dato»", () => {
    expect(totalDe([])).toEqual({ modelos: 0, llamadas: 0, charsIn: 0, charsOut: 0 });
  });
});

describe("tareasConModelos", () => {
  const filas = filasDeGasto(
    {
      "openai::gpt-5": uso({
        requests: 3,
        charsIn: 3000,
        porTarea: {
          web: { llamadas: 2, ok: 2, charsIn: 2000, charsOut: 500, totalMs: 0 },
          chat: { llamadas: 1, ok: 1, charsIn: 1000, charsOut: 100, totalMs: 0 },
        },
      }),
      "openai::gpt-5-mini": uso({
        requests: 2,
        charsIn: 800,
        porTarea: { web: { llamadas: 2, ok: 2, charsIn: 800, charsOut: 90, totalMs: 0 } },
      }),
    },
    nombre
  );

  it("junta el mismo encargo de varios modelos", () => {
    const r = tareasConModelos(filas);
    const web = r.find((t) => t.tarea === "web");
    expect(web?.llamadas).toBe(4);
    expect(web?.charsIn).toBe(2800);
    expect(web?.charsOut).toBe(590);
  });

  it("no muta las filas de origen al sumar", () => {
    tareasConModelos(filas);
    tareasConModelos(filas);
    expect(tareasConModelos(filas).find((t) => t.tarea === "web")?.llamadas).toBe(4);
  });

  it("dentro de cada encargo dice QUÉ modelo lo hizo, de más a menos", () => {
    const web = tareasConModelos(filas).find((t) => t.tarea === "web");
    expect(web?.modelos.map((m) => m.modelId)).toEqual(["gpt-5", "gpt-5-mini"]);
    expect(web?.modelos[0].llamadas).toBe(2);
    expect(web?.modelos[1].charsIn).toBe(800);
  });

  it("un encargo que solo hizo un modelo no lista a los demás", () => {
    const chat = tareasConModelos(filas).find((t) => t.tarea === "chat");
    expect(chat?.modelos).toHaveLength(1);
    expect(chat?.modelos[0].modelId).toBe("gpt-5");
  });

  it("el primero es en el que más contexto se va", () => {
    expect(encargoQueMasGasta(tareasConModelos(filas))?.tarea).toBe("web");
  });

  it("sin nada clasificado no inventa un ganador", () => {
    expect(encargoQueMasGasta([])).toBeNull();
  });
});

describe("parteDe", () => {
  it("redondea a porcentaje", () => {
    expect(parteDe(25, 100)).toBe(25);
    expect(parteDe(1, 3)).toBe(33);
  });

  it("con total cero devuelve null: un 0 % sin denominador se lee como medido", () => {
    expect(parteDe(0, 0)).toBeNull();
    expect(parteDe(5, 0)).toBeNull();
  });

  it("con números que no son números tampoco inventa", () => {
    expect(parteDe(NaN, 10)).toBeNull();
    expect(parteDe(10, NaN)).toBeNull();
  });
});

describe("sinClasificarDe", () => {
  it("suma lo que no se puede atribuir a ningún encargo", () => {
    const filas = filasDeGasto(
      {
        "openai::gpt-5": uso({ requests: 10, porTarea: { code: { llamadas: 4, ok: 4, charsIn: 1, charsOut: 1, totalMs: 0 } } }),
        "openai::gpt-5-mini": uso({ requests: 3 }),
      },
      nombre
    );
    expect(sinClasificarDe(filas)).toBe(9);
  });
});
