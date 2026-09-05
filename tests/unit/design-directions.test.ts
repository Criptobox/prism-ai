import { describe, expect, it } from "vitest";
import {
  CHECKLIST_ANTI_SLOP,
  DIRECCIONES,
  aDesignMd,
  elegirDireccion,
  direccionPorId,
  esEncargoUINueva,
  promptDireccion,
} from "../../src/lib/prism/design-directions";

describe("direcciones curadas", () => {
  it("son exactamente las 5 del plan, con ids únicos", () => {
    expect(DIRECCIONES.length).toBe(5);
    expect(new Set(DIRECCIONES.map((d) => d.id)).size).toBe(5);
  });

  it("todas tienen tokens completos y coherentes", () => {
    for (const d of DIRECCIONES) {
      expect(d.paleta.fondo).toMatch(/oklch/);
      expect(d.paleta.acento).toMatch(/oklch/);
      expect(d.fuentes.display).toBeTruthy();
      expect(d.fuentes.cuerpo).toBeTruthy();
      expect(d.composicion).toBeTruthy();
      expect(d.detalle).toBeTruthy();
      // la dirección debe DECIR cuándo brilla, para la elicitación
      expect(d.cuando.length).toBeGreaterThan(10);
    }
  });

  it("prohiben el hero centrado genérico de una manera u otra", () => {
    // cada dirección tiene reglas de composición con intención
    for (const d of DIRECCIONES) {
      expect(d.composicion.length).toBeGreaterThan(40);
    }
  });

  it("direccionPorId encuentra y rechaza", () => {
    expect(direccionPorId("editorial")?.nombre).toBeTruthy();
    expect(direccionPorId("no-existe")).toBeNull();
  });
});

describe("elegirDireccion", () => {
  it("respeta la dirección clara del prompt (capa 1, sin preguntar)", () => {
    expect(elegirDireccion("landing minimalista para fintech").direccion.id).toBe("minimal");
    expect(elegirDireccion("web para un restaurante orgánico").direccion.id).toBe("calido");
    expect(elegirDireccion("póster brutalista para un festival").direccion.id).toBe("brutalista");
    expect(elegirDireccion("dashboard técnico para devs").direccion.id).toBe("tech");
    expect(elegirDireccion("portfolio editorial de escritura").direccion.id).toBe("editorial");
    const e = elegirDireccion("landing minimalista para fintech");
    expect(e.origen).toBe("usuario");
  });

  it("sin dirección clara decide sola, y evita las recientes", () => {
    const e = elegirDireccion("hazme una web", ["editorial", "minimal", "tech", "brutalista"]);
    expect(e.origen).toBe("sistema");
    expect(e.direccion.id).toBe("calido");
  });

  it("si todas están quemadas, decide igual (no se bloquea)", () => {
    const e = elegirDireccion("hazme una web", DIRECCIONES.map((d) => d.id));
    expect(e.direccion).toBeTruthy();
  });

  it("es determinista con el mismo prompt", () => {
    const a = elegirDireccion("hazme una web de eventos");
    const b = elegirDireccion("hazme una web de eventos");
    expect(a.direccion.id).toBe(b.direccion.id);
  });
});

describe("DESIGN.md y prompt", () => {
  it("aDesignMd produce un documento completo", () => {
    const md = aDesignMd(DIRECCIONES[0], "Mi café");
    expect(md).toContain("# DESIGN.md");
    expect(md).toContain("Mi café");
    expect(md).toContain("oklch");
    expect(md).toContain(DIRECCIONES[0].fuentes.display);
  });

  it("promptDireccion incluye paleta, fuentes y la checklist", () => {
    const e = elegirDireccion("una web de bienestar");
    const p = promptDireccion(e);
    expect(p).toContain(e.direccion.fuentes.display);
    expect(p).toContain("oklch");
    expect(p).toContain("DIRECCIÓN DE DISEÑO");
    expect(p).toContain("JERARQUÍA");
  });

  it("el anuncio solo se exige cuando decidió el sistema", () => {
    const solo = promptDireccion(elegirDireccion("web minimalista"));
    expect(solo).not.toMatch(/anúncialo/);
    const sistema = promptDireccion(elegirDireccion("hazme una web"));
    expect(sistema).toMatch(/anúncialo/);
  });

  it("la checklist anti-slop cubre 5 dimensiones", () => {
    expect(CHECKLIST_ANTI_SLOP).toMatch(/JERARQUÍA/);
    expect(CHECKLIST_ANTI_SLOP).toMatch(/TIPOGRAFÍA/);
    expect(CHECKLIST_ANTI_SLOP).toMatch(/COLOR/);
    expect(CHECKLIST_ANTI_SLOP).toMatch(/ESPACIO/);
    expect(CHECKLIST_ANTI_SLOP).toMatch(/DETALLE/);
  });
});

describe("esEncargoUINueva", () => {
  it("true para construir UI desde cero", () => {
    expect(esEncargoUINueva("crea una landing para mi tienda")).toBe(true);
    expect(esEncargoUINueva("hazme un dashboard de ventas")).toBe(true);
  });
  it("false para retoques o chat normal", () => {
    expect(esEncargoUINueva("cambia el botón a azul")).toBe(false);
    expect(esEncargoUINueva("¿qué es un hero section?")).toBe(false);
    expect(esEncargoUINueva("")).toBe(false);
  });
});
