import { describe, expect, it } from "vitest";
import { agentPrompt, parseAgentTrace } from "../../src/lib/prism/agent-loop";

describe("parseAgentTrace", () => {
  it("contenido sin etiquetas → active false (render markdown normal)", () => {
    const r = parseAgentTrace("Hola, soy una respuesta normal");
    expect(r.active).toBe(false);
  });

  it("parsea plan + iteración + revisión superada + answer", () => {
    const content = [
      "<plan>",
      "- Crear la página",
      "- Revisar el CSS",
      "</plan>",
      '<step n="1" title="página">',
      "```html",
      "<h1>Hola</h1>",
      "```",
      "</step>",
      '<review pass="yes">',
      "Todo correcto.",
      "</review>",
      "<answer>",
      "Página lista.",
      "</answer>",
    ].join("\n");
    const r = parseAgentTrace(content);
    expect(r.active).toBe(true);
    expect(r.iterations).toBe(1);
    const kinds = r.blocks.map((b) => b.kind);
    expect(kinds).toContain("plan");
    expect(kinds).toContain("answer");
  });

  it("soporta streaming: etiqueta final sin cerrar", () => {
    const r = parseAgentTrace("<plan>\n- paso 1");
    expect(r.active).toBe(true);
  });

  it("detecta el project-map JSON del modelo", () => {
    const content = `<answer>ok</answer>
<project-map>{"name":"Demo","description":"prueba","files":[{"name":"index.html","kind":"html","summary":"portada"}],"features":["hero"]}</project-map>`;
    const r = parseAgentTrace(content);
    expect(r.mapJson).toBeTruthy();
    expect(r.mapJson).toContain("Demo");
  });
});

describe("agentPrompt", () => {
  it("incluye el máximo de iteraciones y las etiquetas clave", () => {
    const p = agentPrompt(4);
    expect(p).toContain("MODO AGENTE");
    expect(p).toContain("<plan>");
    expect(p).toContain("<answer>");
  });

  it("limita el rango 1-8", () => {
    expect(agentPrompt(50)).toContain("máximo 8 iteraciones");
    expect(agentPrompt(0)).toContain("máximo 3 iteraciones");
  });
});
