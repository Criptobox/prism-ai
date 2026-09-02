/** Prism AI — Catálogo de plantillas del Sandbox (U3, PLAN-V7).
 *
 * Los ZIPs de demo ya viven en `/public` (`demo-sandbox.zip`,
 * `demo-modulos.zip`) y el Sandbox ya sabe cargarlos. Lo que falta es
 * el CATÁLOGO: una lista con nombre, descripción, de dónde viene y
 * qué enseña, para que el usuario vea qué hay antes de descargar nada.
 *
 * Lógica pura (sin React) para poder probarla en Node, como el resto
 * de catálogos (`prompts-data.ts`, `skills-data.ts`). La UI la pinta
 * `components/prism/templates-dialog.tsx`.
 */

/** Una plantilla del catálogo. */
export interface TemplateItem {
  /** id estable */
  id: string;
  /** nombre corto, lo que ve el usuario */
  title: string;
  /** descripción de una línea */
  description: string;
  /** qué enseña esta plantilla (para que el usuario sepa por qué cargarla) */
  teaches: string;
  /** ruta pública del ZIP, relativa a `/public` */
  zipPath: string;
  /** tag de categoría para filtrar */
  category: "Demos" | "Plantillas" | "Tutoriales";
  /** color de acento para la tarjeta (hex) */
  accent: string;
  /** cuántos archivos trae el ZIP. NO es «aproximado»: se pinta tal cual en
   *  la tarjeta, así que tiene que ser el número real. Un test lo comprueba
   *  contra el ZIP de verdad (`tests/unit/templates.test.ts`) — escrito a
   *  mano ya se había desviado: decía 1 y 3 donde había 5 y 8. */
  fileCount: number;
  /** emoji o glifo para la portada rápida */
  glyph: string;
}

/** Catálogo de fábrica. Hoy son los ZIPs que ya viven en `/public`; si
 *  mañana se añaden más, basta con meterlos aquí y la UI los saca. */
export const TEMPLATES: TemplateItem[] = [
  {
    id: "tpl-demo-sandbox",
    title: "Web de una página",
    description: "HTML + CSS + JS en un solo archivo, listo para iterar.",
    teaches: "Cómo se ve una web completa en el Sandbox: estructura, estilos y un toque de JS.",
    zipPath: "/demo-sandbox.zip",
    category: "Demos",
    accent: "#8b5cf6",
    fileCount: 5,
    glyph: "🌐",
  },
  {
    id: "tpl-demo-modulos",
    title: "Web modular (varios archivos)",
    description: "index.html + styles.css + app.js, cada cosa en su sitio.",
    teaches: "Cómo trabaja el Sandbox con varios archivos: enlaces relativos, script y link.",
    zipPath: "/demo-modulos.zip",
    category: "Demos",
    accent: "#22d3ee",
    fileCount: 8,
    glyph: "🧩",
  },
];

/** Filtra el catálogo por texto y categoría. Sin texto: todo; con texto:
 *  título, descripción o `teaches`. */
export function filterTemplates(
  items: TemplateItem[],
  query: string,
  category?: string | null
): TemplateItem[] {
  const q = query.trim().toLowerCase();
  return items.filter((it) => {
    if (category && it.category !== category) return false;
    if (!q) return true;
    return (
      it.title.toLowerCase().includes(q) ||
      it.description.toLowerCase().includes(q) ||
      it.teaches.toLowerCase().includes(q)
    );
  });
}
