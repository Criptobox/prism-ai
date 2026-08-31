/** Prism AI — Por qué paró el modelo, según el proveedor.
 *
 * Los tres protocolos lo mandan y Prism no lo leía en ningún sitio. La
 * detección de corte de la v3.18.0 va por la forma del texto —una cerca ```
 * sin pareja—, que funciona pero es un indicio: un corte a media frase, sin
 * bloque de código de por medio, no deja ninguna señal. `finish_reason:
 * "length"` sí.
 */
import { describe, it, expect } from "vitest";
import {
  motivoDeParada,
  motivoDeRespuesta,
  estaCortadaPorLongitud,
  mensajeParada,
} from "../../src/lib/prism/finish-reason";

describe("motivoDeParada", () => {
  it("reconoce el corte por longitud de los tres protocolos", () => {
    expect(motivoDeParada("length")).toBe("longitud"); // OpenAI
    expect(motivoDeParada("max_tokens")).toBe("longitud"); // Anthropic
    expect(motivoDeParada("MAX_TOKENS")).toBe("longitud"); // Gemini, en mayúsculas
  });

  it("distingue el final normal", () => {
    expect(motivoDeParada("stop")).toBe("fin");
    expect(motivoDeParada("end_turn")).toBe("fin");
    expect(motivoDeParada("STOP")).toBe("fin");
  });

  it("reconoce la parada por herramienta y por filtro", () => {
    expect(motivoDeParada("tool_calls")).toBe("herramienta");
    expect(motivoDeParada("tool_use")).toBe("herramienta");
    expect(motivoDeParada("content_filter")).toBe("filtro");
    expect(motivoDeParada("SAFETY")).toBe("filtro");
  });

  it("lo que no conoce NO se lo inventa", () => {
    expect(motivoDeParada("algo_raro_de_un_router")).toBe("desconocido");
    expect(motivoDeParada(null)).toBe("desconocido");
    expect(motivoDeParada("")).toBe("desconocido");
    expect(motivoDeParada(42)).toBe("desconocido");
  });
});

describe("motivoDeRespuesta — sacarlo del cuerpo de cada protocolo", () => {
  it("OpenAI, streaming y no-streaming", () => {
    expect(motivoDeRespuesta("openai", { choices: [{ finish_reason: "length" }] })).toBe("longitud");
    expect(
      motivoDeRespuesta("openai", { choices: [{ delta: { content: "x" }, finish_reason: "stop" }] })
    ).toBe("fin");
  });

  it("Anthropic, en el cuerpo y en el message_delta", () => {
    expect(motivoDeRespuesta("anthropic", { stop_reason: "max_tokens" })).toBe("longitud");
    expect(
      motivoDeRespuesta("anthropic", { type: "message_delta", delta: { stop_reason: "end_turn" } })
    ).toBe("fin");
  });

  it("Gemini, en el candidato", () => {
    expect(motivoDeRespuesta("gemini", { candidates: [{ finishReason: "MAX_TOKENS" }] })).toBe(
      "longitud"
    );
  });

  it("los chunks intermedios no dicen nada, y eso NO es «desconocido»", () => {
    // devolver null es lo que permite que gane el último chunk con valor;
    // si devolviera "desconocido" pisaría el motivo bueno
    expect(motivoDeRespuesta("openai", { choices: [{ delta: { content: "x" } }] })).toBeNull();
    expect(motivoDeRespuesta("openai", { choices: [{ finish_reason: null }] })).toBeNull();
    expect(motivoDeRespuesta("anthropic", { type: "content_block_delta" })).toBeNull();
    expect(motivoDeRespuesta("gemini", { candidates: [{ content: { parts: [] } }] })).toBeNull();
  });

  it("un cuerpo que no es objeto no rompe nada", () => {
    expect(motivoDeRespuesta("openai", null)).toBeNull();
    expect(motivoDeRespuesta("openai", "texto")).toBeNull();
  });
});

describe("uso", () => {
  it("solo «longitud» cuenta como respuesta cortada", () => {
    expect(estaCortadaPorLongitud("longitud")).toBe(true);
    expect(estaCortadaPorLongitud("fin")).toBe(false);
    expect(estaCortadaPorLongitud("desconocido")).toBe(false);
    expect(estaCortadaPorLongitud(null)).toBe(false);
  });

  it("no se avisa de un final normal ni de un motivo desconocido", () => {
    expect(mensajeParada("longitud")).toContain("longitud");
    expect(mensajeParada("filtro")).toContain("filtro");
    // decir algo aquí sería inventarse un dato
    expect(mensajeParada("fin")).toBeNull();
    expect(mensajeParada("desconocido")).toBeNull();
    expect(mensajeParada(null)).toBeNull();
  });
});
