import { describe, it, expect } from "vitest";
import { decideDemo, type DemoContext } from "../../src/lib/prism/preview-demo";

/** El demo se auto-metía en la app de cualquiera que no tuviera todavía la
 * marca de «ya vista»: aparecía una conversación que nadie pidió, con el panel
 * de vista previa abierto encima. Le pasaba a quien borrase los datos del
 * sitio, y a los 62 escenarios E2E, que arrancan siempre de cero. */
const ctx = (over: Partial<DemoContext> = {}): DemoContext => ({
  forzado: false,
  yaVista: false,
  hayDemo: false,
  usuarioConDatos: false,
  ...over,
});

describe("decideDemo", () => {
  it("se escribe para quien llega por primera vez y no tiene nada", () => {
    expect(decideDemo(ctx())).toBe("escribir");
  });

  it("NO se mete en la app de alguien que ya tiene cosas suyas", () => {
    expect(decideDemo(ctx({ usuarioConDatos: true }))).toBe("nada");
  });

  it("visto una vez, solo se reabre si sigue estando", () => {
    expect(decideDemo(ctx({ yaVista: true, hayDemo: true }))).toBe("abrir");
    expect(decideDemo(ctx({ yaVista: true, hayDemo: false }))).toBe("nada");
  });

  it("borrarlo no lo resucita en la siguiente visita", () => {
    expect(decideDemo(ctx({ yaVista: true, hayDemo: false, usuarioConDatos: true }))).toBe("nada");
  });

  it("?demo=preview manda por encima de todo", () => {
    expect(decideDemo(ctx({ forzado: true, yaVista: true, usuarioConDatos: true }))).toBe(
      "escribir"
    );
  });

  it("«ya vista» pesa más que «usuario nuevo»: no se reescribe sin pedirlo", () => {
    expect(decideDemo(ctx({ yaVista: true, hayDemo: true, usuarioConDatos: false }))).toBe("abrir");
  });
});
