"use client";
/** Prism AI — Biblioteca de snippets reutilizables (U2, PLAN-V7).
 *
 * Un snippet es un trozo de texto —prompt parcial, plantilla de función,
 * configuración, cabecera de documento— que quieres reutilizar sin
 * reescribir. Vive en tu navegador (localStorage), se invoca con `/snip`
 * y se inserta en el compositor SIN enviar nada.
 *
 * Lógica pura (sin React ni DOM) para poder probarla en Node, como el
 * resto de piezas del compositor (`slash.ts`, `compress.ts`). La UI la
 * pinta `components/prism/snippets-dialog.tsx`.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/** Categorías integradas. El usuario puede escribir las suyas, pero estas
 *  salen siempre para que el menú no esté vacío la primera vez. */
export const SNIPPET_CATEGORIES = [
  "Prompts",
  "Código",
  "Cabeceras",
  "Notas",
  "Otros",
] as const;

/** Un snippet guardado. */
export interface Snippet {
  /** id estable, uuid corto */
  id: string;
  /** título corto, lo que ve el usuario en la lista */
  title: string;
  /** texto a insertar en el compositor */
  content: string;
  /** categoría libre (sugerencia: una de SNIPPET_CATEGORIES) */
  category: string;
  /** atajo opcional: si el título empieza por esta etiqueta, `/snip <atajo>`
   *  lo encuentra más rápido. Lo rellena el usuario. */
  shortcut?: string;
  /** fecha de creación (epoch ms) */
  created: number;
  /** fecha de última edición (epoch ms) */
  updated: number;
}

/** Algunos snippets de fábrica para que el menú no nazca vacío. Lo que
 *  enseña el producto sin que el usuario tenga que hacer nada primero. */
export const BUILTIN_SNIPPETS: Snippet[] = [
  {
    id: "snip-doc-frontmatter",
    title: "Frontmatter de documento",
    content:
      "Crea un documento con esta cabecera delante y completa el cuerpo:\n\n---\ntítulo: \nautor: \nfecha: \n---\n\n",
    category: "Cabeceras",
    shortcut: "doc",
    created: 0,
    updated: 0,
  },
  {
    id: "snip-func-js",
    title: "Función JS con JSDoc",
    content:
      "/**\n * \n * @param {} \n * @returns {}\n */\nfunction nombre() {\n  //\n}\n",
    category: "Código",
    shortcut: "fn",
    created: 0,
    updated: 0,
  },
  {
    id: "snip-prompt-test",
    title: "Pedir casos límite",
    content:
      "Antes de darme la versión final, dime qué casos límite vas a probar y qué resultados esperas en cada uno.",
    category: "Prompts",
    shortcut: "test",
    created: 0,
    updated: 0,
  },
  {
    id: "snip-section-precios",
    title: "Sección de precios",
    content:
      "Añade una sección de precios con 3 planes (básico, pro, equipo), tabla responsive, CTA en cada uno y nota de impuestos.",
    category: "Prompts",
    shortcut: "precios",
    created: 0,
    updated: 0,
  },
];

interface SnippetsState {
  items: Snippet[];
  add: (s: Omit<Snippet, "id" | "created" | "updated">) => string;
  update: (id: string, patch: Partial<Omit<Snippet, "id" | "created">>) => void;
  remove: (id: string) => void;
  reset: () => void;
}

function newId(): string {
  return "snip-" + Math.random().toString(36).slice(2, 10);
}

export const useSnippets = create<SnippetsState>()(
  persist(
    (set) => ({
      items: [...BUILTIN_SNIPPETS],
      add: (s) => {
        const id = newId();
        const now = Date.now();
        const item: Snippet = { ...s, id, created: now, updated: now };
        set((st) => ({ items: [item, ...st.items] }));
        return id;
      },
      update: (id, patch) =>
        set((st) => ({
          items: st.items.map((it) =>
            it.id === id ? { ...it, ...patch, updated: Date.now() } : it
          ),
        })),
      remove: (id) =>
        set((st) => ({ items: st.items.filter((it) => it.id !== id) })),
      reset: () => set({ items: [...BUILTIN_SNIPPETS] }),
    }),
    {
      name: "prism-snippets-v1",
      storage: createJSONStorage(() => localStorage),
      version: 1,
    }
  )
);

/** Filtra la biblioteca por texto y categoría, como el resto de buscadores
 *  de la app. Sin texto: todo; con texto: título, atajo o contenido. */
export function filterSnippets(
  items: Snippet[],
  query: string,
  category?: string | null
): Snippet[] {
  const q = query.trim().toLowerCase();
  return items.filter((it) => {
    if (category && it.category !== category) return false;
    if (!q) return true;
    return (
      it.title.toLowerCase().includes(q) ||
      (it.shortcut ?? "").toLowerCase().includes(q) ||
      it.content.toLowerCase().includes(q)
    );
  });
}

/** Encuentra el snippet por atajo exacto (lo que tecleas tras `/snip `).
 *  Devuelve null si no hay coincidencia o si el atajo es ambiguo (≥2). */
export function findByShortcut(items: Snippet[], shortcut: string): Snippet | null {
  const q = shortcut.trim().toLowerCase();
  if (!q) return null;
  const matches = items.filter((it) => (it.shortcut ?? "").toLowerCase() === q);
  if (matches.length === 1) return matches[0];
  return null;
}
