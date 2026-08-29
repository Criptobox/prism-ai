import { describe, expect, it } from "vitest";
import {
  currentSlash,
  matchSlashCommands,
  SLASH_COMMANDS,
  stripSlash,
} from "../../src/lib/prism/slash";

describe("currentSlash", () => {
  it("detecta «/» al principio", () => {
    expect(currentSlash("/")).toEqual({ raw: "/", query: "" });
  });
  it("detecta un comando a medio escribir", () => {
    expect(currentSlash("/age")).toEqual({ raw: "/age", query: "age" });
  });
  it("detecta al final tras un espacio", () => {
    expect(currentSlash("hola /agen")).toEqual({ raw: "/agen", query: "agen" });
  });
  it("no detecta una barra en medio de una palabra", () => {
    expect(currentSlash("a/b")).toBeNull();
    expect(currentSlash("sin comando")).toBeNull();
  });
});

describe("matchSlashCommands", () => {
  it("sin query devuelve todos", () => {
    expect(matchSlashCommands("")).toHaveLength(SLASH_COMMANDS.length);
  });
  it("filtra por prefijo", () => {
    const out = matchSlashCommands("age");
    expect(out.map((c) => c.action)).toEqual(["agente"]);
  });
  it("coincide también con la etiqueta", () => {
    const out = matchSlashCommands("imagen");
    expect(out[0].action).toBe("imagen");
  });
});

describe("stripSlash", () => {
  it("quita el comando y deja el resto", () => {
    expect(stripSlash("/imagen", "/imagen")).toBe("");
    expect(stripSlash("hola /agente", "/agente")).toBe("hola");
  });
  it("no toca nada si no está", () => {
    expect(stripSlash("texto", "/resumen")).toBe("texto");
  });
});
