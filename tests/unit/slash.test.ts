import { describe, expect, it } from "vitest";
import {
  HTML_TEMPLATE,
  SLASH_COMMANDS,
  filterSlash,
  matchSlashExact,
  moveSlashIndex,
  normalizeSlash,
  slashOpen,
  slashQuery,
} from "../../src/lib/prism/slash";

describe("slashQuery / slashOpen", () => {
  it("abre el menú con la barra sola y devuelve consulta vacía", () => {
    expect(slashQuery("/")).toBe("");
    expect(slashOpen("/")).toBe(true);
  });

  it("devuelve lo tecleado tras la barra", () => {
    expect(slashQuery("/ima")).toBe("ima");
    expect(slashOpen("/ima")).toBe(true);
  });

  it("no abre el menú si el mensaje no empieza por barra", () => {
    expect(slashQuery("hola /imagen")).toBeNull();
    expect(slashOpen("dime algo")).toBe(false);
    expect(slashOpen("")).toBe(false);
  });

  it("se cierra en cuanto hay un espacio: ya estás escribiendo un mensaje", () => {
    expect(slashQuery("/imagen un gato")).toBeNull();
    expect(slashOpen("/imagen ")).toBe(false);
    expect(slashOpen("/html\nsegunda línea")).toBe(false);
  });
});

describe("filterSlash", () => {
  it("sin consulta devuelve todos los comandos", () => {
    expect(filterSlash("")).toHaveLength(SLASH_COMMANDS.length);
  });

  it("filtra en vivo por prefijo del comando", () => {
    const r = filterSlash("im");
    expect(r[0].id).toBe("imagen");
  });

  it("prioriza el prefijo exacto del nombre sobre coincidencias parciales", () => {
    const r = filterSlash("a");
    expect(r.map((c) => c.id).slice(0, 2)).toContain("agente");
    expect(r.map((c) => c.id).slice(0, 2)).toContain("arena");
  });

  it("encuentra por alias e ignora tildes y mayúsculas", () => {
    expect(filterSlash("PÁGina").map((c) => c.id)).toContain("html");
    expect(filterSlash("comparar")[0].id).toBe("arena");
    expect(filterSlash("resumir")[0].id).toBe("resumen");
  });

  it("devuelve lista vacía si nada encaja", () => {
    expect(filterSlash("zzzzz")).toEqual([]);
  });

  it("tiene los diez comandos pedidos (6 originales + 4 de utilidad U2/U3/U4/U6)", () => {
    expect(SLASH_COMMANDS.map((c) => c.cmd).sort()).toEqual([
      "/agente",
      "/arena",
      "/html",
      "/imagen",
      "/nuevo",
      "/plantillas",
      "/presentar",
      "/resumen",
      "/snip",
      "/wrapped",
    ]);
  });
});

describe("matchSlashExact", () => {
  it("reconoce el comando escrito entero", () => {
    expect(matchSlashExact("/arena")?.id).toBe("arena");
    expect(matchSlashExact("/HTML")?.id).toBe("html");
  });

  it("no confunde un prefijo con el comando completo", () => {
    expect(matchSlashExact("/are")).toBeNull();
    expect(matchSlashExact("hola")).toBeNull();
  });

  it("/html es una plantilla e inserta el encargo", () => {
    const cmd = matchSlashExact("/html")!;
    expect(cmd.kind).toBe("plantilla");
    expect(cmd.template).toBe(HTML_TEMPLATE);
    expect(cmd.template).toContain("<!DOCTYPE html>");
  });
});

describe("moveSlashIndex", () => {
  it("baja y sube con las flechas", () => {
    expect(moveSlashIndex(0, 1, 4)).toBe(1);
    expect(moveSlashIndex(2, -1, 4)).toBe(1);
  });

  it("da la vuelta por los dos extremos", () => {
    expect(moveSlashIndex(3, 1, 4)).toBe(0);
    expect(moveSlashIndex(0, -1, 4)).toBe(3);
  });

  it("no rompe con la lista vacía", () => {
    expect(moveSlashIndex(0, 1, 0)).toBe(0);
  });
});

describe("normalizeSlash", () => {
  it("quita tildes, espacios y mayúsculas", () => {
    expect(normalizeSlash("  RESUMEN ")).toBe("resumen");
    expect(normalizeSlash("Página")).toBe("pagina");
  });
});
