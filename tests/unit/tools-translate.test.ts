/** Tests del traductor de catálogo a los 3 protocolos.
 * El detalle de cada protocolo es lo que rompe la petición si está mal.
 * Estos tests fijan la forma esperada para OpenAI, Anthropic y Gemini. */
import { describe, it, expect } from "vitest";
import {
  translateTools,
  parseToolCallsFromChunk,
  buildToolResultMessage,
  type OpenAITool,
  type AnthropicTool,
  type GeminiTool,
} from "../../src/lib/prism/tools-translate";
import { TOOL_CATALOG } from "../../src/lib/prism/tools-catalog";

describe("translateTools", () => {
  it("devuelve null si el catálogo está vacío", () => {
    expect(translateTools("openai", [])).toBeNull();
    expect(translateTools("anthropic", [])).toBeNull();
    expect(translateTools("gemini", [])).toBeNull();
  });

  it("OpenAI: array de {type:function, function:{name,description,parameters}}", () => {
    const t = translateTools("openai", TOOL_CATALOG) as OpenAITool[];
    expect(Array.isArray(t)).toBe(true);
    expect(t.length).toBe(TOOL_CATALOG.length);
    for (const tool of t) {
      expect(tool.type).toBe("function");
      expect(tool.function.name).toMatch(/^[a-z_]+$/);
      expect(tool.function.description.length).toBeGreaterThan(20);
      expect(tool.function.parameters.type).toBe("object");
    }
  });

  it("Anthropic: array de {name, description, input_schema}", () => {
    const t = translateTools("anthropic", TOOL_CATALOG) as AnthropicTool[];
    expect(Array.isArray(t)).toBe(true);
    for (const tool of t) {
      expect(tool.name).toMatch(/^[a-z_]+$/);
      expect(tool.input_schema.type).toBe("object");
      // Anthropic no admite `type: "function"`: el campo no debe existir.
      expect((tool as unknown as Record<string, unknown>).type).toBeUndefined();
    }
  });

  it("Gemini: objeto con functionDeclarations", () => {
    const t = translateTools("gemini", TOOL_CATALOG) as GeminiTool[];
    expect(Array.isArray(t)).toBe(true);
    expect(t.length).toBe(1); // un solo contenedor
    expect(t[0].functionDeclarations.length).toBe(TOOL_CATALOG.length);
    for (const fd of t[0].functionDeclarations) {
      expect(fd.name).toMatch(/^[a-z_]+$/);
      expect(fd.parameters.type).toBe("object");
    }
  });
});

describe("parseToolCallsFromChunk", () => {
  it("OpenAI: lee tool_calls del delta", () => {
    const chunk = {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                id: "call_abc",
                function: { name: "read_file", arguments: '{"path":"index.html"}' },
              },
            ],
          },
        },
      ],
    };
    const calls = parseToolCallsFromChunk("openai", chunk);
    expect(calls).toHaveLength(1);
    expect(calls[0].id).toBe("call_abc");
    expect(calls[0].name).toBe("read_file");
    expect(calls[0].argsText).toBe('{"path":"index.html"}');
  });

  it("OpenAI: tolera arguments parcial (sin id, sin function)", () => {
    const chunk = {
      choices: [
        { delta: { tool_calls: [{ function: { arguments: '{"path":"inco' } }] } },
      ],
    };
    const calls = parseToolCallsFromChunk("openai", chunk);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("");
    expect(calls[0].argsText).toBe('{"path":"inco');
  });

  it("Anthropic: lee tool_use del content (no-streaming)", () => {
    const chunk = {
      content: [
        { type: "text", text: "Mirando el archivo" },
        { type: "tool_use", id: "toolu_1", name: "read_file", input: { path: "a.js" } },
      ],
    };
    const calls = parseToolCallsFromChunk("anthropic", chunk);
    expect(calls).toHaveLength(1);
    expect(calls[0].id).toBe("toolu_1");
    expect(calls[0].name).toBe("read_file");
    expect(JSON.parse(calls[0].argsText)).toEqual({ path: "a.js" });
  });

  it("Gemini: lee functionCall de candidates", () => {
    const chunk = {
      candidates: [
        {
          content: {
            parts: [
              { text: "Voy a leer" },
              { functionCall: { name: "read_file", args: { path: "b.css" } } },
            ],
          },
        },
      ],
    };
    const calls = parseToolCallsFromChunk("gemini", chunk);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("read_file");
    expect(JSON.parse(calls[0].argsText)).toEqual({ path: "b.css" });
  });

  it("chunk vacío o sin tools devuelve []", () => {
    expect(parseToolCallsFromChunk("openai", {})).toEqual([]);
    expect(parseToolCallsFromChunk("openai", { choices: [] })).toEqual([]);
    expect(parseToolCallsFromChunk("openai", null)).toEqual([]);
    // protocolo desconocido
    expect(parseToolCallsFromChunk("desconocido" as "openai", { choices: [{}] })).toEqual([]);
  });
});

describe("buildToolResultMessage", () => {
  const result = { callId: "call_1", name: "read_file", content: "hola", ok: true };

  it("OpenAI: role 'tool' con tool_call_id", () => {
    const m = buildToolResultMessage("openai", result) as { role: string; tool_call_id: string; content: string };
    expect(m.role).toBe("tool");
    expect(m.tool_call_id).toBe("call_1");
    expect(m.content).toBe("hola");
  });

  it("Anthropic: tool_result dentro de un mensaje user", () => {
    const m = buildToolResultMessage("anthropic", result) as {
      role: string;
      content: { type: string; tool_use_id: string; content: string; is_error: boolean }[];
    };
    expect(m.role).toBe("user");
    expect(m.content[0].type).toBe("tool_result");
    expect(m.content[0].tool_use_id).toBe("call_1");
    expect(m.content[0].is_error).toBe(false);
  });

  it("Anthropic: marca is_error cuando ok=false", () => {
    const m = buildToolResultMessage("anthropic", { ...result, ok: false }) as {
      content: { is_error: boolean }[];
    };
    expect(m.content[0].is_error).toBe(true);
  });

  it("Gemini: functionResponse en una parte de un mensaje user", () => {
    const m = buildToolResultMessage("gemini", result) as {
      role: string;
      parts: { functionResponse: { name: string; response: { name: string; content: string } } }[];
    };
    expect(m.role).toBe("user");
    expect(m.parts[0].functionResponse.name).toBe("read_file");
    expect(m.parts[0].functionResponse.response.content).toBe("hola");
  });
});
