import { describe, expect, it } from "vitest";
import {
  CAPACIDAD_QR,
  VERSION_ALTERNATIVA,
  VERSION_EVITADA,
  versionDeModulos,
  versionSegura,
  LIMITE_COMODO,
  cabeEnQr,
  consejoQr,
  estadoQr,
  matrizASvg,
} from "../../src/lib/prism/qr";

const texto = (n: number) => "P".repeat(n);

describe("cuánto cabe en un QR", () => {
  it("las claves solas caben de sobra", () => {
    // medido con packTransfer real: 473 caracteres
    expect(estadoQr(texto(473))).toBe("comodo");
  });

  it("claves y ajustes también", () => {
    expect(estadoQr(texto(955))).toBe("comodo");
  });

  it("una conversación ya sale densa pero entra", () => {
    // 2.938 medidos, contra un tope de 2.953: por quince caracteres
    expect(estadoQr(texto(2938))).toBe("justo");
    expect(cabeEnQr(texto(2938))).toBe(true);
  });

  it("diez conversaciones no caben, y no es opinable", () => {
    expect(estadoQr(texto(20626))).toBe("no-cabe");
    expect(cabeEnQr(texto(20626))).toBe(false);
  });

  it("el límite exacto entra; uno más, no", () => {
    expect(cabeEnQr(texto(CAPACIDAD_QR))).toBe(true);
    expect(cabeEnQr(texto(CAPACIDAD_QR + 1))).toBe(false);
    expect(estadoQr(texto(LIMITE_COMODO))).toBe("comodo");
    expect(estadoQr(texto(LIMITE_COMODO + 1))).toBe("justo");
  });

  it("vacío no es un QR", () => {
    expect(cabeEnQr("")).toBe(false);
  });
});

describe("qué se le dice a quien mira la pantalla", () => {
  it("si entra bien, no se le dice nada", () => {
    expect(consejoQr(texto(500), false)).toBeNull();
  });

  it("si sale denso, se avisa sin alarmar", () => {
    expect(consejoQr(texto(2000), false)).toMatch(/denso/);
  });

  it("si no cabe por las conversaciones, se ofrece la salida de un clic", () => {
    const m = consejoQr(texto(20626), true)!;
    expect(m).toContain("Incluir también las conversaciones");
    // y no deja al usuario sin forma de llevarse el historial
    expect(m).toContain("texto");
  });

  it("si no cabe sin conversaciones, no se le manda a un interruptor que ya está quitado", () => {
    const m = consejoQr(texto(20626), false)!;
    expect(m).not.toContain("Incluir también");
    expect(m).toContain("texto");
  });
});

describe("el SVG del QR", () => {
  const matriz = { lado: 3, oscuro: (f: number, c: number) => (f + c) % 2 === 0 };

  it("pinta un cuadrito por cada módulo oscuro", () => {
    const svg = matrizASvg(matriz, 0);
    expect((svg.match(/h1v1h-1z/g) ?? []).length).toBe(5);
  });

  it("lleva el margen que el lector necesita para encontrar el código", () => {
    expect(matrizASvg(matriz, 4)).toContain('viewBox="0 0 11 11"');
  });

  it("tiene tamaño propio: sin él se rasteriza deformado y no hay quien lo lea", () => {
    const svg = matrizASvg(matriz, 4);
    expect(svg).toContain('width="11"');
    expect(svg).toContain('height="11"');
    expect(svg).not.toContain('width="100%"');
  });

  it("siempre negro sobre blanco, pase lo que pase con el tema", () => {
    // un QR gris sobre gris no lo lee ninguna cámara
    const svg = matrizASvg(matriz);
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('fill="#000000"');
    expect(svg).not.toMatch(/currentColor|var\(--/);
  });
});

describe("la versión 23 se esquiva", () => {
  it("la versión sale del número de módulos", () => {
    expect(versionDeModulos(21)).toBe(1);
    expect(versionDeModulos(109)).toBe(23);
    expect(versionDeModulos(177)).toBe(40);
  });

  it("si al codificador le sale la 23, se le pide la 24", () => {
    // Con datos idénticos, un lector de referencia lee la 20, 21, 22, 24, 25 y
    // 26 y NO lee la 23. No se puede saber cuál de las dos librerías falla, y
    // si es la que genera, un móvil de verdad tampoco la leería.
    expect(versionSegura(109)).toBe(VERSION_ALTERNATIVA);
    expect(VERSION_ALTERNATIVA).toBe(VERSION_EVITADA + 1);
  });

  it("cualquier otra versión se deja como está", () => {
    expect(versionSegura(105)).toBe(0); // v22
    expect(versionSegura(113)).toBe(0); // v24
    expect(versionSegura(21)).toBe(0); // v1
  });
});
