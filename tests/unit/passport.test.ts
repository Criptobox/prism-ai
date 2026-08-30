import { describe, expect, it } from "vitest";
import {
  buildPassport,
  passportSumario,
  renderPassportForPrompt,
} from "../../src/lib/prism/passport";
import type { ProjectMap } from "../../src/lib/prism/types";

function mapa(overrides: Partial<ProjectMap> = {}): ProjectMap {
  return {
    name: "Panel CRM",
    description: "Panel de clientes con gráficas",
    files: [
      {
        name: "index.html",
        kind: "html",
        summary: "portada",
        links: ["styles.css", "app.js", "clientes.html"],
        tech: ["Tailwind (CDN)", "Chart.js"],
        features: ["Clientes"],
      },
      {
        name: "clientes.html",
        kind: "html",
        summary: "listado",
        links: ["styles.css"],
        tech: ["Tailwind (CDN)"],
      },
      { name: "styles.css", kind: "css", summary: "estilos" },
      { name: "app.js", kind: "js", summary: "lógica", tech: ["localStorage"] },
    ],
    features: ["Clientes", "Gráficas"],
    notes: ["tema: azul"],
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("passport — buildPassport", () => {
  it("devuelve null si no hay mapa o está vacío", () => {
    expect(buildPassport(null)).toBeNull();
    expect(buildPassport({ ...mapa(), files: [] })).toBeNull();
  });

  it("cuenta la pila por archivos y ordena por uso", () => {
    const p = buildPassport(mapa())!;
    const tailwind = p.tech.find((t) => t.name === "Tailwind (CDN)")!;
    expect(tailwind.count).toBe(2); // index + clientes
    expect(p.tech[0].name).toBe("Tailwind (CDN)");
  });

  it("detecta la entrada index.html y el hub con más backlinks", () => {
    const p = buildPassport(mapa())!;
    expect(p.entries).toEqual(["index.html"]);
    expect(p.hub).toBe("styles.css"); // lo referencian index y clientes
  });

  it("clasifica los archivos por tipo", () => {
    const p = buildPassport(mapa())!;
    expect(p.totalFiles).toBe(4);
    expect(p.kinds.html).toBe(2);
    expect(p.kinds.css).toBe(1);
    expect(p.kinds.js).toBe(1);
  });

  it("marca huérfanas: páginas sin enlaces entrantes ni salientes", () => {
    const p = buildPassport(mapa())!;
    // clientes.html enlaza a styles.css pero nadie enlaza a clientes.html…
    // no es huérfana (SÍ tiene salida). index tampoco (tiene ambas).
    expect(p.orphans).toEqual([]);
    const conHuérfana = buildPassport(
      mapa({
        files: [
          mapa().files[0],
          { name: "olvidada.html", kind: "html", summary: "nadie la enlaza" },
        ],
      })
    )!;
    expect(conHuérfana.orphans).toContain("olvidada.html");
  });

  it("sin portada index, la primera página es la entrada", () => {
    const p = buildPassport(
      mapa({
        files: [
          { name: "uno.html", kind: "html", summary: "" },
          { name: "dos.html", kind: "html", summary: "" },
        ],
      })
    )!;
    expect(p.entries).toEqual(["uno.html"]);
  });
});

describe("passport — passportSumario", () => {
  it("resume archivos, tipo dominante y pila", () => {
    const s = passportSumario(buildPassport(mapa())!);
    expect(s).toContain("4 archivos");
    expect(s).toContain("2 html");
    expect(s).toContain("Tailwind (CDN)");
  });
});

describe("passport — renderPassportForPrompt", () => {
  it("genera el bloque con pila, entrada, núcleo y notas", () => {
    const texto = renderPassportForPrompt(buildPassport(mapa()))!;
    expect(texto).toContain("FICHA DEL PROYECTO");
    expect(texto).toContain("Tailwind (CDN)");
    expect(texto).toContain("Entrada: index.html");
    expect(texto).toContain("Núcleo: styles.css");
    expect(texto).toContain("1 nota(s)");
  });

  it("avisa de huérfanas para que el agente las revise", () => {
    const p = buildPassport(
      mapa({
        files: [
          mapa().files[0],
          { name: "olvidada.html", kind: "html", summary: "" },
        ],
      })
    )!;
    const texto = renderPassportForPrompt(p)!;
    expect(texto).toContain("olvidada.html");
  });

  it("null sin ficha: no gasta tokens", () => {
    expect(renderPassportForPrompt(null)).toBeNull();
  });

  it("nunca se pasa de 700 caracteres", () => {
    const larga = mapa({
      description: "d".repeat(300),
      features: Array.from({ length: 8 }, (_, i) => `funcionalidad larga número ${i} ` + "x".repeat(60)),
      files: Array.from({ length: 12 }, (_, i) => ({
        name: `archivo-${i}.html`,
        kind: "html",
        summary: "s",
        tech: ["Tailwind (CDN)", "Chart.js", "Canvas", "PWA"],
      })),
    });
    const texto = renderPassportForPrompt(buildPassport(larga))!;
    expect(texto.length).toBeLessThanOrEqual(700);
  });
});
