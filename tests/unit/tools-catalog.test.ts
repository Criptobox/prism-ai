/** Tests del catálogo de herramientas (tools-catalog.ts).
 * El catálogo es estático: si se rompe, se rompe el agente. Estos tests
 * son la red de seguridad contra un rename descuidado. */
import { describe, it, expect } from "vitest";
import {
  TOOL_CATALOG,
  TOOL_BY_NAME,
  isKnownTool,
  type ToolDef,
} from "../../src/lib/prism/tools-catalog";

describe("TOOL_CATALOG", () => {
  it("cada herramienta tiene nombre, descripción y parámetros con tipo", () => {
    for (const t of TOOL_CATALOG) {
      expect(t.name, "nombre no vacío").toMatch(/^[a-z_]+$/);
      expect(t.description.length, "descripción > 20 car").toBeGreaterThan(20);
      expect(t.parameters, "parameters es objeto").toBeTypeOf("object");
      expect(t.parameters.type, "parameters.type es 'object'").toBe("object");
    }
  });

  it("los nombres son únicos", () => {
    const names = TOOL_CATALOG.map((t) => t.name);
    expect(new Set(names).size, "sin duplicados").toBe(names.length);
  });

  it("el catálogo es EXACTAMENTE este: las del PLAN-V4/V7, read_url, las de la v3.32 y las tres de la v3.40", () => {
    // La lista va cerrada a propósito: añadir una herramienta sin pasar por
    // aquí es añadirla sin decidir cómo se le explica al modelo.
    const names = TOOL_CATALOG.map((t) => t.name).sort();
    expect(names).toEqual([
      "ask_memory",
      "edit_file",
      "fetch_api",
      "get_quota",
      "git_snapshot",
      "list_files",
      "read_console",
      "read_file",
      "read_url",
      "run_js",
      "run_project",
      "run_regression",
      "search_web",
      "snapshot_diff",
      "write_file",
    ]);
  });

  it("ninguna descripción promete un id de snapshot adivinable", () => {
    // Los ids son `s` + la fecha en base 36 («smtknd746»), no «s1»/«s2». El
    // catálogo lo prometía y el modelo llamaba con «s1» y se llevaba un error.
    for (const t of TOOL_CATALOG) {
      const texto = JSON.stringify(t);
      expect(texto, `${t.name} promete «s1, s2…»`).not.toMatch(/s1,\s*s2/);
    }
  });

  it("las tres nuevas dicen para qué sirven y qué NO pueden hacer", () => {
    const porNombre = (n: string) => TOOL_CATALOG.find((x) => x.name === n)!;
    // run_regression: el modelo tiene que saber que la primera vez no compara
    expect(porNombre("run_regression").description).toMatch(/primera vez/i);
    // snapshot_diff: aquí no hay git, y decirlo evita que pida «main»
    expect(porNombre("snapshot_diff").description).toMatch(/no hay git/i);
    expect(porNombre("snapshot_diff").parameters.required).toEqual(["a"]);
    // ask_memory: si no hay nada, se dice — no se inventa
    expect(porNombre("ask_memory").description).toMatch(/no se inventa/i);
    expect(porNombre("ask_memory").parameters.required).toEqual(["q"]);
  });

  it("read_url explica qué selectores acepta y cuáles no", () => {
    const t = porNombreSelector();
    expect(t).toMatch(/selectores SIMPLES/i);
    expect(t, "sin esto el modelo manda «div p» y no entiende el error").toMatch(/combinadores/i);
  });

  function porNombreSelector(): string {
    const t = TOOL_CATALOG.find((x) => x.name === "read_url")!;
    const p = t.parameters.properties as Record<string, { description?: string }>;
    return p.selector?.description ?? "";
  }

  it("read_url deja claro que NO es un buscador", () => {
    const t = TOOL_CATALOG.find((x) => x.name === "read_url")!;
    // sin esto, el modelo le pasa términos de búsqueda y se lleva un error
    expect(t.description).toMatch(/no es un buscador/i);
    expect(t.parameters.required).toEqual(["url"]);
  });
});

describe("TOOL_BY_NAME / isKnownTool", () => {
  it("recupera por nombre", () => {
    expect(TOOL_BY_NAME["read_file"]?.name).toBe("read_file");
    expect(TOOL_BY_NAME["write_file"]?.parameters.required).toEqual(["path", "content"]);
  });

  it("isKnownTool rechaza nombres inventados", () => {
    expect(isKnownTool("read_file")).toBe(true);
    // search_web ya existe desde la v3.32: el ejemplo de nombre inventado
    // pasa a ser uno de verdad
    expect(isKnownTool("search_web")).toBe(true);
    expect(isKnownTool("delete_everything")).toBe(false);
    expect(isKnownTool("format_c_disk")).toBe(false);
  });
});

describe("Esquemas de cada herramienta", () => {
  it("read_file pide path", () => {
    const t = TOOL_BY_NAME["read_file"] as ToolDef;
    expect(t.parameters.properties?.path).toBeDefined();
    expect(t.parameters.required).toContain("path");
  });

  it("write_file pide path y content", () => {
    const t = TOOL_BY_NAME["write_file"] as ToolDef;
    expect(t.parameters.required).toEqual(["path", "content"]);
    expect(t.parameters.properties?.content?.type).toBe("string");
  });

  it("list_files tiene prefix opcional", () => {
    const t = TOOL_BY_NAME["list_files"] as ToolDef;
    expect(t.parameters.required ?? []).not.toContain("prefix");
    expect(t.parameters.properties?.prefix?.type).toBe("string");
  });

  it("run_project tiene qa booleano opcional", () => {
    const t = TOOL_BY_NAME["run_project"] as ToolDef;
    expect(t.parameters.properties?.qa?.type).toBe("boolean");
    expect(t.parameters.required ?? []).not.toContain("qa");
  });

  it("get_quota no tiene parámetros", () => {
    const t = TOOL_BY_NAME["get_quota"] as ToolDef;
    expect(Object.keys(t.parameters.properties ?? {}).length).toBe(0);
  });
});
