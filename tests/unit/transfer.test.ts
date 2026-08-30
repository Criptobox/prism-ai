import { describe, it, expect } from "vitest";
import {
  MIN_FRASE,
  TRANSFER_PREFIX,
  fromBase64Url,
  mergeTransfer,
  packTransfer,
  proveedoresUtiles,
  resumirBundle,
  sinTocar,
  toBase64Url,
  type EstadoLocal,
  type TransferBundle,
  unpackTransfer,
} from "../../src/lib/prism/transfer";
import type { ProviderConfig, Session } from "../../src/lib/prism/types";
import { DEFAULT_SETTINGS } from "../../src/lib/prism/types";

const FRASE = "cafe-con-leche";

const cfg = (apiKey: string): ProviderConfig =>
  ({ apiKey, baseUrl: "", enabled: true, models: ["m"] }) as ProviderConfig;

const ses = (id: string, updatedAt: number, n = 1): Session => ({
  id,
  title: id,
  createdAt: 1,
  updatedAt,
  messages: Array.from({ length: n }, (_, i) => ({
    id: `${id}-${i}`,
    role: "user" as const,
    content: "hola",
    createdAt: 1,
  })),
});

const bundle = (over: Partial<TransferBundle> = {}): TransferBundle => ({
  v: 1,
  at: 1000,
  providers: { openai: cfg("sk-secreta") },
  ...over,
});

describe("ida y vuelta", () => {
  it("lo que sale es exactamente lo que entró", async () => {
    const b = bundle({ sessions: [ses("s1", 5)], settings: DEFAULT_SETTINGS });
    const codigo = await packTransfer(b, FRASE);
    expect(await unpackTransfer(codigo, FRASE)).toEqual(b);
  });

  it("el código se reconoce como de Prism y no lleva la clave a la vista", async () => {
    const codigo = await packTransfer(bundle(), FRASE);
    expect(codigo.startsWith(TRANSFER_PREFIX)).toBe(true);
    // lo importante: la clave de API NO se puede leer en el texto
    expect(codigo).not.toContain("sk-secreta");
  });

  it("dos paquetes iguales dan códigos distintos", async () => {
    const a = await packTransfer(bundle(), FRASE);
    const b = await packTransfer(bundle(), FRASE);
    expect(a).not.toBe(b); // sal e IV nuevos cada vez
    expect(await unpackTransfer(b, FRASE)).toEqual(await unpackTransfer(a, FRASE));
  });

  it("sobrevive a pegarlo con saltos de línea", async () => {
    const codigo = await packTransfer(bundle(), FRASE);
    const partido = codigo.replace(/(.{40})/g, "$1\n");
    expect(await unpackTransfer(partido, FRASE)).toEqual(bundle());
  });

  it("aguanta acentos y emoji sin romperse", async () => {
    const b = bundle({ sessions: [{ ...ses("s1", 5), title: "Cañón ñ · 🚀 café" }] });
    const vuelta = await unpackTransfer(await packTransfer(b, FRASE), FRASE);
    expect(vuelta.sessions?.[0].title).toBe("Cañón ñ · 🚀 café");
  });
});

describe("cuando algo va mal, dice qué", () => {
  it("con la frase equivocada no se abre", async () => {
    const codigo = await packTransfer(bundle(), FRASE);
    await expect(unpackTransfer(codigo, "otra-frase-larga")).rejects.toThrow(/frase no coincide/i);
  });

  it("un texto cualquiera se rechaza antes de intentar nada", async () => {
    await expect(unpackTransfer("hola qué tal", FRASE)).rejects.toThrow(/no parece un código/i);
  });

  it("un código cortado se distingue de una frase mala", async () => {
    const codigo = await packTransfer(bundle(), FRASE);
    await expect(unpackTransfer(codigo.slice(0, 20), FRASE)).rejects.toThrow(/incompleto|frase/i);
  });

  it("una frase demasiado corta no llega a generar código", async () => {
    await expect(packTransfer(bundle(), "abc")).rejects.toThrow(
      new RegExp(`${MIN_FRASE} caracteres`)
    );
  });
});

describe("base64 url-safe", () => {
  it("va y vuelve byte a byte", () => {
    const bytes = new Uint8Array([0, 1, 250, 255, 128, 64, 13, 10]);
    expect(Array.from(fromBase64Url(toBase64Url(bytes)))).toEqual(Array.from(bytes));
  });
  it("no usa caracteres que se rompan al pegarlos en una URL", () => {
    const bytes = new Uint8Array(Array.from({ length: 300 }, (_, i) => i % 256));
    expect(toBase64Url(bytes)).not.toMatch(/[+/=]/);
  });
});

describe("resumirBundle", () => {
  it("cuenta lo que se va a aplicar", () => {
    const r = resumirBundle(
      bundle({
        providers: { openai: cfg("sk-1"), groq: cfg("  ") },
        sessions: [ses("a", 1, 3), ses("b", 2, 2)],
        settings: DEFAULT_SETTINGS,
        githubToken: "ghp_x",
      })
    );
    expect(r).toEqual({
      proveedores: 1, // el de clave vacía no cuenta
      conversaciones: 2,
      mensajes: 5,
      ajustes: true,
      github: true,
      fecha: 1000,
    });
  });
});

describe("mergeTransfer", () => {
  const local = (): EstadoLocal => ({
    providers: { openai: cfg("mi-clave-local"), groq: cfg("") } as EstadoLocal["providers"],
    sessions: [ses("mia", 10), ses("compartida", 5)],
    settings: DEFAULT_SETTINGS,
  });

  it("no pisa una clave que ya funciona en este dispositivo", () => {
    const out = mergeTransfer(local(), bundle({ providers: { openai: cfg("clave-de-fuera") } }));
    expect(out.providers.openai.apiKey).toBe("mi-clave-local");
  });

  it("rellena los proveedores que aquí estaban vacíos", () => {
    const out = mergeTransfer(local(), bundle({ providers: { groq: cfg("clave-groq") } }));
    expect(out.providers.groq.apiKey).toBe("clave-groq");
  });

  it("una clave vacía en el paquete no borra la tuya", () => {
    const out = mergeTransfer(local(), bundle({ providers: { openai: cfg("   ") } }));
    expect(out.providers.openai.apiKey).toBe("mi-clave-local");
  });

  it("traer claves NO borra las conversaciones de este dispositivo", () => {
    const out = mergeTransfer(local(), bundle({ sessions: [] }));
    expect(out.sessions.map((s) => s.id).sort()).toEqual(["compartida", "mia"]);
  });

  it("con la misma conversación en los dos, gana la más reciente", () => {
    const out = mergeTransfer(local(), bundle({ sessions: [ses("compartida", 99, 7)] }));
    expect(out.sessions.find((s) => s.id === "compartida")?.messages).toHaveLength(7);
  });

  it("una versión más vieja no pisa la de aquí", () => {
    const out = mergeTransfer(local(), bundle({ sessions: [ses("mia", 2, 9)] }));
    expect(out.sessions.find((s) => s.id === "mia")?.messages).toHaveLength(1);
  });

  it("las conversaciones nuevas se suman, ordenadas por lo más reciente", () => {
    const out = mergeTransfer(local(), bundle({ sessions: [ses("nueva", 50)] }));
    expect(out.sessions[0].id).toBe("nueva");
    expect(out.sessions).toHaveLength(3);
  });

  it("sin ajustes en el paquete se quedan los de aquí", () => {
    const propios = { ...DEFAULT_SETTINGS, temperature: 0.1 };
    const out = mergeTransfer({ ...local(), settings: propios }, bundle());
    expect(out.settings.temperature).toBe(0.1);
  });
});

describe("qué proveedores merece la pena mandar", () => {
  const def = { baseUrl: "https://api.ejemplo.com/v1", defaultModels: ["a", "b"] };
  const base = { apiKey: "", baseUrl: "https://api.ejemplo.com/v1", enabled: false, models: ["a", "b"] };

  it("uno recién instalado no viaja", () => {
    // Iban los DIECISIETE del catálogo, quince de ellos plantillas vacías
    // idénticas al otro lado: el código pasaba de 900 a 5.300 caracteres, o
    // sea por encima del límite de un QR, sin llevar ni un dato tuyo.
    expect(sinTocar(base, def)).toBe(true);
  });

  it("con clave, sí", () => {
    expect(sinTocar({ ...base, apiKey: "sk-algo" }, def)).toBe(false);
  });

  it("activado sin clave también: es una decisión tuya", () => {
    expect(sinTocar({ ...base, enabled: true }, def)).toBe(false);
  });

  it("con una URL propia, sí", () => {
    expect(sinTocar({ ...base, baseUrl: "http://localhost:1234/v1" }, def)).toBe(false);
  });

  it("si tocaste la lista de modelos, sí", () => {
    expect(sinTocar({ ...base, models: ["a"] }, def)).toBe(false);
    expect(sinTocar({ ...base, models: ["b", "a"] }, def)).toBe(false);
    expect(sinTocar({ ...base, models: ["a", "b", "c"] }, def)).toBe(false);
  });

  it("filtra dejando solo los tocados", () => {
    const out = proveedoresUtiles(
      { openai: { ...base, apiKey: "sk-1" }, groq: base, kimi: { ...base, enabled: true } } as never,
      { openai: def, groq: def, kimi: def } as never
    );
    expect(Object.keys(out).sort()).toEqual(["kimi", "openai"]);
  });

  it("uno que no está en el catálogo se manda por si acaso", () => {
    // Mejor mandar de más que perder algo que no supimos reconocer.
    const out = proveedoresUtiles({ raro: base } as never, {} as never);
    expect(Object.keys(out)).toEqual(["raro"]);
  });
});
