import { describe, expect, it } from "vitest";
import { soloAdjuntosDelTurno, notaDeAdjuntos } from "../../src/lib/prism/adjuntos-historial";
import type { Attachment } from "../../src/lib/prism/types";

const img = (name: string): Attachment => ({
  id: name,
  name,
  mediaType: "image/png",
  dataUrl: "data:image/png;base64,AAAA",
  size: 4,
});

describe("soloAdjuntosDelTurno", () => {
  it("el «Hola» sin imagen sale SIN ninguna, aunque antes mandaras una", () => {
    // el fallo real: la foto de hace veinte mensajes viajaba en cada turno y
    // un modelo de texto contestaba «404: no endpoints that support image input»
    const out = soloAdjuntosDelTurno([
      { role: "user", content: "mira esto", attachments: [img("captura.png")] },
      { role: "assistant", content: "vale" },
      { role: "user", content: "Hola" },
    ]);
    expect(out.some((m) => m.attachments?.length)).toBe(false);
    expect(out[0].content).toContain("captura.png");
  });

  it("la imagen del turno actual SÍ viaja", () => {
    const out = soloAdjuntosDelTurno([
      { role: "user", content: "antigua", attachments: [img("vieja.png")] },
      { role: "assistant", content: "ok" },
      { role: "user", content: "y esta?", attachments: [img("nueva.png")] },
    ]);
    expect(out[2].attachments?.map((a) => a.name)).toEqual(["nueva.png"]);
    expect(out[0].attachments).toBeUndefined();
  });

  it("los mensajes sin adjuntos se devuelven intactos", () => {
    const entrada = [
      { role: "user", content: "uno" },
      { role: "assistant", content: "dos" },
    ];
    expect(soloAdjuntosDelTurno(entrada)).toEqual(entrada);
  });

  it("un mensaje vacío con imagen se queda solo con la nota", () => {
    const out = soloAdjuntosDelTurno([
      { role: "user", content: "", attachments: [img("a.png")] },
      { role: "user", content: "sigue" },
    ]);
    expect(out[0].content).toBe("[adjuntado en este mensaje: a.png]");
  });

  it("sin ningún mensaje de usuario no se conserva nada", () => {
    const out = soloAdjuntosDelTurno([
      { role: "assistant", content: "solo yo", attachments: [img("x.png")] },
    ]);
    expect(out[0].attachments).toBeUndefined();
  });
});

describe("notaDeAdjuntos", () => {
  it("nombra los archivos cuando los hay", () => {
    expect(notaDeAdjuntos([img("a.png"), img("b.png")])).toBe(
      "[adjuntado en este mensaje: a.png, b.png]"
    );
  });
  it("sin nombre, cuenta cuántas eran", () => {
    const sinNombre = { ...img("x"), name: "" };
    expect(notaDeAdjuntos([sinNombre])).toBe("[imagen adjunta en este mensaje]");
    expect(notaDeAdjuntos([sinNombre, sinNombre])).toBe("[2 imágenes adjuntas en este mensaje]");
  });
});
