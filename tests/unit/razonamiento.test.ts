import { describe, expect, it } from "vitest";
import {
  razonamientoDeTrozo,
  separarEtiquetasPensamiento,
} from "../../src/lib/prism/razonamiento";

/** Prism AI — T4 del plan V6: los bloques de razonamiento, por protocolo.
 *
 * Los dos primeros casos existían dispersos (reasoning_content y etiquetas
 * \uD83E\uDDE2... hmm, no: etiquetas <think>); los dos últimos (Anthropic
 * thinking, Gemini thought) son cobertura NUEVA: antes no se leían en
 * ninguna parte y salían mezclados o perdidos.
 */

describe("razonamientoDeTrozo · openai (ya existía, se mueve)", () => {
  it("separa reasoning_content del contenido del delta", () => {
    const r = razonamientoDeTrozo("openai", {
      choices: [{ delta: { content: "respuesta", reasoning_content: "pienso" } }],
    });
    expect(r).toEqual({ contenido: "respuesta", razonamiento: "pienso" });
  });

  it("solo contenido, o solo razonamiento, o nada", () => {
    expect(razonamientoDeTrozo("openai", { choices: [{ delta: { content: "solo texto" } }] })).toEqual({
      contenido: "solo texto",
      razonamiento: "",
    });
    expect(
      razonamientoDeTrozo("openai", { choices: [{ delta: { reasoning_content: "solo pensar" } }] })
    ).toEqual({ contenido: "", razonamiento: "solo pensar" });
    expect(razonamientoDeTrozo("openai", { choices: [{ delta: {} }] })).toEqual({
      contenido: "",
      razonamiento: "",
    });
    expect(razonamientoDeTrozo("openai", null)).toEqual({ contenido: "", razonamiento: "" });
  });
});

describe("razonamientoDeTrozo · anthropic (nuevo)", () => {
  it("streaming: thinking_delta es razonamiento y text_delta es contenido", () => {
    const pensar = razonamientoDeTrozo("anthropic", {
      type: "content_block_delta",
      delta: { type: "thinking_delta", thinking: "razono por mi cuenta" },
    });
    expect(pensar).toEqual({ contenido: "", razonamiento: "razono por mi cuenta" });

    const hablar = razonamientoDeTrozo("anthropic", {
      type: "content_block_delta",
      delta: { type: "text_delta", text: "la respuesta" },
    });
    expect(hablar).toEqual({ contenido: "la respuesta", razonamiento: "" });
  });

  it("no-streaming: bloques thinking y text del mismo cuerpo", () => {
    const r = razonamientoDeTrozo("anthropic", {
      content: [
        { type: "thinking", thinking: "primero pienso" },
        { type: "text", text: "luego hablo" },
      ],
    });
    expect(r).toEqual({ contenido: "luego hablo", razonamiento: "primero pienso" });
  });

  it("signature_delta y otros eventos no aportan nada (no son texto)", () => {
    const r = razonamientoDeTrozo("anthropic", {
      type: "content_block_delta",
      delta: { type: "signature_delta", signature: "EqMC…" },
    });
    expect(r).toEqual({ contenido: "", razonamiento: "" });
  });
});

describe("razonamientoDeTrozo · gemini (nuevo)", () => {
  it("las partes con thought:true son razonamiento, el resto contenido", () => {
    const r = razonamientoDeTrozo("gemini", {
      candidates: [
        {
          content: {
            parts: [
              { text: "delibero en silencio", thought: true },
              { text: "respuesta visible" },
            ],
          },
        },
      ],
    });
    expect(r).toEqual({ contenido: "respuesta visible", razonamiento: "delibero en silencio" });
  });

  it("thoughtSignature no es texto: no cuenta como razonamiento", () => {
    const r = razonamientoDeTrozo("gemini", {
      candidates: [{ content: { parts: [{ thoughtSignature: "Cg0IB…" }] } }],
    });
    expect(r).toEqual({ contenido: "", razonamiento: "" });
  });

  it("sin candidates no explota", () => {
    expect(razonamientoDeTrozo("gemini", {})).toEqual({ contenido: "", razonamiento: "" });
    expect(razonamientoDeTrozo("gemini", { candidates: [] })).toEqual({ contenido: "", razonamiento: "" });
  });
});

describe("separarEtiquetasPensamiento · etiquetas <think> dentro del contenido", () => {
  it("se separan igual que siempre (es splitThinkTags reexpuesto)", () => {
    const s = separarEtiquetasPensamiento("<think>secreto</think>visible");
    expect(s).toEqual({ contenido: "visible", razonamiento: "secreto" });
  });

  it("la etiqueta PARTIDA entre dos trozos del stream: se aplica sobre el texto acumulado", () => {
    // así consume el stream chat-app: acumula el bruto y separa sobre lo
    // acumulado. El primer trozo deja la etiqueta a medias (todavía no es
    // etiqueta), el segundo la cierra y el texto oculto pasa a razonamiento
    let acc = "";
    let split = separarEtiquetasPensamiento(acc);
    expect(split.contenido).toBe("");

    acc += "hola <thi";
    split = separarEtiquetasPensamiento(acc);
    // la etiqueta no está completa: no hay nada que separar todavía
    expect(split.contenido).toBe("hola <thi");

    acc += "nk>esto es el razonamiento</think>respuesta";
    split = separarEtiquetasPensamiento(acc);
    expect(split.contenido).toBe("respuesta");
    expect(split.razonamiento).toContain("esto es el razonamiento");
  });

  it("etiqueta abierta y sin cerrar: todo lo que sigue es razonamiento (streaming en curso)", () => {
    const s = separarEtiquetasPensamiento("antes<think>sigue pensando");
    expect(s.contenido).toBe("");
    expect(s.razonamiento).toContain("sigue pensando");
  });
});
