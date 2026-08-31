/** Prism AI — Presupuesto del prompt y modo ahorro.
 *
 * El medidor y el prompt salen de la MISMA función a propósito: uno que
 * calculara por su cuenta se desincronizaría a la primera pieza nueva y
 * enseñaría un número falso, que es peor que no enseñar nada. Estos tests
 * vigilan justo eso.
 */
import { describe, it, expect } from "vitest";
import {
  construirPrompt,
  nivelPresupuesto,
  piezaMasGorda,
  tokensAprox,
  TEXTO_AHORRO,
  AVISO_ALTO,
  AVISO_CRITICO,
  CHARS_POR_TOKEN,
} from "../../src/lib/prism/presupuesto";
import { BUILTIN_SKILLS } from "../../src/lib/prism/skills-data";
import { DEFAULT_SETTINGS } from "../../src/lib/prism/types";
import { agentPrompt } from "../../src/lib/prism/agent-loop";

const base = { sistema: "Eres Prism AI." };

describe("construirPrompt — lo medido es lo que se manda", () => {
  it("el total coincide EXACTAMENTE con la longitud del prompt", () => {
    const { prompt, presupuesto } = construirPrompt({
      ...base,
      skills: "### Skill activa: Web\ninstrucciones largas",
      agente: "## MODO AGENTE\nbucle",
    });
    expect(presupuesto.total).toBe(prompt.length);
  });

  it("la suma de las piezas más los separadores da el total", () => {
    const { prompt, presupuesto } = construirPrompt({
      ...base,
      estilo: "[Estilo: conciso] corto",
      mapa: "## MAPA\nindex.html",
    });
    // cada texto declarado está de verdad dentro del prompt
    expect(prompt).toContain("Eres Prism AI.");
    expect(prompt).toContain("[Estilo: conciso] corto");
    expect(prompt).toContain("## MAPA\nindex.html");

    const suma = presupuesto.piezas.reduce((a, p) => a + p.chars, 0);
    const separadores = (presupuesto.piezas.length - 1) * 2; // "\n\n"
    expect(suma + separadores).toBe(presupuesto.total);
    expect(presupuesto.piezas.every((p) => p.chars > 0)).toBe(true);
  });

  it("las piezas vacías no ocupan sitio ni salen en el desglose", () => {
    const { presupuesto } = construirPrompt({ ...base, skills: "", mapa: null, agente: undefined });
    expect(presupuesto.piezas.map((p) => p.id)).toEqual(["sistema"]);
  });

  it("el orden es fijo: lo general antes que lo específico", () => {
    const { presupuesto } = construirPrompt({
      ...base,
      mapa: "mapa",
      skills: "skills",
      agente: "agente",
    });
    expect(presupuesto.piezas.map((p) => p.id)).toEqual(["sistema", "skills", "agente", "mapa"]);
  });
});

describe("modo ahorro", () => {
  it("mete su instrucción y quita la ficha, que es un resumen del mapa que ya viaja entero", () => {
    const entrada = { ...base, ficha: "## FICHA DEL PROYECTO\nresumen", mapa: "## MAPA\ndetalle" };
    const con = construirPrompt({ ...entrada, ahorro: true });
    const sin = construirPrompt({ ...entrada, ahorro: false });

    expect(con.prompt).toContain("MODO AHORRO");
    expect(con.presupuesto.piezas.map((p) => p.id)).not.toContain("ficha");
    expect(sin.presupuesto.piezas.map((p) => p.id)).toContain("ficha");
    expect(con.prompt).toContain("## MAPA"); // el mapa se queda: es el detalle
  });

  it("no deja dos instrucciones de tono peleándose", () => {
    const con = construirPrompt({ ...base, estilo: "[Estilo: detallado] explica mucho", ahorro: true });
    expect(con.prompt).not.toContain("Estilo: detallado");
    expect(con.presupuesto.piezas.map((p) => p.id)).not.toContain("estilo");
  });

  it("informa del ahorro REAL, no de una promesa", () => {
    // una ficha gorda: lo que se quita tiene que notarse en el número
    const ficha = "## FICHA DEL PROYECTO\n" + "x".repeat(3000);
    const con = construirPrompt({ ...base, ficha, mapa: "mapa", ahorro: true });
    expect(con.presupuesto.totalSinAhorro).toBeGreaterThan(con.presupuesto.total);
    // y el número de referencia es de verdad el del prompt sin ahorro
    const sin = construirPrompt({ ...base, ficha, mapa: "mapa", ahorro: false });
    expect(con.presupuesto.totalSinAhorro).toBe(sin.presupuesto.total);
  });

  it("con el ahorro apagado, el total y la referencia son el mismo número", () => {
    const r = construirPrompt({ ...base, mapa: "mapa" });
    expect(r.presupuesto.totalSinAhorro).toBe(r.presupuesto.total);
  });

  it("la instrucción de ahorro es corta: una que ocupe 2.000 se come lo que ahorra", () => {
    expect(TEXTO_AHORRO.length).toBeLessThan(700);
  });
});

describe("avisos", () => {
  it("los umbrales van en orden y clasifican", () => {
    expect(AVISO_ALTO).toBeLessThan(AVISO_CRITICO);
    expect(nivelPresupuesto(0)).toBe("ok");
    expect(nivelPresupuesto(AVISO_ALTO)).toBe("alto");
    expect(nivelPresupuesto(AVISO_CRITICO)).toBe("critico");
  });

  it("señala la pieza más gorda, que es por donde se empieza a recortar", () => {
    const { presupuesto } = construirPrompt({
      ...base,
      skills: "x".repeat(4000),
      agente: "y".repeat(100),
    });
    expect(piezaMasGorda(presupuesto)?.id).toBe("skills");
  });

  it("sin piezas no se inventa una", () => {
    expect(piezaMasGorda({ piezas: [], total: 0, totalSinAhorro: 0 })).toBeNull();
  });

  it("los tokens son una aproximación declarada, con el divisor a la vista", () => {
    expect(CHARS_POR_TOKEN).toBe(4);
    expect(tokensAprox(4000)).toBe(1000);
  });
});

/* ------------------------------------------------------------------ */
/* Guarda de fábrica                                                  */
/* ------------------------------------------------------------------ */

describe("lo que se manda recién instalada la app", () => {
  const activas = BUILTIN_SKILLS.filter((s) => s.enabled);
  const bloqueSkills = activas
    .map((s) => `### Skill activa: ${s.name}\n${s.instructions}`)
    .join("\n\n");

  it("las skills de fábrica no se pasan de presupuesto", () => {
    const { presupuesto } = construirPrompt({
      sistema: DEFAULT_SETTINGS.systemPrompt,
      skills: bloqueSkills,
    });
    // Iba en 3.790 caracteres porque «Desarrollador web experto» repetía
    // entero el bloque de variedad visual que ES la otra skill. Este tope
    // existe para que esa duplicación no vuelva por la puerta de atrás.
    expect(presupuesto.total).toBeLessThan(3_000);
    expect(nivelPresupuesto(presupuesto.total)).toBe("ok");
  });

  it("con el agente encendido sigue por debajo del aviso", () => {
    const { presupuesto } = construirPrompt({
      sistema: DEFAULT_SETTINGS.systemPrompt,
      skills: bloqueSkills,
      agente: agentPrompt(3),
    });
    expect(presupuesto.total).toBeLessThan(AVISO_ALTO);
  });

  it("la variedad visual la explica UNA skill, no dos", () => {
    const cuantas = activas.filter((s) =>
      /VARIEDAD OBLIGATORIA|nunca se parezcan/i.test(s.instructions)
    ).length;
    expect(cuantas, "solo «Diseños que no se repiten» manda sobre esto").toBe(1);
  });
});
