import { describe, expect, it } from "vitest";
import {
  agentPrompt,
  agentStalled,
  continuePrompt,
  parseAgentTrace,
  suggestAgentMode,
} from "../../src/lib/prism/agent-loop";

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

describe("agentStalled — detectar que el agente se quedó a medias", () => {
  const traza = (c: string) => parseAgentTrace(c);

  it("un trabajo cerrado con <answer> no está a medias", () => {
    const t = traza(`<plan>- uno</plan>
<step n="1" title="hacer">código</step>
<review pass="yes">todo bien</review>
<answer>Listo</answer>`);
    expect(agentStalled(t).stalled).toBe(false);
  });

  it("una revisión con pass=no sin corregir SÍ está a medias", () => {
    const t = traza(`<plan>- uno</plan>
<step n="1" title="hacer">código</step>
<review pass="no">falta el CSS</review>`);
    const info = agentStalled(t);
    expect(info.stalled).toBe(true);
    expect(info.reason).toBe("revision-pendiente");
    expect(info.iterations).toBe(1);
  });

  it("trabajo sin cerrar con <answer> también está a medias", () => {
    const t = traza(`<plan>- uno</plan>
<step n="1" title="hacer">código</step>
<review pass="yes">bien</review>`);
    expect(agentStalled(t).reason).toBe("sin-respuesta");
  });

  it("mientras escribe (etiqueta abierta) no se considera parado", () => {
    const t = traza(`<plan>- uno</plan>
<step n="1" title="hacer">código a medio`);
    expect(agentStalled(t).stalled).toBe(false);
  });

  it("una respuesta normal sin etiquetas no se toca", () => {
    expect(agentStalled(traza("Hola, ¿en qué te ayudo?")).stalled).toBe(false);
  });

  it("solo un plan, sin pasos, no cuenta como trabajo a medias", () => {
    expect(agentStalled(traza("<plan>- uno\n- dos</plan>")).stalled).toBe(false);
  });
});

describe("continuePrompt", () => {
  it("numera los pasos siguientes desde donde se quedó", () => {
    const p = continuePrompt({ stalled: true, reason: "revision-pendiente", iterations: 2 });
    expect(p).toContain("a partir de 3");
    expect(p).toContain('pass="no"');
  });
  it("explica el otro motivo cuando faltó el cierre", () => {
    const p = continuePrompt({ stalled: true, reason: "sin-respuesta", iterations: 1 });
    expect(p).toContain("<answer>");
    expect(p).toContain("a partir de 2");
  });
});

describe("suggestAgentMode — proponer, nunca imponer", () => {
  it("sugiere ante un encargo de construir algo", () => {
    for (const t of [
      "hazme una página web de portfolio",
      "crea una aplicación de tareas completa",
      "construye un juego de la serpiente en HTML",
      "necesito que programes un dashboard con gráficas",
    ]) {
      expect(suggestAgentMode(t).suggest, t).toBe(true);
    }
  });

  it("NO sugiere ante preguntas ni charla", () => {
    for (const t of [
      "¿qué es una promesa en JavaScript?",
      "cómo se hace una web",
      "hola",
      "gracias, muy bien",
      "explícame el patrón observador",
      "¿cuál es la diferencia entre let y const?",
    ]) {
      expect(suggestAgentMode(t).suggest, t).toBe(false);
    }
  });

  it("NO sugiere si falta el qué o el verbo", () => {
    expect(suggestAgentMode("hazme un favor y revisa esto").suggest).toBe(false);
    expect(suggestAgentMode("una página web bonita").suggest).toBe(false);
  });

  it("ignora mensajes demasiado cortos para juzgar", () => {
    expect(suggestAgentMode("haz web").suggest).toBe(false);
  });

  it("da un motivo distinto según lo que pidas", () => {
    expect(suggestAgentMode("crea una web completa y funcional").reason).toContain("completo");
    expect(suggestAgentMode("hazme una app de notas").reason).toContain("construir");
  });
});
