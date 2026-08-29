import { describe, it, expect } from "vitest";
import { tiempoRelativo, tituloVisible, vistaPrevia } from "../../src/lib/prism/session-list";
import type { ChatMessage, Session } from "../../src/lib/prism/types";

const AHORA = new Date("2026-08-29T12:00:00Z").getTime();
const min = (n: number) => AHORA - n * 60_000;

function msg(role: ChatMessage["role"], content: string): ChatMessage {
  return { id: Math.random().toString(36), role, content, createdAt: 1 };
}

function sesion(over: Partial<Session> = {}): Session {
  return { id: "s", title: "Conversación", createdAt: 1, updatedAt: AHORA, messages: [], ...over };
}

describe("tiempoRelativo", () => {
  it("lo reciente es «ahora»", () => {
    expect(tiempoRelativo(AHORA, AHORA)).toBe("ahora");
    expect(tiempoRelativo(min(0.5), AHORA)).toBe("ahora");
  });
  it("minutos, horas y días", () => {
    expect(tiempoRelativo(min(5), AHORA)).toBe("5 min");
    expect(tiempoRelativo(min(150), AHORA)).toBe("2 h");
    expect(tiempoRelativo(min(60 * 24 * 3), AHORA)).toBe("3 d");
  });
  it("a partir de una semana usa la fecha, que dice más que «hace 23 días»", () => {
    const hace23dias = AHORA - 23 * 24 * 60 * 60_000;
    const texto = tiempoRelativo(hace23dias, AHORA);
    expect(texto).not.toMatch(/\bd\b/);
    expect(texto).toMatch(/\d/);
  });
  it("de otro año lleva el año", () => {
    const anoPasado = new Date("2025-03-14T10:00:00Z").getTime();
    expect(tiempoRelativo(anoPasado, AHORA)).toMatch(/25/);
  });
  it("un reloj adelantado no produce «hace -3 min»", () => {
    expect(tiempoRelativo(AHORA + 5 * 60_000, AHORA)).toBe("ahora");
  });
});

describe("vistaPrevia", () => {
  it("prefiere la respuesta del modelo: lo tuyo ya es el título", () => {
    const s = sesion({ messages: [msg("user", "¿Qué es un closure?"), msg("assistant", "Es una función que recuerda su entorno")] });
    expect(vistaPrevia(s)).toBe("Es una función que recuerda su entorno");
  });

  it("si lo último es tuyo, se marca como tuyo", () => {
    const s = sesion({ messages: [msg("assistant", "Dime"), msg("user", "Arregla el login")] });
    expect(vistaPrevia(s)).toBe("Tú: Arregla el login");
  });

  it("un bloque de código no se vuelca entero en la lista", () => {
    const s = sesion({ messages: [msg("assistant", "Prueba esto:\n```js\nconst x = 1;\n```\ny listo")] });
    const v = vistaPrevia(s);
    expect(v).toContain("[código]");
    expect(v).not.toContain("const x");
  });

  it("quita el marcado de Markdown y las imágenes", () => {
    const s = sesion({ messages: [msg("assistant", "## Título\n**negrita** y ![gato](a.png) y [enlace](http://x)")] });
    const v = vistaPrevia(s);
    expect(v).not.toMatch(/[#*]/);
    expect(v).toContain("[imagen]");
    expect(v).toContain("enlace");
    expect(v).not.toContain("http://x");
  });

  it("recorta lo largo con puntos suspensivos", () => {
    const s = sesion({ messages: [msg("assistant", "palabra ".repeat(60))] });
    const v = vistaPrevia(s);
    expect(v.length).toBeLessThanOrEqual(91);
    expect(v.endsWith("…")).toBe(true);
  });

  it("sin mensajes en curso, mira el último hilo archivado", () => {
    const s = sesion({
      messages: [],
      threads: [
        { id: "t1", name: "viejo", messages: [msg("assistant", "de un tema anterior")], archivedAt: 1 },
      ],
    });
    expect(vistaPrevia(s)).toBe("de un tema anterior");
  });

  it("una conversación vacía no inventa nada", () => {
    expect(vistaPrevia(sesion())).toBe("");
  });

  it("ignora los mensajes de sistema y los vacíos", () => {
    const s = sesion({ messages: [msg("assistant", "útil"), msg("system", "eres un bot"), msg("user", "   ")] });
    expect(vistaPrevia(s)).toBe("útil");
  });
});

describe("tituloVisible", () => {
  it("usa el título cuando lo hay", () => {
    expect(tituloVisible(sesion({ title: "Arreglar el login" }))).toBe("Arreglar el login");
  });
  it("«Nueva conversación» con mensajes se sustituye por el primero tuyo", () => {
    const s = sesion({ title: "Nueva conversación", messages: [msg("user", "Explícame los closures")] });
    expect(tituloVisible(s)).toBe("Explícame los closures");
  });
  it("«Nueva conversación» vacía se queda como está", () => {
    expect(tituloVisible(sesion({ title: "Nueva conversación" }))).toBe("Nueva conversación");
  });
});
