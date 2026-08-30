import { describe, expect, it } from "vitest";
import {
  LIMITE_BLOQUE,
  LIMITE_MODO,
  MODOS_AGENTE,
  costeDeModos,
  modoPorId,
  textoDeModos,
} from "../../src/lib/prism/agent-modes";

const TODOS = MODOS_AGENTE.map((m) => m.id);

describe("los modos caben en un modelo gratis", () => {
  it.each(MODOS_AGENTE)("«$nombre» no se pasa de largo", (m) => {
    // Prism apunta a modelos de ventana corta: un modo que engorda deja de ser
    // útil justo donde se escribió para usarse.
    expect(m.texto.length, `${m.id} ocupa ${m.texto.length}`).toBeLessThanOrEqual(LIMITE_MODO);
  });

  it("los cuatro a la vez siguen cabiendo", () => {
    expect(costeDeModos(TODOS)).toBeLessThanOrEqual(LIMITE_BLOQUE);
  });
});

describe("cada modo está bien formado", () => {
  it("todos llevan cabecera con su nombre entre corchetes", () => {
    for (const m of MODOS_AGENTE) {
      expect(m.texto.startsWith("[Modo: "), `${m.id} sin cabecera`).toBe(true);
    }
  });

  it("todos dicen algo que NO hacer, no solo qué hacer", () => {
    // Es la mitad que falta en casi todos los prompts caseros, y la que más
    // cambia el resultado.
    for (const m of MODOS_AGENTE) {
      expect(m.texto, `${m.id} no prohíbe nada`).toMatch(/\bNO\b|Prohibido|No te|No sigas|No repitas|No anuncies/);
    }
  });

  it("los ids no se repiten", () => {
    expect(new Set(TODOS).size).toBe(TODOS.length);
  });

  it("cada uno tiene nombre y resumen para la interfaz", () => {
    for (const m of MODOS_AGENTE) {
      expect(m.nombre.length).toBeGreaterThan(2);
      expect(m.resumen.length).toBeGreaterThan(10);
    }
  });
});

describe("textoDeModos", () => {
  it("sin modos, no añade nada", () => {
    expect(textoDeModos([])).toBe("");
    expect(costeDeModos([])).toBe(0);
  });

  it("un id que no existe se ignora en vez de romper", () => {
    expect(textoDeModos(["no-existe"])).toBe("");
    expect(textoDeModos(["no-existe", "sin-inventar"])).toBe(modoPorId("sin-inventar")!.texto);
  });

  it("manda el orden del catálogo, no el de selección", () => {
    // Si el orden bailara, dos pruebas de la Arena con los mismos modos no
    // serían comparables: el prompt sería distinto.
    expect(textoDeModos(["con-freno", "sin-inventar"])).toBe(
      textoDeModos(["sin-inventar", "con-freno"])
    );
  });

  it("los separa para que no se peguen dos cabeceras", () => {
    const t = textoDeModos(["sin-inventar", "cambio-minimo"]);
    expect(t).toContain("\n\n[Modo: cambio mínimo]");
  });

  it("no se repite un modo aunque venga dos veces", () => {
    expect(textoDeModos(["sin-inventar", "sin-inventar"])).toBe(textoDeModos(["sin-inventar"]));
  });
});

describe("modoPorId", () => {
  it("encuentra el que hay", () => {
    expect(modoPorId("archivos-completos")?.nombre).toBe("Archivos completos");
  });
  it("y devuelve undefined con el que no", () => {
    expect(modoPorId("inventado")).toBeUndefined();
  });
});
