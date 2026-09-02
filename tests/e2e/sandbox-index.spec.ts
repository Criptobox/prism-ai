import { expect, test } from "./fixtures";
import { writeZip } from "../../src/lib/prism/zip";

/** Prism AI — Al cargar un ZIP, el Sandbox abre el `index.html`.
 *
 * El «Download ZIP» de GitHub —y cualquier proyecto exportado— mete todo
 * dentro de una carpeta. Con esa carpeta por medio, la regla que prefería el
 * `index.html` dejaba de aplicarse (solo miraba la RAÍZ del ZIP) y quedaba el
 * desempate alfabético: `about.html` se abría antes que `index.html`.
 *
 * El ZIP se construye aquí, con el mismo escritor que usa la app, para que el
 * caso sea exactamente ese: carpeta envolviendo, y un HTML que va antes por
 * orden alfabético.
 */

const texto = (s: string) => new TextEncoder().encode(s);

function zipDePrueba(): Buffer {
  const pagina = (titulo: string) =>
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${titulo}</title></head><body><h1 id="quien">${titulo}</h1></body></html>`;
  return Buffer.from(
    writeZip([
      // «about» va ANTES que «index» por orden alfabético: ahí estaba el fallo
      { path: "mi-web/about.html", data: texto(pagina("PAGINA SECUNDARIA")) },
      { path: "mi-web/index.html", data: texto(pagina("SOY EL INDEX")) },
      { path: "mi-web/css/estilo.css", data: texto("body{margin:0}") },
    ])
  );
}

test("un ZIP con carpeta abre su index.html, no el HTML que va antes alfabéticamente", async ({
  page,
}) => {
  // La semilla lleva `version: 0` fuera y `version: 1` dentro, como el resto
  // de specs: con otro número zustand descarta el estado entero («couldn't be
  // migrated») y vuelve la guía inicial, cuyo overlay se come los clics.
  await page.addInitScript(() => {
    if (window.top !== window.self) return; // no dentro del iframe del Sandbox
    try {
      localStorage.setItem(
        "prism-ai-v1",
        JSON.stringify({
          state: {
            sessions: [],
            activeSessionId: null,
            onboardingDone: true,
            favorites: [],
            radarSeenIds: [],
            version: 1,
          },
          version: 0,
        })
      );
    } catch {
      /* marco sin acceso a localStorage */
    }
  });
  await page.goto("/");
  await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Sandbox", exact: false }).first().click();

  await page
    .getByRole("dialog")
    .locator('input[type="file"]')
    .setInputFiles({ name: "mi-web.zip", mimeType: "application/zip", buffer: zipDePrueba() });

  // el Sandbox arranca solo el proyecto: dentro tiene que estar el index
  const marco = page.frameLocator('iframe[title="Vista previa del Sandbox"]');
  await expect(marco.locator("#quien")).toHaveText("SOY EL INDEX", { timeout: 20_000 });
});
