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

  it("incluye las 5 del PLAN-V4 más read_url", () => {
    const names = TOOL_CATALOG.map((t) => t.name).sort();
    expect(names).toEqual([
      "get_quota",
      "list_files",
      "read_file",
      "read_url",
      "run_project",
      "write_file",
    ]);
  });

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
    expect(isKnownTool("search_web")).toBe(false);
    expect(isKnownTool("delete_everything")).toBe(false);
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
