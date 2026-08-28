import { describe, expect, it } from "vitest";
import {
  compressHistory,
  cavemanEs,
  liteCompress,
  savingsPercent,
} from "../../src/lib/prism/compress";

describe("compresión de contexto (RTK/Caveman adaptado)", () => {
  it("lite colapsa espacios y saltos sin tocar palabras", () => {
    const out = liteCompress("Hola   mundo\n\n\n\nnueva   línea  ");
    expect(out).toBe("Hola mundo\n\nnueva línea");
  });

  it("GUARDIÁN: los bloques de código se preservan byte a byte", () => {
    const code = '```\nfunction  x( ){\n    return   "a     b";\n}\n```';
    const out = liteCompress(`Antes:\n\n${code}\n\nDespués   del   bloque.`);
    expect(out).toContain('function  x( ){\n    return   "a     b";\n}');
  });

  it("GUARDIÁN: las URLs y el código en línea quedan intactos", () => {
    const url = "https://ejemplo.com/ruta?a=1&b=2";
    const out = liteCompress(`Mira   ${url}  y usa \`npm   install\`   luego.`);
    expect(out).toContain(url);
    expect(out).toContain("`npm   install`");
  });

  it("cavemanEs elimina muletillas ES sin tocar el código", () => {
    const txt =
      "Por supuesto, básicamente esto funciona. Cabe mencionar que la función es corta:\n\n```js\n// por supuesto, esto es código\nconst a = 1;\n```";
    const out = cavemanEs(txt);
    expect(out).not.toContain("Por supuesto");
    expect(out).not.toContain("Cabe mencionar");
    expect(out).toContain("// por supuesto, esto es código");
  });

  it("compressHistory off no cambia nada", () => {
    const msgs = [{ role: "assistant" as const, content: "x   ".repeat(200) }];
    const r = compressHistory(msgs, "off");
    expect(r.messages[0].content).toBe(msgs[0].content);
    expect(r.savedChars).toBe(0);
  });

  it("la pregunta viva del usuario NUNCA se comprime", () => {
    const pregunta = "¿Cuál es exactamente   el error   de este código?".padEnd(150, ".");
    const msgs = [
      { role: "assistant" as const, content: "Respuesta   larga   con   espacios. ".repeat(10) },
      { role: "user" as const, content: pregunta },
    ];
    const r = compressHistory(msgs, "standard", 1);
    expect(r.messages[1].content).toBe(pregunta);
    expect(r.messages[0].content).not.toBe(msgs[0].content);
    expect(r.savedChars).toBeGreaterThan(0);
  });

  it("los mensajes cortos se dejan como están", () => {
    const msgs = [{ role: "user" as const, content: "corto" }];
    const r = compressHistory(msgs, "standard", 0);
    expect(r.messages[0].content).toBe("corto");
  });

  it("standard deduplica párrafos repetidos entre turnos", () => {
    const para =
      "Este es un parrafo repetido que aparece en dos turnos distintos de la conversacion larga y tiene suficiente longitud para pasar el filtro de mensajes cortos.";
    const msgs = [
      { role: "assistant" as const, content: `${para}\n\nPrimera respuesta con más texto.` },
      { role: "user" as const, content: "otra   pregunta   algo   larga   para   pasar   el   filtro   de   corto" },
      { role: "assistant" as const, content: `${para}\n\nSegunda respuesta.` },
    ];
    const r = compressHistory(msgs, "standard", 1);
    expect(r.messages[2].content).toContain("⟪repetido⟫");
    expect(r.messages[0].content).toContain(para);
  });

  it("savingsPercent calcula el porcentaje", () => {
    expect(savingsPercent(1000, 340)).toBe(34);
    expect(savingsPercent(0, 100)).toBe(0);
  });
});
