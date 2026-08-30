import { expect, test, type Page } from "@playwright/test";

/** Prism AI — «he subido cambios y no los veo».
 *
 * El service worker se actualiza solo en segundo plano, pero la pestaña ya
 * abierta sigue con el JavaScript viejo hasta que recargas. Con la app
 * instalada en el móvil eso puede durar días. Ahora la página le pregunta al
 * servidor qué copia sirve y, si no es la suya, lo dice y ofrece recargar.
 */
async function seed(page: Page) {
  await page.addInitScript(() => {
    if (window.top !== window.self) return;
    try {
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
            settings: { defaultModelKey: "custom::mock-mini-free", accessCode: "" },
            providers: {
              custom: { apiKey: "k", baseUrl: "/api/mock-llm", enabled: true, models: ["mock-mini-free"], useProxy: false },
            },
            version: 1,
          },
          version: 0,
        })
      );
      localStorage.setItem("prism-preview-demo", "1");
    } catch {}
  });
}

test("avisa cuando el servidor ya sirve otra copia, y recarga", async ({ page }) => {
  await seed(page);
  // el servidor dice que sirve un commit distinto del que lleva esta página
  await page.route("**/api/version", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ version: "9.9.9", commit: "deadbee", latest: null, status: "ok" }),
    })
  );

  await page.goto("/");
  await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible({ timeout: 30_000 });

  // Es un banner, no un aviso flotante: tiene que seguir ahí pasado el tiempo
  // en que un toast ya se habría ido solo. Eso es justo lo que se le pide.
  const banner = page.getByText("Hay una versión nueva de Prism");
  await expect(banner).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(6_000);
  await expect(banner, "un banner no se va solo").toBeVisible();

  // y el botón recarga de verdad: la marca que dejamos en la página no sobrevive
  await page.evaluate(() => {
    (window as unknown as { __antes?: boolean }).__antes = true;
  });
  await page.getByRole("button", { name: "Actualizar" }).click();
  await page.waitForLoadState("load");
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __antes?: boolean }).__antes ?? null))
    .toBeNull();
});

test("si el servidor sirve la misma copia, no molesta", async ({ page }) => {
  await seed(page);
  let visto = false;
  await page.route("**/api/version", async (route) => {
    visto = true;
    // se le devuelve exactamente lo que el servidor real diría
    const res = await route.fetch();
    await route.fulfill({ response: res });
  });

  await page.goto("/");
  await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(4_000);
  expect(visto, "la página tiene que haber preguntado").toBe(true);
  await expect(page.getByText("Hay una versión nueva de Prism")).toHaveCount(0);
});
