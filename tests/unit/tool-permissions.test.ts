/** Prism AI — Permisos por herramienta.
 *
 * Lo que se prueba aquí no es que la tabla exista: es que **se hace cumplir**.
 * Un permiso que se enseña y no se comprueba es peor que no tenerlo, porque
 * promete un control que no existe.
 */
import { describe, expect, it } from "vitest";
import {
  EFECTOS,
  EFECTO_LABEL,
  EFECTO_DESC,
  PERMISOS_TOOL,
  PERMISOS_POR_DEFECTO,
  normalizarPermisos,
  efectosDe,
  toolPermitida,
  motivoDenegado,
  filtrarCatalogo,
  toolsDelEfecto,
  type PermisosConcedidos,
} from "../../src/lib/prism/tool-permissions";
import { TOOL_CATALOG } from "../../src/lib/prism/tools-catalog";

const todo = (v: boolean): PermisosConcedidos => ({
  lee_proyecto: v,
  escribe_proyecto: v,
  ejecuta: v,
  red: v,
});

describe("la tabla cubre el catálogo, en los dos sentidos", () => {
  it("toda herramienta del catálogo tiene permisos declarados", () => {
    const sinDeclarar = TOOL_CATALOG.map((t) => t.name).filter((n) => !PERMISOS_TOOL[n]);
    expect(sinDeclarar, "una herramienta sin declarar no se puede apagar").toEqual([]);
  });

  it("no hay entradas de más: no se promete nada que no exista", () => {
    const nombres = new Set(TOOL_CATALOG.map((t) => t.name));
    const sobrantes = Object.keys(PERMISOS_TOOL).filter((n) => !nombres.has(n));
    expect(sobrantes).toEqual([]);
  });

  it("cada declaración tiene al menos un efecto y una nota", () => {
    for (const [nombre, p] of Object.entries(PERMISOS_TOOL)) {
      expect(p.efectos.length, nombre).toBeGreaterThan(0);
      expect(p.nota.length, nombre).toBeGreaterThan(10);
      for (const e of p.efectos) expect(EFECTOS, `${nombre}: ${e}`).toContain(e);
    }
  });

  it("los cuatro efectos tienen nombre y explicación", () => {
    for (const e of EFECTOS) {
      expect(EFECTO_LABEL[e].length).toBeGreaterThan(3);
      expect(EFECTO_DESC[e].length).toBeGreaterThan(30);
    }
  });
});

describe("toolPermitida", () => {
  it("con todo concedido, pasa todo el catálogo", () => {
    for (const t of TOOL_CATALOG) {
      expect(toolPermitida(t.name, todo(true)).permitida, t.name).toBe(true);
    }
  });

  it("apagar «red» deja fuera exactamente las tres que salen a internet", () => {
    const p = { ...todo(true), red: false };
    const fuera = TOOL_CATALOG.filter((t) => !toolPermitida(t.name, p).permitida).map((t) => t.name);
    expect(fuera.sort()).toEqual(["fetch_api", "read_url", "search_web"]);
  });

  it("apagar «escribir» deja fuera las que tocan archivos, y git_snapshot con ellas", () => {
    // git_snapshot restaura, y restaurar descarta archivos: manda el efecto
    // más fuerte de los que la herramienta puede llegar a tener.
    const p = { ...todo(true), escribe_proyecto: false };
    const fuera = TOOL_CATALOG.filter((t) => !toolPermitida(t.name, p).permitida).map((t) => t.name);
    expect(fuera.sort()).toEqual(["apply_patch", "edit_file", "git_snapshot", "write_file"]);
  });

  it("apagar «ejecutar» deja fuera las que corren código", () => {
    const p = { ...todo(true), ejecuta: false };
    const fuera = TOOL_CATALOG.filter((t) => !toolPermitida(t.name, p).permitida).map((t) => t.name);
    expect(fuera.sort()).toEqual(["run_js", "run_project", "run_regression"]);
  });

  it("una herramienta que necesita dos efectos cae si falta cualquiera", () => {
    expect(efectosDe("run_project")).toEqual(["lee_proyecto", "ejecuta"]);
    expect(toolPermitida("run_project", { ...todo(true), ejecuta: false }).falta).toEqual(["ejecuta"]);
    expect(toolPermitida("run_project", { ...todo(true), lee_proyecto: false }).falta).toEqual([
      "lee_proyecto",
    ]);
    expect(toolPermitida("run_project", todo(false)).falta).toEqual(["lee_proyecto", "ejecuta"]);
  });

  it("una herramienta SIN declarar no se ejecuta", () => {
    // Es lo contrario de lo cómodo y es lo correcto: si alguien añade una
    // herramienta y olvida declararla, no puede correr sin permiso.
    const v = toolPermitida("herramienta_inventada", todo(true));
    expect(v.permitida).toBe(false);
    expect(v.falta).toEqual([]);
  });
});

describe("motivoDenegado", () => {
  it("le dice al modelo qué falta y que no insista", () => {
    const m = motivoDenegado("read_url", ["red"]);
    expect(m).toContain("Salir a internet");
    expect(m).toContain("read_url");
    expect(m, "sin esto reintenta hasta agotar las vueltas").toMatch(/no lo vuelvas a intentar/i);
  });

  it("cuando la culpa es de la app, lo dice y no culpa al modelo", () => {
    const m = motivoDenegado("herramienta_inventada", []);
    expect(m).toContain("fallo de la aplicación");
  });
});

describe("filtrarCatalogo", () => {
  it("recorta a lo permitido", () => {
    const c = filtrarCatalogo(TOOL_CATALOG, { ...todo(true), red: false });
    expect(c.length).toBe(TOOL_CATALOG.length - 3);
    expect(c.some((t) => t.name === "read_url")).toBe(false);
  });

  it("con todo apagado no queda ninguna", () => {
    expect(filtrarCatalogo(TOOL_CATALOG, todo(false))).toEqual([]);
  });
});

describe("normalizarPermisos", () => {
  it("por defecto concede todo", () => {
    expect(normalizarPermisos(undefined)).toEqual(PERMISOS_POR_DEFECTO);
    expect(normalizarPermisos(null)).toEqual(PERMISOS_POR_DEFECTO);
    expect(normalizarPermisos({})).toEqual(PERMISOS_POR_DEFECTO);
  });

  it("respeta lo que el usuario apagó", () => {
    expect(normalizarPermisos({ red: false }).red).toBe(false);
    expect(normalizarPermisos({ red: false }).ejecuta).toBe(true);
  });

  it("un efecto que falta se concede, no se deniega", () => {
    // Al revés, una actualización dejaría al agente mudo sin que el usuario
    // haya tocado nada.
    const guardadoViejo = { lee_proyecto: true } as Partial<PermisosConcedidos>;
    expect(normalizarPermisos(guardadoViejo)).toEqual(PERMISOS_POR_DEFECTO);
  });

  it("ignora la basura sin lanzar", () => {
    const raro = { red: "no", ejecuta: 1 } as unknown as Partial<PermisosConcedidos>;
    expect(normalizarPermisos(raro)).toEqual(PERMISOS_POR_DEFECTO);
  });
});

describe("toolsDelEfecto", () => {
  it("sale de la tabla, no de una lista escrita a mano", () => {
    expect(toolsDelEfecto("red")).toEqual(["fetch_api", "read_url", "search_web"]);
    // toda herramienta aparece bajo al menos un efecto
    const cubiertas = new Set(EFECTOS.flatMap((e) => toolsDelEfecto(e)));
    expect(cubiertas.size).toBe(TOOL_CATALOG.length);
  });
});
