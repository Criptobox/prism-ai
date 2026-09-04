import { expect, test, type Page } from "./fixtures";
import { readFileSync } from "node:fs";

/** Prism AI — Cuando el HTML pide un archivo que no está, se dice y se arregla.
 *
 * El ZIP de este test es EL DEL USUARIO, tal cual lo subió. Dentro hay
 * `index.html`, `css.css` y `javascript.js`; el HTML pide `styles.css` y
 * `script.js`. Los nombres no coinciden, así que la página se abre sin
 * estilos y sin scripts — y en cualquier navegador pasaría lo mismo.
 *
 * El fallo de Prism no era resolver mal la ruta (eso se arregló en la
 * v3.41.1): era decirlo en un aviso que se va a los tres segundos y que ni
 * siquiera mencionaba que en el proyecto SÍ hay un .css, con otro nombre.
 */

const ZIP = readFileSync("tests/fixtures/web-hamburgueseria.zip");

async function abrirSandboxCon(page: Page, buffer: Buffer) {
  await page.addInitScript(() => {
    if (window.top !== window.self) return;
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
      /* marco sin acceso */
    }
  });
  await page.goto("/");
  await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Sandbox", exact: false }).first().click();
  await page
    .getByRole("dialog")
    .locator('input[type="file"]')
    .setInputFiles({ name: "web ambueguesa.zip", mimeType: "application/zip", buffer });
}

test("dice QUÉ falta, que hay un candidato y por qué la página se ve pelada", async ({ page }) => {
  await abrirSandboxCon(page, ZIP);

  const banda = page.getByRole("status").filter({ hasText: "el HTML pide" });
  await expect(banda).toBeVisible({ timeout: 30_000 });

  // los dos archivos, por su nombre
  await expect(banda).toContainText("styles.css");
  await expect(banda).toContainText("script.js");
  // y el candidato que SÍ está en el proyecto
  await expect(banda).toContainText("css.css");
  await expect(banda).toContainText("javascript.js");
  // sin culpar a Prism de algo que haría igual cualquier navegador
  await expect(banda).toContainText("En un navegador normal pasaría lo mismo");
});

test("el aviso NO se va solo: sigue ahí pasado el tiempo de un toast", async ({ page }) => {
  // Este es el fallo de verdad: la información existía y se perdía.
  await abrirSandboxCon(page, ZIP);
  const banda = page.getByRole("status").filter({ hasText: "el HTML pide" });
  await expect(banda).toBeVisible({ timeout: 30_000 });
  await expect(banda).toBeVisible({ timeout: 12_000 });
});

test("un clic apunta la referencia al archivo que sí existe, y la página carga", async ({
  page,
}) => {
  await abrirSandboxCon(page, ZIP);
  const banda = page.getByRole("status").filter({ hasText: "el HTML pide" });
  await expect(banda).toBeVisible({ timeout: 30_000 });

  await banda.getByRole("button", { name: /Apuntar a css\.css/ }).click();
  await expect(page.getByText(/ahora apunta a «css\.css»/)).toBeVisible({ timeout: 15_000 });

  await banda.getByRole("button", { name: /Apuntar a javascript\.js/ }).click();

  // Se vuelve a ejecutar y ya no falta nada: el CSS del proyecto está dentro.
  // «Recargar» reconstruye con los archivos de ahora — antes remontaba el
  // mismo HTML de antes y el arreglo no se veía nunca.
  await page.getByRole("button", { name: "Recargar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "el HTML pide" })).toHaveCount(0, {
    timeout: 20_000,
  });

  // y el estilo se aplica de verdad dentro del marco
  const marco = page.frameLocator('iframe[title="Vista previa del Sandbox"]');
  const cuerpo = marco.locator("body");
  await expect(cuerpo).toBeVisible({ timeout: 20_000 });
  const familia = await cuerpo.evaluate((el) => getComputedStyle(el).fontFamily);
  expect(familia, "el css.css del proyecto fija Poppins").toContain("Poppins");
});
