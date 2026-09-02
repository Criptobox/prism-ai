import { expect, test } from "./fixtures";

/** Prism AI — Qué te van a pedir para darte la clave, ANTES de ir a por ella.
 *
 * El radar te mandaba a por una clave sin avisar de que ahí piden teléfono o
 * tarjeta. Mucha gente se entera a mitad del registro y se da la vuelta. Ahora
 * cada fuente lo dice, y hay un filtro para las que no lo piden.
 *
 * Y los cinco runtimes locales nuevos (llama.cpp, Jan, vLLM, MLX, llamafile)
 * se pueden conectar sin clave, que es la otra mitad de esta entrega.
 */

async function abrirApp(page: import("@playwright/test").Page) {
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
      /* marco sin acceso a localStorage */
    }
  });
  await page.goto("/");
  await expect(page.locator("textarea").first()).toBeVisible({ timeout: 30_000 });
}

test("el radar dice qué te piden, y el filtro deja fuera lo desconocido", async ({ page }) => {
  await abrirApp(page);
  await page.getByRole("button", { name: "Radar" }).click();
  const dialogo = page.getByRole("dialog");

  // la sección de fuentes; el diálogo tiene otras listas que también nombran
  // a estos proveedores (ofertas, modelos en vivo)
  const fuentes = dialogo.locator("section").filter({ hasText: "Siempre gratis" }).last();

  // Cerebras pide TARJETA: eso ahora se ve antes de ir a por la clave
  const cerebras = fuentes.locator("li").filter({ hasText: "Cerebras" }).first();
  await expect(cerebras).toBeVisible({ timeout: 20_000 });
  await expect(cerebras.getByText("Tarjeta", { exact: true })).toBeVisible();

  // NVIDIA pide TELÉFONO. Se busca «NVIDIA NIM» y no «NVIDIA»: hasText no
  // distingue mayúsculas, y la tarjeta de OpenRouter lista un modelo
  // «nvidia/nemotron-…» que casaba antes.
  const nvidia = fuentes.locator("li").filter({ hasText: "NVIDIA NIM" }).first();
  await expect(nvidia.getByText("Teléfono", { exact: true })).toBeVisible();

  // y lo que no se ha comprobado se dice, no se disimula
  await expect(fuentes.getByText("Registro: sin dato").first()).toBeVisible();

  // con el filtro puesto, ni la tarjeta ni el teléfono ni el «sin dato»
  await fuentes.getByRole("button", { name: "Sin teléfono ni tarjeta" }).click();
  // exact: el propio botón del filtro se llama «Sin teléfono ni tarjeta», y
  // getByText casa por subcadena sin distinguir mayúsculas
  await expect(fuentes.getByText("Tarjeta", { exact: true })).toHaveCount(0);
  await expect(fuentes.getByText("Teléfono", { exact: true })).toHaveCount(0);
  await expect(fuentes.getByText("Registro: sin dato")).toHaveCount(0);
  // pero sí queda algo: el filtro no vacía la lista
  await expect(fuentes.getByText("Email", { exact: true }).first()).toBeVisible();
});

test("los runtimes locales se conectan sin pedir clave", async ({ page }) => {
  await abrirApp(page);
  await page.getByRole("button", { name: "Ajustes" }).first().click();
  const dialogo = page.getByRole("dialog");

  await dialogo.getByPlaceholder("Buscar proveedor o modelo…").fill("llama.cpp");
  const tarjeta = dialogo.getByRole("button", { name: /llama\.cpp/ }).first();
  await expect(tarjeta).toBeVisible({ timeout: 10_000 });
  await tarjeta.click();

  // no pide clave: el campo lo dice en vez de pedir una sk-…
  await expect(dialogo.getByPlaceholder("No necesita clave").first()).toBeVisible();
  // y explica cómo levantar el servidor, que es lo que de verdad hace falta
  await expect(dialogo.getByText(/llama-server -m modelo\.gguf/)).toBeVisible();
});
