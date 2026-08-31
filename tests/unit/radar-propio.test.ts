/** Prism AI — Lo que TUS claves pueden usar hoy, gratis.
 *
 * El «siempre pone lo mismo» del radar era literal: casi todo es un catálogo
 * escrito a mano. Esto es la parte que cambia sola, porque sale de preguntarle
 * a tus proveedores con tu clave.
 */
import { describe, it, expect } from "vitest";
import {
  proveedoresConsultables,
  novedadesGratis,
  resumenNovedades,
  MAX_NOVEDADES,
} from "../../src/lib/prism/radar-propio";
import type { ProviderConfig, ProviderId } from "../../src/lib/prism/types";

const cfg = (o: Partial<ProviderConfig> = {}): ProviderConfig => ({
  apiKey: "k",
  enabled: true,
  models: [],
  ...o,
});

describe("proveedoresConsultables", () => {
  const sinClave = (id: ProviderId) => id === "ollama";

  it("los conectados y con clave", () => {
    const r = proveedoresConsultables({ groq: cfg(), openrouter: cfg() }, sinClave);
    expect(r.sort()).toEqual(["groq", "openrouter"]);
  });

  it("los apagados no se consultan", () => {
    expect(proveedoresConsultables({ groq: cfg({ enabled: false }) }, sinClave)).toEqual([]);
  });

  it("sin clave no se pregunta… salvo los que no la necesitan", () => {
    expect(proveedoresConsultables({ groq: cfg({ apiKey: "  " }) }, sinClave)).toEqual([]);
    expect(proveedoresConsultables({ ollama: cfg({ apiKey: "" }) }, sinClave)).toEqual(["ollama"]);
  });
});

describe("novedadesGratis", () => {
  it("se queda con lo gratis", () => {
    const r = novedadesGratis([
      { providerId: "openrouter", modelos: ["a:free", "b-de-pago"], yaTengo: [] },
    ]);
    expect(r.map((x) => x.modelId)).toEqual(["a:free"]);
  });

  /* El radar es para DESCUBRIR: una lista donde el 90% ya lo tienes no
   * descubre nada, y es justo la sensación de «siempre lo mismo». */
  it("descarta lo que ya tienes añadido", () => {
    const r = novedadesGratis([
      { providerId: "openrouter", modelos: ["a:free", "b:free"], yaTengo: ["A:FREE"] },
    ]);
    expect(r.map((x) => x.modelId)).toEqual(["b:free"]);
  });

  it("no repite el mismo modelo dos veces", () => {
    const r = novedadesGratis([
      { providerId: "openrouter", modelos: ["a:free", "a:free"], yaTengo: [] },
    ]);
    expect(r).toHaveLength(1);
  });

  /* Si un proveedor devuelve doscientos modelos, no puede dejar a los demás
   * fuera de la lista: el radar dejaría de enseñar variedad. */
  it("reparte entre proveedores en vez de vaciar el primero", () => {
    const muchos = Array.from({ length: 30 }, (_, i) => `m${i}:free`);
    const r = novedadesGratis(
      [
        { providerId: "openrouter", modelos: muchos, yaTengo: [] },
        { providerId: "groq", modelos: ["solo-uno:free"], yaTengo: [] },
      ],
      6
    );
    expect(r).toHaveLength(6);
    expect(r.some((x) => x.providerId === "groq"), "el segundo proveedor entra").toBe(true);
  });

  it("respeta el tope", () => {
    const muchos = Array.from({ length: 50 }, (_, i) => `m${i}:free`);
    expect(novedadesGratis([{ providerId: "openrouter", modelos: muchos, yaTengo: [] }])).toHaveLength(
      MAX_NOVEDADES
    );
  });
});

describe("resumenNovedades", () => {
  /* Que no haya novedades no es un fallo ni un hueco: es que ya lo tienes
   * todo. Decirlo así evita que parezca que el radar no funciona. */
  it("sin novedades lo cuenta como buena noticia, no como error", () => {
    const t = resumenNovedades([], 3);
    expect(t).toContain("ya tienes añadido todo");
    expect(t).toContain("3 proveedores");
  });

  it("sin proveedores conectados dice qué hacer", () => {
    expect(resumenNovedades([], 0)).toContain("Conecta un proveedor");
  });

  it("con novedades, las cuenta", () => {
    const r = novedadesGratis([{ providerId: "groq", modelos: ["a:free"], yaTengo: [] }]);
    expect(resumenNovedades(r, 1)).toContain("1 modelo gratis nuevo");
  });
});
