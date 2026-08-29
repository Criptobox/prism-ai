import { describe, expect, it } from "vitest";
import {
  TRANSLATE_LANGS,
  findLang,
  instructionKind,
  instructionLabel,
  recapPrompt,
  translatePrompt,
} from "../../src/lib/prism/recap";

describe("idiomas de traducción", () => {
  it("ofrece los seis idiomas pedidos", () => {
    expect(TRANSLATE_LANGS.map((l) => l.code)).toEqual(["en", "fr", "pt", "de", "it", "ja"]);
  });

  it("busca por código", () => {
    expect(findLang("ja")?.label).toBe("日本語");
    expect(findLang("xx")).toBeNull();
  });
});

describe("recapPrompt", () => {
  it("pide una recapitulación estructurada", () => {
    const p = recapPrompt();
    expect(p).toMatch(/^Resume la conversación/);
    expect(p).toContain("Lo acordado");
    expect(p).toContain("Siguiente paso");
  });
});

describe("translatePrompt", () => {
  it("nombra el idioma y cita el arranque de la respuesta", () => {
    const p = translatePrompt(findLang("fr")!, "Hola, aquí tienes la landing");
    expect(p).toContain("Français");
    expect(p).toContain("Hola, aquí tienes la landing");
  });

  it("recorta el fragmento citado para no reenviar la respuesta entera", () => {
    const p = translatePrompt(findLang("en")!, "x".repeat(2000));
    expect(p.length).toBeLessThan(1000);
  });

  it("protege el código de la traducción", () => {
    expect(translatePrompt(findLang("de")!, "abc")).toMatch(/código NO se traduce/i);
  });
});

describe("instructionKind / instructionLabel", () => {
  it("reconoce el resumen", () => {
    expect(instructionKind(recapPrompt())).toBe("resumen");
    expect(instructionLabel(recapPrompt())).toBe("Se pidió un resumen de la conversación");
  });

  it("reconoce la traducción y nombra el idioma en la nota", () => {
    const p = translatePrompt(findLang("it")!, "ciao");
    expect(instructionKind(p)).toBe("traducir");
    expect(instructionLabel(p)).toBe("Se pidió traducir la respuesta al Italiano");
  });

  it("cae en «continuar» con el mensaje del agente, como antes", () => {
    expect(instructionKind("Continúa el trabajo desde la iteración 2")).toBe("continuar");
    expect(instructionLabel("Continúa el trabajo")).toBe(
      "Se pidió al agente continuar el trabajo"
    );
  });
});
