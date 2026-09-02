import { describe, expect, it } from "vitest";
import { estaRoto, sinRotos, motivoRoto, type ModeloRoto } from "../../src/lib/prism/modelos-rotos";
import { culpaConfirmadaDelModelo } from "../../src/lib/prism/model-probe";

const roto = (status = 404): ModeloRoto => ({ status, at: Date.UTC(2026, 8, 2) });

describe("modelos que el proveedor no reconoce", () => {
  it("sinRotos los quita de la lista", () => {
    const rotos = { "groq::muerto": roto() };
    expect(sinRotos(["groq::vivo", "groq::muerto"], rotos)).toEqual(["groq::vivo"]);
  });

  it("el que tienes elegido AHORA se conserva aunque esté roto", () => {
    // si no, la cabecera del chat señalaría a un modelo que no está en ninguna
    // lista y no habría forma de cambiarlo desde ahí
    const rotos = { "groq::muerto": roto() };
    expect(sinRotos(["groq::vivo", "groq::muerto"], rotos, "groq::muerto")).toEqual([
      "groq::vivo",
      "groq::muerto",
    ]);
  });

  it("sin marcas no quita nada", () => {
    expect(sinRotos(["a::1", "b::2"], {})).toEqual(["a::1", "b::2"]);
    expect(estaRoto({}, "a::1")).toBe(false);
  });

  it("el motivo dice qué contestó y cuándo", () => {
    expect(motivoRoto({ status: 404, detail: "model not found", at: Date.UTC(2026, 8, 2) })).toContain(
      "model not found"
    );
    expect(motivoRoto(roto(0))).toContain("no respondió");
    expect(motivoRoto(roto(404))).toContain("respondió 404");
  });
});

/** Qué entra en la memoria y qué NO. Marcar de más es peor que marcar de
 *  menos: esconde modelos buenos y el usuario no entiende por qué. */
describe("solo se marca lo que es culpa del modelo", () => {
  it("«no existe» y «sin permiso» sí", () => {
    expect(culpaConfirmadaDelModelo({ verdict: "no-existe", status: 404, detail: "" })).toBe(true);
    expect(culpaConfirmadaDelModelo({ verdict: "sin-permiso", status: 403, detail: "" })).toBe(true);
  });

  it("un límite de peticiones NO: el modelo está bien", () => {
    expect(culpaConfirmadaDelModelo({ verdict: "limitado", status: 429, detail: "" })).toBe(false);
  });

  it("un servidor local apagado NO: no ha dado tiempo ni a preguntarle", () => {
    expect(culpaConfirmadaDelModelo({ verdict: "sin-red", status: 0, detail: "" })).toBe(false);
  });

  it("una caída del proveedor NO", () => {
    expect(culpaConfirmadaDelModelo({ verdict: "caido", status: 503, detail: "" })).toBe(false);
  });

  it("tampoco cuando hay una explicación mejor que el modelo", () => {
    // la política de datos de OpenRouter bloquea los :free hasta aceptarla:
    // el modelo existe y funciona en cuanto la aceptas
    expect(
      culpaConfirmadaDelModelo({
        verdict: "no-existe",
        status: 404,
        detail: "No endpoints found matching your data policy",
      })
    ).toBe(false);
  });
});
