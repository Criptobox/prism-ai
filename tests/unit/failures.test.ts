import { describe, expect, it, beforeEach } from "vitest";
import {
  caducaEn,
  reglasActivas,
  reglaFromDiagnostico,
  renderReglasPrompt,
  useFailures,
  type FailureEntry,
} from "../../src/lib/prism/failures";

const DAY = 86_400_000;

const reset = () => useFailures.setState({ entries: [] });

const entrada = (over: Partial<FailureEntry>): FailureEntry => ({
  id: Math.random().toString(36).slice(2),
  at: Date.now(),
  scope: "sandbox",
  resultado: "algo falló",
  regla: "regla genérica",
  nivel: "error",
  usos: 1,
  expiresAt: Date.now() + DAY,
  ...over,
});

describe("memoria de fallos (store)", () => {
  beforeEach(reset);

  it("record crea una entrada con regla, alcance y caducidad a 14 días", () => {
    useFailures.getState().record("sandbox", "Revisión: clave incrustada", "No incrustes claves en el código.");
    const e = useFailures.getState().entries[0];
    expect(e.scope).toBe("sandbox");
    expect(e.nivel).toBe("error");
    expect(e.usos).toBe(1);
    expect(e.expiresAt - e.at).toBeCloseTo(14 * DAY, -3);
  });

  it("la misma regla dos veces NO duplica: sube «usos» y refresca fechas", () => {
    const s = useFailures.getState();
    s.record("sandbox", "fallo 1", "misma regla");
    const primera = useFailures.getState().entries[0];
    s.record("vista", "fallo 2 (otro alcance)", "misma regla");
    const entradas = useFailures.getState().entries;
    expect(entradas).toHaveLength(1);
    expect(entradas[0].usos).toBe(2);
    expect(entradas[0].at).toBeGreaterThanOrEqual(primera.at);
  });

  it("remove borra UNA entrada de una en una (quien manda es el usuario)", () => {
    const s = useFailures.getState();
    s.record("sandbox", "a", "regla a");
    s.record("agente", "b", "regla b");
    const [a, b] = useFailures.getState().entries;
    s.remove(a.id);
    const rest = useFailures.getState().entries;
    expect(rest).toHaveLength(1);
    expect(rest[0].id).toBe(b.id);
  });

  it("sweep tira las caducadas y respeta las vivas", () => {
    useFailures.setState({
      entries: [
        entrada({ regla: "caducada", expiresAt: Date.now() - 1000 }),
        entrada({ regla: "viva", expiresAt: Date.now() + DAY }),
      ],
    });
    useFailures.getState().sweep();
    const rest = useFailures.getState().entries;
    expect(rest).toHaveLength(1);
    expect(rest[0].regla).toBe("viva");
  });

  it("el tope de 40 entradas guarda las más usadas y recientes", () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      entrada({ regla: `regla-${i}`, usos: 1, at: Date.now() - i * 1000 })
    );
    useFailures.setState({ entries: many });
    useFailures.getState().record("sandbox", "la nueva", "regla-nueva");
    const st = useFailures.getState().entries;
    expect(st.length).toBeLessThanOrEqual(40);
    expect(st.some((e) => e.regla === "regla-nueva")).toBe(true);
  });
});

describe("reglas (puro)", () => {
  it("solo los ERRORES verificables producen regla; avisos y familias sin regla, no", () => {
    expect(reglaFromDiagnostico({ family: "secreto", level: "error", message: "clave" })).toMatch(/claves API/i);
    expect(reglaFromDiagnostico({ family: "sintaxis", level: "error", message: "llave" })).toMatch(/sintácticamente/i);
    expect(reglaFromDiagnostico({ family: "estilo", level: "warn", message: "console.log" })).toBeNull();
    expect(reglaFromDiagnostico({ family: "desconocida", level: "error", message: "???" })).toBeNull();
  });

  it("reglasActivas: deduplica, ordena por usos y tira caducadas", () => {
    const now = Date.now();
    const reglas = reglasActivas([
      entrada({ regla: "b · 1 uso", usos: 1, expiresAt: now + DAY }),
      entrada({ regla: "a · 3 usos", usos: 3, expiresAt: now + DAY }),
      entrada({ regla: "caducada", usos: 9, expiresAt: now - 1 }),
      entrada({ regla: "a · 3 usos", usos: 3, expiresAt: now + DAY }), // duplicada
    ], now);
    expect(reglas).toEqual(["a · 3 usos", "b · 1 uso"]);
  });

  it("renderReglasPrompt devuelve cadena vacía sin reglas (no gasta tokens)", () => {
    expect(renderReglasPrompt([])).toBe("");
    const bloque = renderReglasPrompt(["no uses eval", "cierra las llaves"]);
    expect(bloque).toContain("Memoria de fallos");
    expect(bloque).toContain("1. no uses eval");
    expect(bloque).toContain("2. cierra las llaves");
  });

  it("caducaEn habla humano", () => {
    expect(caducaEn(Date.now() + 13 * DAY)).toMatch(/13 d/);
    expect(caducaEn(Date.now() - 1000)).toBe("caducada");
    expect(caducaEn(Date.now() + 3 * 3_600_000)).toMatch(/3 h/);
  });
});
