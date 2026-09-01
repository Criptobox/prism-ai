import { expect, test } from "./fixtures";

/** Prism AI — Tarea 2 del plan V6: orden de fallback configurable.
 *
 * Antes, para que Groq fuese antes que Gemini había que recompilar:
 * FAILOVER_ORDER era una constante. Ahora el orden vive en el store y se
 * toca desde Ajustes → Proveedores con flechas.
 *
 * Este E2E es el que decide si el guardado funciona de verdad: mueve un
 * proveedor, RECARGA la página y comprueba que sigue movido.
 */

async function seed(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("prism-preview-demo", "1");
      // condicional a propósito: addInitScript corre en CADA navegación, y
      // tras page.reload() tiene que sobrevivir lo que la app guardó (el
      // orden movido), no volver a sembrarse el estado vacío
      if (localStorage.getItem("prism-ai-v1")) return;
      localStorage.setItem(
        "prism-ai-v1",
        JSON.stringify({
          state: {
            sessions: [],
            activeSessionId: null,
            onboardingDone: true,
            favorites: [],
            radarSeenIds: [],
            skills: [],
            settings: { defaultModelKey: null, accessCode: "", agentModes: [], ahorro: false },
            providers: {},
            version: 1,
          },
          version: 0,
        })
      );
    } catch {
      /* frame sin acceso */
    }
  });
}

/** Abre Ajustes → Claves (la pestaña de proveedores) y despliega la sección
 *  de orden. Devuelve el <ol> de filas, acotado. */
async function abrirOrden(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Ajustes" }).click();
  await page.getByRole("tab", { name: /claves/i }).click();
  const botonSeccion = page.getByRole("button", { name: /Orden de preferencia del failover/ });
  await botonSeccion.scrollIntoViewIfNeeded();
  await botonSeccion.click();
  // el ol de la sección: el único que tiene a Google Gemini como filas de lista
  return page.locator("ol").filter({ hasText: "Google Gemini" });
}

test("mover un proveedor en Ajustes sobrevive a recargar la página", async ({ page }) => {
  await seed(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("textarea").first()).toBeVisible({ timeout: 30_000 });

  const filas = await abrirOrden(page);

  // por defecto Google Gemini va primero (capas 100% gratuitas sin recarga)
  await expect(filas.locator("li").first()).toContainText("Google Gemini");

  // bajamos a Gemini un puesto: Groq pasa a la cabeza
  await page.getByRole("button", { name: "Mover abajo: Google Gemini" }).click();
  await expect(filas.locator("li").first()).toContainText("Groq");
  await expect(filas.locator("li").nth(1)).toContainText("Google Gemini");

  // RECARGA: aquí es donde se ve si el guardado funciona
  await page.reload();
  await expect(page.locator("textarea").first()).toBeVisible({ timeout: 30_000 });
  const filas2 = await abrirOrden(page);
  await expect(filas2.locator("li").first(), "el orden movido sigue ahí tras recargar").toContainText("Groq");
  await expect(filas2.locator("li").nth(1)).toContainText("Google Gemini");

  // y en el store persistido es una lista de ProviderId, no un objeto de pesos
  const guardado = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem("prism-ai-v1");
      if (!raw) return null;
      return (JSON.parse(raw) as { state?: { fallbackOrder?: unknown } }).state?.fallbackOrder ?? null;
    } catch {
      return null;
    }
  });
  expect(guardado).toEqual(expect.arrayContaining(["groq", "gemini"]));
  expect(Array.isArray(guardado)).toBe(true);
  expect((guardado as unknown[])[0]).toBe("groq");

  // Restablecer: vuelve al orden por defecto del código
  await page.getByRole("button", { name: "Restablecer" }).click();
  await expect(filas2.locator("li").first()).toContainText("Google Gemini");
  const trasReset = await page.evaluate(() => {
    const raw = localStorage.getItem("prism-ai-v1")!;
    return (JSON.parse(raw) as { state: { fallbackOrder: string[] } }).state.fallbackOrder;
  });
  expect(trasReset).toEqual([]);
});
