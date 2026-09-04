/** Prism AI — Memoria negativa: los patrones y el bloqueo.
 *
 * Lo que se prueba aquí no es que el glob funcione: es que una regla protege
 * lo que el usuario cree que protege, y NADA más. Un patrón que casa de menos
 * deja pasar al agente; uno que casa de más bloquea trabajo legítimo y acaba
 * con el usuario borrando la regla.
 */
import { describe, expect, it } from "vitest";
import {
  coincide,
  reglaQueBloquea,
  motivoBloqueo,
  renderReglasParaPrompt,
  validarPatron,
  afectados,
  crearRegla,
  MAX_REGLAS,
  type ReglaNo,
} from "../../src/lib/prism/reglas-no";

const R = (patron: string, motivo = "porque sí"): ReglaNo =>
  crearRegla(patron, motivo, 1_000);

describe("coincide — un nombre suelto", () => {
  it("protege ese archivo esté en la carpeta que esté", () => {
    // «no toques Header.tsx» no está pensando en la ruta completa
    expect(coincide("Header.tsx", "src/components/Header.tsx")).toBe(true);
    expect(coincide("Header.tsx", "Header.tsx")).toBe(true);
    expect(coincide("Header.tsx", "a/b/c/d/Header.tsx")).toBe(true);
  });

  it("no protege un archivo que solo se le parece", () => {
    expect(coincide("Header.tsx", "src/HeaderViejo.tsx")).toBe(false);
    expect(coincide("Header.tsx", "src/MiHeader.tsx")).toBe(false);
    expect(coincide("Header.tsx", "src/Header.tsx.bak")).toBe(false);
  });

  it("no distingue mayúsculas: el mismo archivo en Windows y en macOS", () => {
    // una regla que falla según el sistema operativo no es una regla
    expect(coincide("header.tsx", "src/Header.tsx")).toBe(true);
    expect(coincide("HEADER.TSX", "src/header.tsx")).toBe(true);
  });
});

describe("coincide — rutas y comodines", () => {
  it("una ruta exacta protege solo esa", () => {
    expect(coincide("src/api/claves.ts", "src/api/claves.ts")).toBe(true);
    expect(coincide("src/api/claves.ts", "otro/src/api/claves.ts")).toBe(false);
    expect(coincide("src/api/claves.ts", "src/api/claves.test.ts")).toBe(false);
  });

  it("un asterisco no cruza carpetas", () => {
    expect(coincide("src/api/*", "src/api/claves.ts")).toBe(true);
    expect(coincide("src/api/*", "src/api/interno/claves.ts")).toBe(false);
    expect(coincide("*.css", "estilos.css")).toBe(true);
    expect(coincide("*.css", "css/estilos.css")).toBe(false);
  });

  it("el doble asterisco sí cruza carpetas", () => {
    expect(coincide("**/*.css", "estilos.css")).toBe(true);
    expect(coincide("**/*.css", "src/a/b/estilos.css")).toBe(true);
    expect(coincide("**/*.css", "src/estilos.scss")).toBe(false);
    expect(coincide("src/**", "src/a/b/c.ts")).toBe(true);
    expect(coincide("src/**", "otro/a.ts")).toBe(false);
  });

  it("da igual escribir «./algo» que «algo»", () => {
    expect(coincide("./src/a.ts", "src/a.ts")).toBe(true);
    expect(coincide("src/a.ts", "./src/a.ts")).toBe(true);
  });

  it("un patrón vacío no protege nada (no se convierte en «todo»)", () => {
    // El fallo peligroso sería el contrario: bloquear el proyecto entero.
    expect(coincide("", "a.ts")).toBe(false);
    expect(coincide("   ", "a.ts")).toBe(false);
    expect(coincide("a.ts", "")).toBe(false);
  });

  it("los puntos son literales, no comodín de regex", () => {
    expect(coincide("a.ts", "axts")).toBe(false);
  });
});

describe("reglaQueBloquea", () => {
  const reglas = [R("Header.tsx", "el diseño está aprobado"), R("src/api/*", "toca producción")];

  it("devuelve la regla, no un sí/no: hay que poder decir cuál fue", () => {
    expect(reglaQueBloquea(reglas, "src/components/Header.tsx")?.motivo).toBe(
      "el diseño está aprobado"
    );
    expect(reglaQueBloquea(reglas, "src/api/pagos.ts")?.motivo).toBe("toca producción");
  });

  it("sin coincidencia devuelve null", () => {
    expect(reglaQueBloquea(reglas, "src/components/Footer.tsx")).toBeNull();
    expect(reglaQueBloquea([], "lo-que-sea.ts")).toBeNull();
  });
});

describe("motivoBloqueo", () => {
  it("dice la regla con las palabras del usuario y que no busque la vuelta", () => {
    const m = motivoBloqueo(R("Header.tsx", "el diseño está aprobado"), "src/Header.tsx", "write_file");
    expect(m).toContain("src/Header.tsx");
    expect(m).toContain("el diseño está aprobado");
    // sin esto, prueba con edit_file lo que no pudo con write_file
    expect(m).toMatch(/no lo intentes por otra vía/i);
    // y tiene que contarlo en su respuesta, no callárselo
    expect(m).toMatch(/dile al usuario/i);
  });
});

describe("renderReglasParaPrompt", () => {
  it("sin reglas no ocupa nada en el prompt", () => {
    expect(renderReglasParaPrompt([])).toBeNull();
    expect(renderReglasParaPrompt(null)).toBeNull();
    expect(renderReglasParaPrompt(undefined)).toBeNull();
  });

  it("lista patrón y motivo, y dice que se hacen cumplir", () => {
    const t = renderReglasParaPrompt([R("Header.tsx", "aprobado por el cliente")])!;
    expect(t).toContain("Header.tsx");
    expect(t).toContain("aprobado por el cliente");
    expect(t).toMatch(/se hacen cumplir/i);
    expect(t).toMatch(/RECHAZA/);
  });

  it("no mete más del tope aunque haya más guardadas", () => {
    const muchas = Array.from({ length: MAX_REGLAS + 5 }, (_, i) => R(`f${i}.ts`));
    const t = renderReglasParaPrompt(muchas)!;
    expect(t.split("\n").filter((l) => l.startsWith("- ")).length).toBe(MAX_REGLAS);
  });
});

describe("validarPatron", () => {
  it("acepta lo que soporta", () => {
    for (const p of ["Header.tsx", "src/api/claves.ts", "src/api/*", "**/*.css", "src/**"]) {
      expect(validarPatron(p), p).toBeNull();
    }
  });

  it("rechaza lo vacío y lo imposible, con motivo legible", () => {
    expect(validarPatron("")).toContain("Escribe");
    expect(validarPatron("  ")).toContain("Escribe");
    expect(validarPatron("a<b>c")).toContain("no valen");
    expect(validarPatron("x".repeat(300))).toContain("demasiado largo");
  });
});

describe("afectados", () => {
  const proyecto = [
    "index.html",
    "src/components/Header.tsx",
    "src/components/Footer.tsx",
    "src/api/claves.ts",
    "estilos.css",
  ];

  it("enseña qué protegería la regla AHORA, antes de guardarla", () => {
    // una regla que no casa con nada suele ser una errata
    expect(afectados("Header.tsx", proyecto)).toEqual(["src/components/Header.tsx"]);
    expect(afectados("src/components/*", proyecto)).toHaveLength(2);
    expect(afectados("noexiste.ts", proyecto)).toEqual([]);
  });

  it("un patrón inválido no afecta a nada en vez de reventar", () => {
    expect(afectados("", proyecto)).toEqual([]);
    expect(afectados("a<b", proyecto)).toEqual([]);
  });
});

describe("crearRegla", () => {
  it("recorta y pone un motivo por defecto si no se escribió", () => {
    const r = crearRegla("  Header.tsx  ", "   ", 5);
    expect(r.patron).toBe("Header.tsx");
    expect(r.motivo).toBe("sin motivo escrito");
    expect(r.creadaEl).toBe(5);
  });

  it("los ids no chocan", () => {
    const ids = new Set(Array.from({ length: 200 }, () => crearRegla("a.ts", "m", 1).id));
    expect(ids.size).toBeGreaterThan(190);
  });
});
