/** Prism AI — Despliegue real: de prompt a sitio publicado sin salir de
 * Prism (Pilar 3 del plan de escalado).
 *
 * Tres piezas:
 *   1. `workflowPages()` — el YAML de GitHub Actions que publica el sitio
 *      en GitHub Pages en cada push a main. Sin servidores, sin coste.
 *   2. `mensajeCommit()` — commits con significado («Añade galería y
 *      arregla el menú móvil»), no «update». Generado de los cambios
 *      reales, en el idioma del proyecto.
 *   3. `entradaChangelog()` — CHANGELOG.md que se actualiza solo: una
 *      línea por commit con lo que cambió.
 *
 * Todo es texto puro: los commits los hace Repo Studio con su Git
 * Database API existente (repo-cloud.ts), aquí solo se decide QUÉ se
 * escribe y se habilita Pages por API.
 */

/** El workflow de GitHub Pages para un sitio estático (lo que genera el
 * Sandbox: HTML/CSS/JS sin build). Se commitea en
 * `.github/workflows/pages.yml` y se activa con una llamada a la API de
 * Pages (build_type: workflow). */
export function workflowPages(): string {
  return `# Desplegado por Prism AI — publica el sitio en GitHub Pages en cada push a main.
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Setup Pages
        uses: actions/configure-pages@v5
      - name: Upload site
        uses: actions/upload-pages-artifact@v3
        with:
          path: '.'
      - name: Deploy
        id: deployment
        uses: actions/deploy-pages@v4
`;
}

/** Ruta del workflow dentro del repo. */
export const RUTA_WORKFLOW = ".github/workflows/pages.yml";

/** Verbo de alta/modificación/borrado en singular, para el mensaje. */
function verbo(altas: number, ediciones: number, borrados: number): string {
  if (altas && !ediciones && !borrados) return "Añade";
  if (!altas && ediciones && !borrados) return "Actualiza";
  if (!altas && !ediciones && borrados) return "Elimina";
  return "Cambios en";
}

/** Genera un mensaje de commit con significado a partir de los cambios.
 *
 * Reglas: primera línea ≤ 72 caracteres, en el idioma del proyecto
 * (español, como toda la app), con lo QUÉ y el alcance; cuerpo con el
 * detalle cuando hay más de tres archivos. Nada de «update» ni «cambios».
 */
export function mensajeCommit(
  cambios: readonly { tipo: "alta" | "edicion" | "borrado"; path: string }[]
): string {
  if (!cambios.length) return "Sin cambios que confirmar";
  const altas = cambios.filter((c) => c.tipo === "alta");
  const ediciones = cambios.filter((c) => c.tipo === "edicion");
  const borrados = cambios.filter((c) => c.tipo === "borrado");

  const nombres = (lista: typeof cambios) =>
    lista.map((c) => c.path.split("/").pop()).filter(Boolean) as string[];

  const resumenLista = (nombres_: string[], max = 3): string =>
    nombres_.length <= max
      ? nombres_.join(", ")
      : `${nombres_.slice(0, max).join(", ")} y ${nombres_.length - max} más`;

  let primera = "";
  if (cambios.length === 1) {
    const c = cambios[0];
    primera =
      c.tipo === "alta"
        ? `Añade ${c.path}`
        : c.tipo === "borrado"
          ? `Elimina ${c.path}`
          : `Actualiza ${c.path}`;
    if (primera.length <= 72) {
      // un solo archivo y asunto corto: el asunto lo dice todo, sin cuerpo
      return primera;
    }
  } else {
    primera = `${verbo(altas.length, ediciones.length, borrados.length)} ${resumenLista([
      ...nombres(altas),
      ...nombres(ediciones),
      ...nombres(borrados),
    ])}`;
  }
  if (primera.length > 72) primera = `${primera.slice(0, 69)}...`;

  const cuerpo: string[] = [];
  if (altas.length) cuerpo.push(`- nuevos: ${resumenLista(nombres(altas), 5)}`);
  if (ediciones.length) cuerpo.push(`- modificados: ${resumenLista(nombres(ediciones), 5)}`);
  if (borrados.length) cuerpo.push(`- borrados: ${resumenLista(nombres(borrados), 5)}`);

  return cuerpo.length ? `${primera}\n\n${cuerpo.join("\n")}` : primera;
}

/** Entrada de CHANGELOG.md para un commit. `existe` = contenido actual
 * del CHANGELOG (si lo hay): se inserta la entrada nueva al principio,
 * bajo la cabecera, sin duplicar cabeceras. */
export function entradaChangelog(
  mensaje: string,
  fecha: string,
  existe?: string | null
): string {
  const entrada = `## ${fecha}\n\n${mensaje}\n`;
  if (!existe || !existe.trim()) {
    return `# CHANGELOG\n\n${entrada}`;
  }
  // inserta después de la cabecera # CHANGELOG si existe, si no delante
  const conCabecera = /^#\s+CHANGELOG.*\n/i.test(existe)
    ? existe.replace(/^(#\s+CHANGELOG.*\n)/i, `$1\n${entrada}`)
    : `# CHANGELOG\n\n${entrada}${existe.startsWith("#") ? "" : "\n"}`;
  return conCabecera;
}

/** URL pública de Pages a partir de owner/repo. */
export function urlPages(owner: string, repo: string): string {
  return `https://${owner}.github.io/${repo}/`;
}

/** ¿El repo ya tiene el workflow de Pages? (por los archivos que hay). */
export function tieneWorkflowPages(files: readonly string[]): boolean {
  return files.some((f) => f === RUTA_WORKFLOW || f.endsWith("workflows/pages.yml"));
}

/** Peticiones a la API de GitHub para habilitar Pages con build por
 * workflow. Devuelve el fetch listo para ejecutar (el que llama decide
 * con qué token). */
export function peticionHabilitarPages(owner: string, repo: string): Request {
  return new Request(`https://api.github.com/repos/${owner}/${repo}/pages`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ build_type: "workflow" }),
  });
}
