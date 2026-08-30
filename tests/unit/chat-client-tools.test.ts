/** Test unitario de `streamChat` no-streaming con tool_calls.
 * Verifica que el callback `onToolCalls` se dispara cuando el cuerpo
 * no-streaming trae `message.tool_calls`. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const settingsMock = { accessCode: "" };
vi.mock("../../src/lib/prism/store", () => ({
  usePrism: { getState: () => ({ settings: settingsMock }) },
}));

// No necesitamos resolver adjuntos en este test.
vi.mock("../../src/lib/prism/attachment-blob", () => ({
  resolveAttachmentDataUrl: async (a: { dataUrl?: string; blobId?: string }) => a.dataUrl ?? null,
}));

import { streamChat } from "../../src/lib/prism/chat-client";
import type { ProviderConfig } from "../../src/lib/prism/types";
import { DEFAULT_SETTINGS } from "../../src/lib/prism/types";
import { TOOL_CATALOG } from "../../src/lib/prism/tools-catalog";

const cfg = (extra: Partial<ProviderConfig> = {}): ProviderConfig =>
  ({ apiKey: "sk-x", enabled: true, models: [], ...extra }) as ProviderConfig;

function fakeFetch(body: unknown) {
  const fn = vi.fn(async () => {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  return fn;
}

beforeEach(() => {
  settingsMock.accessCode = "";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("streamChat no-streaming con tools", () => {
  it("captura tool_calls del message.tool_calls y llama onToolCalls", async () => {
    const toolCalls = [
      { id: "call_1", type: "function", function: { name: "list_files", arguments: "{}" } },
    ];
    const fn = fakeFetch({ choices: [{ message: { content: "", tool_calls: toolCalls } }] });
    vi.stubGlobal("fetch", fn);

    let captured: { calls: { id: string; name: string }[]; done: string } = { calls: [], done: "" };
    await streamChat({
      providerId: "openai",
      config: cfg(),
      modelId: "gpt-4o-mini",
      messages: [{ role: "user", content: "lista archivos" }],
      settings: { ...DEFAULT_SETTINGS, stream: false },
      signal: new AbortController().signal,
      tools: TOOL_CATALOG,
      onDelta: () => {},
      onDone: (full) => { captured.done = full; },
      onToolCalls: (calls) => { captured.calls = calls.map((c) => ({ id: c.id, name: c.name })); },
    });

    expect(captured.calls, "onToolCalls recibió las llamadas").toHaveLength(1);
    expect(captured.calls[0].name).toBe("list_files");
    expect(captured.calls[0].id).toBe("call_1");
  });

  it("si no hay tool_calls, no llama onToolCalls", async () => {
    const fn = fakeFetch({ choices: [{ message: { content: "hola" } }] });
    vi.stubGlobal("fetch", fn);

    let called = false;
    await streamChat({
      providerId: "openai",
      config: cfg(),
      modelId: "gpt-4o-mini",
      messages: [{ role: "user", content: "hola" }],
      settings: { ...DEFAULT_SETTINGS, stream: false },
      signal: new AbortController().signal,
      tools: TOOL_CATALOG,
      onDelta: () => {},
      onDone: () => {},
      onToolCalls: () => { called = true; },
    });

    expect(called).toBe(false);
  });
});
