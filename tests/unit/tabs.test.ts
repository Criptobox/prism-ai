/** Tests de la lógica de pestañas de conversación (D2, PLAN-V7). */
import { describe, expect, it } from "vitest";
import { MAX_TABS, abrirTab, cerrarTab } from "../../src/lib/prism/tabs";

describe("abrirTab", () => {
  it("añade al final si no está", () => {
    expect(abrirTab(["a"], "b")).toEqual(["a", "b"]);
  });
  it("no duplica ni reordena si ya está", () => {
    expect(abrirTab(["a", "b", "c"], "b")).toEqual(["a", "b", "c"]);
  });
  it("con el tope lleno, la más vieja se cae", () => {
    const llenas = Array.from({ length: MAX_TABS }, (_, i) => `t${i}`);
    expect(abrirTab(llenas, "nueva")).toEqual([...llenas.slice(1), "nueva"]);
  });
  it("no muta la lista original", () => {
    const original = ["a"];
    abrirTab(original, "b");
    expect(original).toEqual(["a"]);
  });
});

describe("cerrarTab", () => {
  it("cerrar la activa con vecina a la derecha → activa esa", () => {
    const r = cerrarTab(["a", "b", "c"], "b", "b");
    expect(r.tabs).toEqual(["a", "c"]);
    expect(r.siguiente).toBe("c");
    expect(r.cambioActivo).toBe(true);
  });
  it("cerrar la ÚLTIMA activa → activa la anterior", () => {
    const r = cerrarTab(["a", "b", "c"], "c", "c");
    expect(r.siguiente).toBe("b");
  });
  it("cerrar la única pestaña → lienzo limpio (null)", () => {
    const r = cerrarTab(["a"], "a", "a");
    expect(r.tabs).toEqual([]);
    expect(r.siguiente).toBeNull();
    expect(r.cambioActivo).toBe(true);
  });
  it("cerrar una inactiva no cambia la activa", () => {
    const r = cerrarTab(["a", "b", "c"], "a", "c");
    expect(r.tabs).toEqual(["b", "c"]);
    expect(r.siguiente).toBeNull();
    expect(r.cambioActivo).toBe(false);
  });
  it("cerrar una que no está abierta: no pasa nada", () => {
    const r = cerrarTab(["a"], "z", "a");
    expect(r.tabs).toEqual(["a"]);
    expect(r.cambioActivo).toBe(false);
  });
});
