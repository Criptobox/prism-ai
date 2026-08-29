import { describe, expect, it } from "vitest";
import {
  sinSecretos,
  textoDiagnostico,
  type EntradaDiagnostico,
} from "../../src/lib/prism/diagnostics";

const CLAVE = "sk-super-secreta-1234567890";

function entrada(over: Partial<EntradaDiagnostico> = {}): EntradaDiagnostico {
  return {
    version: "3.6.0",
    commit: "abc1234",
    built: "2026-08-29",
    userAgent: "Mozilla/5.0 (Linux; Android 14)",
    idioma: "es-ES",
    pantalla: "390x844",
    online: true,
    instalada: true,
    modeloPorDefecto: "gemini::gemini-3.1-flash-lite",
    proveedores: [
      {
        id: "gemini",
        nombre: "Google Gemini",
        activo: true,
        tieneClave: true,
        largoClave: CLAVE.length,
        modelos: 4,
        porProxy: true,
      },
    ],
    fallos: [{ clave: "gemini::gemini-3.1-flash-lite", estado: 429, motivo: "límite", enfriadoHasta: 2_000 }],
    sesiones: 12,
    mensajes: 340,
    ahora: 1_000,
    ...over,
  };
}

describe("sinSecretos", () => {
  it("tira la query, que es donde viaja la clave de varios proveedores", () => {
    expect(sinSecretos(`https://api.ejemplo.com/v1?key=${CLAVE}`)).toBe("https://api.ejemplo.com/v1");
  });

  it("tira también el usuario y la contraseña de la propia URL", () => {
    expect(sinSecretos(`https://usuario:${CLAVE}@api.ejemplo.com/v1`)).toBe("https://api.ejemplo.com/v1");
  });

  it("con una ruta relativa se queda con lo de antes del «?»", () => {
    expect(sinSecretos(`/api/mock-llm?token=${CLAVE}`)).toBe("/api/mock-llm");
  });

  it("una URL normal sobrevive entera", () => {
    expect(sinSecretos("https://api.ejemplo.com/v1/")).toBe("https://api.ejemplo.com/v1");
  });

  it("vacío es vacío", () => {
    expect(sinSecretos("   ")).toBe("");
  });
});

describe("textoDiagnostico", () => {
  it("lleva lo que hace falta para localizar un fallo", () => {
    const t = textoDiagnostico(entrada());
    expect(t).toContain("v3.6.0 · abc1234");
    expect(t).toContain("Google Gemini");
    expect(t).toContain("HTTP 429");
    expect(t).toContain("límite");
    expect(t).toContain("12 conversaciones");
    expect(t).toContain("340 mensajes");
  });

  it("dice si hay clave y cuánto mide, nunca cuál es", () => {
    const t = textoDiagnostico(entrada());
    expect(t).toContain(`clave: sí (${CLAVE.length} caracteres)`);
    expect(t).not.toContain(CLAVE);
  });

  it("distingue «sin clave» de «clave pegada a medias»", () => {
    const sin = textoDiagnostico(
      entrada({
        proveedores: [
          { id: "x", nombre: "X", activo: true, tieneClave: false, largoClave: 0, modelos: 1, porProxy: false },
        ],
      })
    );
    expect(sin).toContain("clave: NO");
  });

  it("la clave no se cuela por la URL propia del proveedor", () => {
    const t = textoDiagnostico(
      entrada({
        proveedores: [
          {
            id: "custom",
            nombre: "Personalizado",
            activo: true,
            tieneClave: true,
            largoClave: 8,
            modelos: 1,
            porProxy: false,
            baseUrl: sinSecretos(`https://mi-proxy.com/v1?api_key=${CLAVE}`),
          },
        ],
      })
    );
    expect(t).toContain("https://mi-proxy.com/v1");
    expect(t).not.toContain(CLAVE);
  });

  it("no hay hueco por el que salga la clave", () => {
    // Se mete la clave por TODOS los campos de texto a la vez: si alguno la
    // deja pasar sin limpiar, este test lo dice.
    const t = textoDiagnostico(
      entrada({
        modeloPorDefecto: "modelo-normal",
        userAgent: "navegador-normal",
        proveedores: [
          {
            id: "custom",
            nombre: "Personalizado",
            activo: true,
            tieneClave: true,
            largoClave: CLAVE.length,
            modelos: 2,
            porProxy: false,
            baseUrl: sinSecretos(`https://x.com/v1?k=${CLAVE}#${CLAVE}`),
          },
        ],
        fallos: [{ clave: "custom::modelo", estado: 401, motivo: "clave inválida" }],
      })
    );
    expect(t).not.toContain(CLAVE);
    expect(t).not.toMatch(/sk-/);
  });

  it("cuenta los mensajes, no los copia", () => {
    const t = textoDiagnostico(entrada({ mensajes: 340 }));
    expect(t).toContain("340 mensajes");
    // el informe es corto por definición: si creciera con la conversación
    // sería porque alguien metió contenido dentro
    expect(t.length).toBeLessThan(2_000);
  });

  it("sin proveedores ni fallos lo dice en lugar de dejar un hueco", () => {
    const t = textoDiagnostico(entrada({ proveedores: [], fallos: [] }));
    expect(t).toContain("(ninguno configurado)");
    expect(t).toContain("Modelos que están fallando: ninguno");
  });

  it("el enfriamiento se cuenta desde el momento que se le pasa", () => {
    const t = textoDiagnostico(entrada({ ahora: 1_000, fallos: [{ clave: "a::b", estado: 429, enfriadoHasta: 61_000 }] }));
    expect(t).toContain("enfriado 60s");
  });
});

describe("se lee como algo escrito, no generado", () => {
  it("una conversación es «conversación», no «1 conversaciones»", () => {
    const t = textoDiagnostico(entrada({ sesiones: 1, mensajes: 1 }));
    expect(t).toContain("1 conversación ·");
    expect(t).toContain("1 mensaje");
    expect(t).not.toContain("1 conversaciones");
  });
});

describe("solo lo que el usuario ha tocado", () => {
  const vacio = (id: string) => ({
    id,
    nombre: id,
    activo: false,
    tieneClave: false,
    largoClave: 0,
    modelos: 5,
    porProxy: true,
  });

  it("los del catálogo sin tocar se cuentan, no se listan", () => {
    // Son diecisiete: listarlos todos entierra la línea que importa bajo
    // dieciséis «apagado · clave: NO».
    const t = textoDiagnostico(
      entrada({
        proveedores: [
          {
            id: "gemini",
            nombre: "Google Gemini",
            activo: true,
            tieneClave: true,
            largoClave: 30,
            modelos: 4,
            porProxy: true,
          },
          vacio("openai"),
          vacio("anthropic"),
          vacio("groq"),
        ],
      })
    );
    expect(t).toContain("Proveedores configurados (1 de 4)");
    expect(t).toContain("Google Gemini");
    expect(t).toContain("(otros 3 del catálogo, sin tocar)");
    expect(t).not.toContain("anthropic");
  });

  it("uno apagado pero con clave sí sale: es justo el caso raro que se depura", () => {
    const t = textoDiagnostico(
      entrada({
        proveedores: [
          { id: "groq", nombre: "Groq", activo: false, tieneClave: true, largoClave: 20, modelos: 3, porProxy: false },
        ],
      })
    );
    expect(t).toContain("Groq");
    expect(t).toContain("apagado");
  });
});
