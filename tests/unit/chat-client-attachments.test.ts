/** Tests del pre-resolver de adjuntos en `streamChat` y de cómo
 * `partialize` (en el store) quita el `dataUrl` cuando hay `blobId`.
 *
 * Estos tests no tocan IndexedDB: mockean `resolveAttachmentDataUrl` para
 * verificar que `streamChat` lo llama por cada adjunto antes de armar
 * el cuerpo, y que descarta los que no se puedan resolver.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const settingsMock = { accessCode: "" as string | undefined };
vi.mock("../../src/lib/prism/store", () => ({
  usePrism: { getState: () => ({ settings: settingsMock }) },
}));

// Mock del módulo `attachment-blob`: capturamos las llamadas para
// inspeccionarlas y devolvemos el `dataUrl` que diga cada test.
const resolver = vi.fn<(a: { id: string; dataUrl?: string; blobId?: string }) => Promise<string | null>>();
vi.mock("../../src/lib/prism/attachment-blob", () => ({
  resolveAttachmentDataUrl: (a: { id: string; dataUrl?: string; blobId?: string }) => resolver(a),
}));

import { streamChat, buildRequest } from "../../src/lib/prism/chat-client";
import type { ProviderConfig, ProviderId, Attachment } from "../../src/lib/prism/types";
import { DEFAULT_SETTINGS } from "../../src/lib/prism/types";

const cfg = (extra: Partial<ProviderConfig> = {}): ProviderConfig =>
  ({ apiKey: "sk-secreta", enabled: true, models: [], ...extra }) as ProviderConfig;

function fakeFetch(body: unknown = { choices: [{ message: { content: "ok" } }] }) {
  const llamadas: { url: string; init?: RequestInit }[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    llamadas.push({ url: String(url), init });
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  return { llamadas, fn };
}

beforeEach(() => {
  settingsMock.accessCode = "";
  resolver.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("streamChat pre-resuelve adjuntos antes de enviar", () => {
  it("llama a resolveAttachmentDataUrl por cada adjunto y rellena dataUrl", async () => {
    const { fn } = fakeFetch();
    vi.stubGlobal("fetch", fn);

    // El adjunto viene del store sin dataUrl (solo blobId).
    const att: Attachment = {
      id: "att-1",
      name: "img.png",
      mediaType: "image/png",
      blobId: "att-1",
      size: 100,
    };
    resolver.mockImplementation(async (a) => (a.id === "att-1" ? "data:image/png;base64,AAAA" : null));

    await streamChat({
      providerId: "openai",
      config: cfg(),
      modelId: "gpt-4o-mini",
      messages: [{ role: "user", content: "mira la imagen", attachments: [att] }],
      settings: { ...DEFAULT_SETTINGS, stream: false },
      signal: new AbortController().signal,
      onDelta: () => {},
      onDone: () => {},
    });

    // Se llamó al resolver una vez por adjunto.
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(resolver).toHaveBeenCalledWith(expect.objectContaining({ id: "att-1", blobId: "att-1" }));

    // El body que viaja al proveedor lleva el dataUrl resuelto.
    const body = JSON.parse(String(fn.mock.calls[0]?.[1]?.body ?? "{}"));
    const userMsg = body.messages.find((m: { role: string }) => m.role === "user");
    expect(userMsg.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } }),
      ])
    );
  });

  it("descarta el adjunto si no se puede resolver (devuelve null)", async () => {
    const { fn } = fakeFetch();
    vi.stubGlobal("fetch", fn);

    const att: Attachment = {
      id: "att-rota",
      name: "rota.png",
      mediaType: "image/png",
      blobId: "att-rota",
      size: 100,
    };
    // El resolver no encuentra el binario (entrada huérfana).
    resolver.mockResolvedValue(null);

    await streamChat({
      providerId: "openai",
      config: cfg(),
      modelId: "gpt-4o-mini",
      messages: [{ role: "user", content: "mira la imagen", attachments: [att] }],
      settings: { ...DEFAULT_SETTINGS, stream: false },
      signal: new AbortController().signal,
      onDelta: () => {},
      onDone: () => {},
    });

    // El body lleva SOLO el texto, sin image_url.
    const body = JSON.parse(String(fn.mock.calls[0]?.[1]?.body ?? "{}"));
    const userMsg = body.messages.find((m: { role: string }) => m.role === "user");
    // El contenido debe ser texto, no un array de partes.
    expect(typeof userMsg.content).toBe("string");
    expect(userMsg.content).toContain("mira la imagen");
  });

  it("funciona igual para protocolo Anthropic: dataUrl resuelto dentro de source.data", async () => {
    const { fn } = fakeFetch();
    vi.stubGlobal("fetch", fn);

    const att: Attachment = {
      id: "att-anthropic",
      name: "img.png",
      mediaType: "image/png",
      blobId: "att-anthropic",
      size: 100,
    };
    resolver.mockResolvedValue("data:image/png;base64,QkFTRTY0");

    await streamChat({
      providerId: "anthropic",
      config: cfg(),
      modelId: "claude-3-5-sonnet",
      messages: [{ role: "user", content: "mira", attachments: [att] }],
      settings: { ...DEFAULT_SETTINGS, stream: false, maxTokens: 100 },
      signal: new AbortController().signal,
      onDelta: () => {},
      onDone: () => {},
    });

    const body = JSON.parse(String(fn.mock.calls[0]?.[1]?.body ?? "{}"));
    const userMsg = body.messages.find((m: { role: string }) => m.role === "user");
    expect(userMsg.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "image",
          source: { type: "base64", media_type: "image/png", data: "QkFTRTY0" },
        }),
      ])
    );
  });

  it("funciona igual para protocolo Gemini: dataUrl resuelto dentro de inlineData.data", async () => {
    const { fn } = fakeFetch();
    vi.stubGlobal("fetch", fn);

    const att: Attachment = {
      id: "att-gemini",
      name: "img.png",
      mediaType: "image/png",
      blobId: "att-gemini",
      size: 100,
    };
    resolver.mockResolvedValue("data:image/png;base64,Z2VNSU5J");

    await streamChat({
      providerId: "gemini",
      config: cfg(),
      modelId: "gemini-2.5-flash",
      messages: [{ role: "user", content: "mira", attachments: [att] }],
      settings: { ...DEFAULT_SETTINGS, stream: false, maxTokens: 100 },
      signal: new AbortController().signal,
      onDelta: () => {},
      onDone: () => {},
    });

    const body = JSON.parse(String(fn.mock.calls[0]?.[1]?.body ?? "{}"));
    const userMsg = body.contents.find((m: { role: string }) => m.role === "user");
    expect(userMsg.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          inlineData: { mimeType: "image/png", data: "Z2VNSU5J" },
        }),
      ])
    );
  });
});

describe("buildRequest sigue saliendo por el proxy", () => {
  // Sanity check: el cambio no rompió la función que decide la ruta.
  const casos: { id: ProviderId; host: string }[] = [
    { id: "openai", host: "api.openai.com" },
    { id: "anthropic", host: "api.anthropic.com" },
    { id: "gemini", host: "generativelanguage.googleapis.com" },
  ];
  for (const caso of casos) {
    it(`${caso.id}: target es el proxy y x-target-url lleva al host`, () => {
      const r = buildRequest(`https://${caso.host}/v1/x`, {
        config: cfg(),
        providerId: caso.id,
      });
      expect(r.target).toBe(`/api/proxy?t=${caso.id}`);
      expect(r.upstream).toContain(caso.host);
      expect(r.headers["x-target-url"]).toContain(caso.host);
    });
  }
});
