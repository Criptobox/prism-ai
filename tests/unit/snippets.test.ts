import { describe, it, expect, beforeEach } from "vitest";
import {
  BUILTIN_SNIPPETS,
  SNIPPET_CATEGORIES,
  filterSnippets,
  findByShortcut,
  useSnippets,
} from "../../src/lib/prism/snippets";

describe("filterSnippets", () => {
  it("sin query devuelve todo", () => {
    expect(filterSnippets(BUILTIN_SNIPPETS, "")).toHaveLength(BUILTIN_SNIPPETS.length);
  });

  it("filtra por título", () => {
    const r = filterSnippets(BUILTIN_SNIPPETS, "frontmatter");
    expect(r.length).toBe(1);
    expect(r[0].title).toMatch(/Frontmatter/i);
  });

  it("filtra por atajo", () => {
    const r = filterSnippets(BUILTIN_SNIPPETS, "fn");
    expect(r.some((s) => s.shortcut === "fn")).toBe(true);
  });

  it("filtra por contenido", () => {
    const r = filterSnippets(BUILTIN_SNIPPETS, "casos límite");
    expect(r.length).toBe(1);
  });

  it("respeta la categoría cuando se pasa", () => {
    const r = filterSnippets(BUILTIN_SNIPPETS, "", "Código");
    expect(r.every((s) => s.category === "Código")).toBe(true);
  });

  it("no encuentra nada si la categoría no existe", () => {
    expect(filterSnippets(BUILTIN_SNIPPETS, "", "Inventada")).toEqual([]);
  });
});

describe("findByShortcut", () => {
  it("encuentra el único que tiene ese atajo", () => {
    const s = findByShortcut(BUILTIN_SNIPPETS, "fn");
    expect(s?.shortcut).toBe("fn");
  });

  it("no distingue mayúsculas ni espacios", () => {
    expect(findByShortcut(BUILTIN_SNIPPETS, "  FN  ")?.shortcut).toBe("fn");
  });

  it("devuelve null si no hay coincidencia", () => {
    expect(findByShortcut(BUILTIN_SNIPPETS, "inventado")).toBeNull();
  });

  it("devuelve null si la consulta está vacía", () => {
    expect(findByShortcut(BUILTIN_SNIPPETS, "")).toBeNull();
  });

  it("devuelve null si el atajo es ambiguo (≥2)", () => {
    const dup = [
      ...BUILTIN_SNIPPETS,
      { ...BUILTIN_SNIPPETS[0], id: "dup", shortcut: "fn" },
    ];
    expect(findByShortcut(dup, "fn")).toBeNull();
  });
});

describe("useSnippets store", () => {
  beforeEach(() => {
    useSnippets.getState().reset();
  });

  it("empieza con los snippets de fábrica", () => {
    expect(useSnippets.getState().items.length).toBeGreaterThanOrEqual(
      BUILTIN_SNIPPETS.length
    );
  });

  it("add añade al principio y devuelve id", () => {
    const id = useSnippets.getState().add({
      title: "Test",
      content: "Hola",
      category: SNIPPET_CATEGORIES[0],
    });
    expect(id).toMatch(/^snip-/);
    const items = useSnippets.getState().items;
    expect(items[0].id).toBe(id);
    expect(items[0].title).toBe("Test");
  });

  it("update muta el campo y marca updated", () => {
    const id = useSnippets.getState().add({
      title: "Original",
      content: "x",
      category: "Otros",
    });
    const before = useSnippets.getState().items.find((s) => s.id === id)!.updated;
    // forzar un delta de tiempo
    return new Promise((r) => setTimeout(r, 5)).then(() => {
      useSnippets.getState().update(id, { title: "Cambiado" });
      const after = useSnippets.getState().items.find((s) => s.id === id)!;
      expect(after.title).toBe("Cambiado");
      expect(after.updated).toBeGreaterThanOrEqual(before);
    });
  });

  it("remove quita el snippet por id", () => {
    const id = useSnippets.getState().add({
      title: "Bórrame",
      content: "x",
      category: "Otros",
    });
    useSnippets.getState().remove(id);
    expect(useSnippets.getState().items.find((s) => s.id === id)).toBeUndefined();
  });
});
