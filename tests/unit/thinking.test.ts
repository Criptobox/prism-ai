import { describe, expect, it } from "vitest";
import { splitThinkTags } from "../../src/lib/prism/thinking";

describe("splitThinkTags", () => {
  it("devuelve el contenido intacto si no hay <think>", () => {
    const r = splitThinkTags("Hola mundo");
    expect(r).toEqual({ content: "Hola mundo", reasoning: "" });
  });

  it("separa un bloque <think> cerrado del contenido", () => {
    const r = splitThinkTags("<think>pensamiento interno</think>La respuesta final.");
    expect(r.content).toBe("La respuesta final.");
    expect(r.reasoning).toBe("pensamiento interno");
  });

  it("trata un <think> sin cerrar como razonamiento en curso (streaming)", () => {
    const r = splitThinkTags("<think>estoy pensando");
    expect(r.content).toBe("");
    expect(r.reasoning).toBe("estoy pensando");
  });

  it("acumula razonamiento previo (reasoning_content) con etiquetas <think>", () => {
    const r = splitThinkTags("antes<think>dentro</think>después", "previo del campo");
    expect(r.content).toBe("después");
    expect(r.reasoning).toContain("previo del campo");
    expect(r.reasoning).toContain("antes");
    expect(r.reasoning).toContain("dentro");
  });

  it("soporta varios bloques seguidos", () => {
    const r = splitThinkTags("<think>a</think>1<think>b</think>2");
    expect(r.content).toBe("2");
    expect(r.reasoning).toContain("a");
    expect(r.reasoning).toContain("b");
  });

  it("es idempotente sobre texto ya limpio", () => {
    const once = splitThinkTags("<think>x</think>y");
    const twice = splitThinkTags(once.content, once.reasoning);
    expect(twice.content).toBe("y");
  });
});
