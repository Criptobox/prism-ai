import { describe, expect, it } from "vitest";
import {
  MODOS_MARKETING,
  promptCarrusel,
  promptDeModo,
  promptEmail,
  promptPoster,
  resolverPlantillaMarketing,
} from "../../src/lib/prism/marketing";
import { DIRECCIONES, direccionPorId } from "../../src/lib/prism/design-directions";

describe("modos", () => {
  it("son los tres del plan", () => {
    expect(MODOS_MARKETING.map((m) => m.id).sort()).toEqual(["carrusel", "email", "poster"]);
  });
});

describe("prompts", () => {
  it("el email exige tablas y fallbacks (clientes de correo)", () => {
    const p = promptEmail("promo de invierno", DIRECCIONES[0]);
    expect(p).toMatch(/<table>/i);
    expect(p).toMatch(/fallback/i);
    expect(p).toMatch(/Gmail/);
  });

  it("el carrusel pide 3 tarjetas 1080×1080 con gancho y CTA", () => {
    const p = promptCarrusel("anuncio de apertura", DIRECCIONES[1]);
    expect(p).toMatch(/1080×1080/);
    expect(p).toMatch(/Tarjeta 1/);
    expect(p).toMatch(/CTA/);
  });

  it("el póster pide una sola pantalla con jerarquía de 3 segundos", () => {
    const p = promptPoster("oferta del black friday", DIRECCIONES[2]);
    expect(p).toMatch(/UNA sola pantalla|UN archivo HTML de UNA/);
    expect(p).toMatch(/3 segundos/);
  });

  it("todos viajan con los tokens de la dirección exacta", () => {
    const d = direccionPorId("tech")!;
    for (const p of [promptEmail("x", d), promptCarrusel("x", d), promptPoster("x", d)]) {
      expect(p).toContain(d.fuentes.display);
      expect(p).toContain(d.paleta.acento);
      expect(p).toContain("JERARQUÍA"); // checklist anti-slop presente
    }
  });
});

describe("promptDeModo", () => {
  it("elige la dirección del proyecto si ya hay una (misma casa)", () => {
    const p = promptDeModo("email", "promo", "brutalista");
    expect(p).toContain("Archivo Black"); // tipografía de la dirección brutalista
  });

  it("sin dirección previa, decide del encargo", () => {
    const p = promptDeModo("poster", "cartel minimalista para expo", null);
    expect(p).toContain("Fraunces"); // dirección minimal
  });
});

describe("resolverPlantillaMarketing", () => {
  it("resuelve los marcadores del slash", () => {
    const p = resolverPlantillaMarketing("__MARKETING_EMAIL__");
    expect(p).toMatch(/EMAIL DE MARCA/);
    expect(p).not.toContain("__MARKETING_");
  });
  it("plantilla no-marketing pasa intacta", () => {
    expect(resolverPlantillaMarketing("hola")).toBe("hola");
  });
  it("respeta la dirección existente del proyecto", () => {
    const p = resolverPlantillaMarketing("__MARKETING_POSTER__", undefined, "editorial");
    expect(p).toContain("Playfair Display");
  });
});
