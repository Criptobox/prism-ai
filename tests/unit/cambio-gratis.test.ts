import { describe, expect, it } from "vitest";
import {
  compararFoto,
  MAX_CAMBIOS,
  nuevaFoto,
  resumenCambio,
  type FotoGratis,
} from "../../src/lib/prism/cambio-gratis";

/** Foto con fecha fija para que los tests no dependan del reloj. */
const foto = (gratisPorProveedor: FotoGratis["gratisPorProveedor"], fecha = 1_000): FotoGratis => ({
  fecha,
  gratisPorProveedor,
});

describe("compararFoto", () => {
  it("la primera vez (sin foto) no devuelve nada: no hay aviso vacío", () => {
    const r = compararFoto(null, [{ providerId: "gemini", modelos: ["gemini-2.5-flash"] }]);
    expect(r.dejoDeSerGratis).toEqual([]);
    expect(r.nuevoGratis).toEqual([]);
    expect(r.desaparecidos).toEqual([]);
    expect(r.totalDejoDeSerGratis).toBe(0);
  });

  it("un proveedor que no está en el catálogo (falló al responder) no se compara", () => {
    // groq falló: no aparece en `catalogo`. Aunque antes tenía modelos gratis,
    // aquí no puede convertirse en «te has quedado sin todo».
    const r = compararFoto(
      foto({ groq: ["llama-3.3-70b-versatile"] }),
      [{ providerId: "gemini", modelos: ["gemini-2.5-flash"] }]
    );
    expect(r.desaparecidos).toEqual([]);
    expect(r.dejoDeSerGratis).toEqual([]);
    // y lo de gemini (que sí contestó) es nuevo
    expect(r.nuevoGratis).toEqual([{ providerId: "gemini", modelId: "gemini-2.5-flash" }]);
  });

  it("detecta un modelo que dejó de ser gratis (sigue en el catálogo)", () => {
    // en la foto era gratis; hoy el MISMO id sigue en el catálogo y ya no
    // pasa isFreeModel (la heurística de gratis cambió desde la foto)
    const r = compararFoto(
      foto({ openai: ["gpt-4o"] }),
      [{ providerId: "openai", modelos: ["gpt-4o", "gpt-4o-mini"] }]
    );
    expect(r.dejoDeSerGratis).toEqual([{ providerId: "openai", modelId: "gpt-4o" }]);
    expect(r.totalDejoDeSerGratis).toBe(1);
    // y el que acaba de llegar gratis no cuenta como baja
    expect(r.dejoDeSerGratis.map((c) => c.modelId)).not.toContain("gpt-4o-mini");
  });

  it("un id que cambió de nombre (-free fuera) es DESAPARECIDO: no se puede saber que es el mismo modelo", () => {
    // el id viejo ya no está en el catálogo: afirmar «dejó de ser gratis»
    // sería inventar que gpt-5.5 y gpt-5.5-free son el mismo modelo
    const r = compararFoto(
      foto({ aihubmix: ["gpt-5.5-free"] }),
      [{ providerId: "aihubmix", modelos: ["gpt-5.5", "otro-free"] }]
    );
    expect(r.desaparecidos).toEqual([{ providerId: "aihubmix", modelId: "gpt-5.5-free" }]);
    expect(r.dejoDeSerGratis).toEqual([]);
  });

  it("detecta una ALTA: modelo nuevo y gratis que no estaba en la foto", () => {
    const r = compararFoto(
      foto({ openrouter: ["a:free"] }),
      [{ providerId: "openrouter", modelos: ["a:free", "b:free"] }]
    );
    expect(r.nuevoGratis).toEqual([{ providerId: "openrouter", modelId: "b:free" }]);
    expect(r.dejoDeSerGratis).toEqual([]);
    expect(r.desaparecidos).toEqual([]);
  });

  it("desaparecido ≠ dejó de ser gratis: el modelo ya ni está en el catálogo", () => {
    const r = compararFoto(
      foto({ openrouter: ["fantasma:free"] }),
      [{ providerId: "openrouter", modelos: ["otro:free"] }]
    );
    expect(r.desaparecidos).toEqual([{ providerId: "openrouter", modelId: "fantasma:free" }]);
    expect(r.dejoDeSerGratis).toEqual([]);
  });

  it("lo que sigue gratis y presente no genera ruido", () => {
    const r = compararFoto(
      foto({ gemini: ["gemini-2.5-flash"] }),
      [{ providerId: "gemini", modelos: ["gemini-2.5-flash"] }]
    );
    expect(r.dejoDeSerGratis).toEqual([]);
    expect(r.nuevoGratis).toEqual([]);
    expect(r.desaparecidos).toEqual([]);
  });

  it("compara sin importar mayúsculas (los proveedores cambian el casing)", () => {
    const r = compararFoto(
      foto({ groq: ["LLAMA-3.3-70B"] }),
      [{ providerId: "groq", modelos: ["llama-3.3-70b"] }]
    );
    expect(r.desaparecidos).toEqual([]);
    expect(r.dejoDeSerGratis).toEqual([]);
    expect(r.nuevoGratis).toEqual([]);
  });

  it("recorta al límite pero conserva los totales", () => {
    const antes = Array.from({ length: MAX_CAMBIOS + 5 }, (_, i) => `m${i}-free`);
    const r = compararFoto(foto({ aihubmix: antes }), [{ providerId: "aihubmix", modelos: [] }]);
    expect(r.desaparecidos.length).toBe(MAX_CAMBIOS);
    expect(r.totalDesaparecidos).toBe(MAX_CAMBIOS + 5);
  });
});

describe("nuevaFoto", () => {
  it("guarda solo los gratis de los proveedores que respondieron", () => {
    const f = nuevaFoto(null, [{ providerId: "aihubmix", modelos: ["a-free", "b-pago"] }], 5_000);
    expect(f.fecha).toBe(5_000);
    expect(f.gratisPorProveedor).toEqual({ aihubmix: ["a-free"] });
  });

  it("el proveedor que falló conserva su foto anterior (no se sobrescribe)", () => {
    const previa = foto({ groq: ["llama-3.3-70b"], openrouter: ["x:free"] });
    // openrouter falló: solo gemini está en el catálogo
    const f = nuevaFoto(previa, [{ providerId: "gemini", modelos: ["gemini-2.5-flash"] }]);
    expect(f.gratisPorProveedor.groq).toEqual(["llama-3.3-70b"]);
    expect(f.gratisPorProveedor.openrouter).toEqual(["x:free"]);
    expect(f.gratisPorProveedor.gemini).toEqual(["gemini-2.5-flash"]);
  });

  it("sin foto previa y sin catalogo queda vacía", () => {
    const f = nuevaFoto(null, []);
    expect(f.gratisPorProveedor).toEqual({});
    expect(f.fecha).toBeGreaterThan(0);
  });
});

describe("resumenCambio", () => {
  it("sin cambios no hay frase (no se enseña un aviso vacío)", () => {
    expect(
      resumenCambio(
        {
          dejoDeSerGratis: [],
          nuevoGratis: [],
          desaparecidos: [],
          totalDejoDeSerGratis: 0,
          totalNuevoGratis: 0,
          totalDesaparecidos: 0,
        },
        1_000
      )
    ).toBeNull();
  });

  it("dice la fecha de la foto que se tiene, no una antigüedad inventada", () => {
    const texto = resumenCambio(
      {
        dejoDeSerGratis: [{ providerId: "aihubmix", modelId: "x-free" }],
        nuevoGratis: [],
        desaparecidos: [],
        totalDejoDeSerGratis: 1,
        totalNuevoGratis: 0,
        totalDesaparecidos: 0,
      },
      Date.UTC(2026, 0, 15)
    );
    expect(texto).toContain("1 modelo dejó de ser gratis");
    expect(texto).toContain("15/1/2026");
    // y no dice «desde hace N días»
    expect(texto).not.toMatch(/desde hace/);
  });

  it("sin fecha de foto no inventa cuándo", () => {
    const texto = resumenCambio(
      {
        dejoDeSerGratis: [],
        nuevoGratis: [{ providerId: "gemini", modelId: "g" }],
        desaparecidos: [],
        totalDejoDeSerGratis: 0,
        totalNuevoGratis: 2,
        totalDesaparecidos: 0,
      },
      null
    );
    expect(texto).toContain("2 nuevos gratis");
    expect(texto).not.toContain("foto del");
  });
});
