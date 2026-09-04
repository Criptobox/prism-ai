/** Prism AI — El director reparte, los ejecutores hacen, el director cierra.
 *
 * Lo que más se prueba aquí no es que funcione: es que **no se descontrole**.
 * Con un modelo de pago dirigiendo, lo que hace usable esta pieza es que el
 * número de llamadas se sepa antes de arrancar y no pueda crecer.
 */
import { describe, expect, it } from "vitest";
import {
  llamadasDe,
  avisoPrevio,
  promptDeReparto,
  parseReparto,
  promptDeEjecutor,
  promptDeVeredicto,
  estadoOrquesta,
  mereceOrquesta,
  repartoFallido,
  MAX_EJECUTORES,
  MAX_CHARS_ENCARGO,
  MAX_CHARS_RESULTADO,
  type Resultado,
  type SubEncargo,
} from "../../src/lib/prism/orquesta";

const sub = (titulo: string, instruccion = "haz algo concreto"): SubEncargo => ({
  titulo,
  instruccion,
});

describe("el gasto no puede descontrolarse", () => {
  it("un encargo son exactamente 2 + n llamadas, siempre", () => {
    // reparto + ejecutores + veredicto. No hay bucle ni «una ronda más».
    expect(llamadasDe(1)).toBe(3);
    expect(llamadasDe(3)).toBe(5);
    expect(llamadasDe(4)).toBe(6);
  });

  it("pedir más ejecutores de la cuenta NO sube el número de llamadas", () => {
    // El techo es duro: es lo que hace que se pueda prometer un número.
    expect(llamadasDe(99)).toBe(2 + MAX_EJECUTORES);
    expect(llamadasDe(0)).toBe(3);
    expect(llamadasDe(-5)).toBe(3);
  });

  it("el aviso separa lo del director de lo de los ejecutores", () => {
    // Es la distinción que importa cuando uno se paga y los otros no.
    const a = avisoPrevio(3, "arregla el menú móvil de la landing");
    expect(a.llamadas).toBe(5);
    expect(a.llamadasDirector).toBe(2);
    expect(a.llamadasEjecutores).toBe(3);
    expect(a.texto).toContain("5 llamadas");
    expect(a.texto).toContain("No hay más rondas");
  });

  it("el aviso NO inventa un precio en dinero", () => {
    // Los precios varían por proveedor y con el tiempo, y no se pueden saber
    // desde el dispositivo. Un «≈ 0,02 $» en pantalla es peor que nada.
    const a = avisoPrevio(3, "x".repeat(100));
    expect(a.texto).not.toMatch(/[$€]|\bUSD\b|coste|precio/i);
  });

  it("cuenta los caracteres que se mandan, y respeta el tope", () => {
    expect(avisoPrevio(2, "hola").charsEncargo).toBe(4);
    expect(avisoPrevio(2, "x".repeat(99_999)).charsEncargo).toBe(MAX_CHARS_ENCARGO);
  });
});

describe("promptDeReparto", () => {
  it("pide trozos INDEPENDIENTES: si dependen entre sí, el reparto no sirve", () => {
    const p = promptDeReparto("haz una landing", 3);
    expect(p).toContain("EN PARALELO");
    expect(p).toMatch(/no se ven entre sí/i);
    expect(p).toMatch(/SIN ver lo que hacen los demás/i);
    expect(p).toContain("Exactamente 3 trozos");
  });

  it("deja salida cuando el encargo no da para repartir", () => {
    // Obligar a partir lo que no se puede partir produce tres versiones del
    // mismo trabajo, que es peor que no repartir.
    expect(promptDeReparto("algo", 3)).toMatch(/un solo trozo con el encargo entero/i);
  });

  it("recorta el encargo al tope", () => {
    const p = promptDeReparto("y".repeat(99_999), 2);
    expect(p.length).toBeLessThan(MAX_CHARS_ENCARGO + 3_000);
  });

  it("respeta el techo de ejecutores también aquí", () => {
    expect(promptDeReparto("x", 99)).toContain(`Exactamente ${MAX_EJECUTORES} trozos`);
  });
});

describe("parseReparto", () => {
  it("lee los trozos con su título", () => {
    const r = parseReparto(
      '<trozo titulo="HTML">escribe el html</trozo>\n<trozo titulo="CSS">escribe el css</trozo>'
    );
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({ titulo: "HTML", instruccion: "escribe el html" });
    expect(r[1].titulo).toBe("CSS");
  });

  it("aguanta que el modelo meta texto antes y después", () => {
    const r = parseReparto('Claro, aquí va:\n<trozo titulo="A">uno</trozo>\n¿Te sirve?');
    expect(r).toHaveLength(1);
    expect(r[0].instruccion).toBe("uno");
  });

  it("aguanta comillas simples y sin comillas", () => {
    expect(parseReparto("<trozo titulo='A'>uno</trozo>")[0].titulo).toBe("A");
    expect(parseReparto("<trozo titulo=A>uno</trozo>")[0].titulo).toBe("A");
  });

  it("pone un título por defecto si el modelo no lo puso", () => {
    expect(parseReparto('<trozo titulo="">uno</trozo>')[0].titulo).toBe("Parte 1");
  });

  it("ignora los trozos vacíos: un trozo sin encargo no es un ejecutor", () => {
    const r = parseReparto('<trozo titulo="A">  </trozo><trozo titulo="B">algo</trozo>');
    expect(r).toHaveLength(1);
    expect(r[0].titulo).toBe("B");
  });

  it("nunca devuelve más del máximo, aunque el modelo se pase", () => {
    const muchos = Array.from({ length: 20 }, (_, i) => `<trozo titulo="T${i}">x</trozo>`).join("");
    expect(parseReparto(muchos)).toHaveLength(MAX_EJECUTORES);
  });

  it("si no hay nada legible NO inventa: lista vacía", () => {
    // El que llama decide, y lo razonable es hacer el encargo del tirón.
    expect(parseReparto("no entendí la petición")).toEqual([]);
    expect(parseReparto("")).toEqual([]);
    expect(repartoFallido(parseReparto("nada"))).toBe(true);
  });
});

describe("promptDeEjecutor — la compartimentación", () => {
  it("el ejecutor ve SU trozo y nada más", () => {
    // Aquí está lo que evita que tu historial acabe repartido entre cuatro
    // proveedores distintos porque sí.
    const p = promptDeEjecutor(sub("CSS", "escribe la hoja de estilos"));
    expect(p).toContain("escribe la hoja de estilos");
    expect(p).toContain("CSS");
    expect(p).toMatch(/no ves lo que hacen los demás/i);
  });

  it("le pide trabajo hecho, no propuestas", () => {
    const p = promptDeEjecutor(sub("A"));
    expect(p).toMatch(/entrega el trabajo hecho/i);
    expect(p).toMatch(/no preguntes/i);
  });

  it("y le deja decir que algo es imposible sin bloquearse", () => {
    expect(promptDeEjecutor(sub("A"))).toMatch(/dilo en una línea al final y entrega el resto/i);
  });
});

describe("promptDeVeredicto", () => {
  const res = (titulo: string, texto: string, error?: string): Resultado => ({
    sub: sub(titulo),
    quien: { providerId: "openrouter", modelId: "m" },
    texto,
    ...(error ? { error } : {}),
  });

  it("le pide que corrija, no que firme lo que le llega", () => {
    const p = promptDeVeredicto("haz una web", [res("A", "uno"), res("B", "dos")]);
    expect(p).toMatch(/No lo firmes por venir de otro/i);
    expect(p).toContain("uno");
    expect(p).toContain("dos");
  });

  it("le obliga a decir lo que NO pudo verificar", () => {
    // Un veredicto que firma lo que no comprobó vale menos que ninguno.
    const p = promptDeVeredicto("x", [res("A", "algo")]);
    expect(p).toContain("Sin verificar:");
    expect(p).toMatch(/No inventes para tapar un hueco/i);
  });

  it("cuenta las partes que no entregaron y le dice qué hacer", () => {
    const p = promptDeVeredicto("x", [res("A", "ok"), res("B", "", "429"), res("C", "", "timeout")]);
    expect(p).toContain("2 parte(s) no entregaron");
    expect(p).toContain("[no entregó: 429]");
  });

  it("una respuesta vacía se marca como tal, no se cuela como buena", () => {
    expect(promptDeVeredicto("x", [res("A", "   ")])).toContain("[respuesta vacía]");
  });

  it("recorta lo que vuelve: el veredicto es la llamada que pagas", () => {
    const p = promptDeVeredicto("x", [res("A", "z".repeat(99_999))]);
    expect(p.length).toBeLessThan(MAX_CHARS_RESULTADO + 4_000);
  });

  it("le prohíbe contar el proceso: el usuario pidió un trabajo", () => {
    expect(promptDeVeredicto("x", [res("A", "y")])).toMatch(/NO menciones a los ejecutores/i);
  });
});

describe("estadoOrquesta", () => {
  it("dice en qué va, y cuántos de cuántos", () => {
    expect(estadoOrquesta("repartiendo")).toContain("repartiendo");
    expect(estadoOrquesta("ejecutando", 2, 3)).toContain("(2/3)");
    expect(estadoOrquesta("veredicto")).toContain("revisando");
  });

  it("sin porcentajes inventados", () => {
    expect(estadoOrquesta("ejecutando", 1, 3)).not.toContain("%");
  });
});

describe("mereceOrquesta", () => {
  it("un encargo de verdad, sí", () => {
    expect(mereceOrquesta("arregla el menú móvil y añade una sección de precios a la landing")).toBe(
      true
    );
  });

  it("un saludo o un encargo mínimo, no: seis llamadas para nada", () => {
    expect(mereceOrquesta("hola")).toBe(false);
    expect(mereceOrquesta("gracias, muy bien")).toBe(false);
    expect(mereceOrquesta("")).toBe(false);
    expect(mereceOrquesta("   ")).toBe(false);
  });
});
