import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

/** Prism AI — la versión se VE, no solo existe.
 *
 * Hubo un commit que decía «en la barra lateral aparece vX.Y.Z» y añadía el
 * componente… sin llamarlo desde ningún sitio. Quedó como código muerto y
 * durante semanas no hubo forma de saber, desde la app desplegada, si estabas
 * viendo tus cambios o una copia guardada en caché. Lint no lo cazó y ningún
 * test miraba la pantalla.
 *
 * Este sí: abre la app y lee el número.
 */
const VERSION = (JSON.parse(readFileSync("package.json", "utf8")) as { version: string }).version;

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

test("la barra lateral enseña la versión y el commit de esta build", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);
  await page.goto("/");
  await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible({ timeout: 30_000 });

  const linea = page.locator("aside").getByText(new RegExp(`v${VERSION.replace(/\./g, "\\.")}`));
  await expect(linea).toBeVisible();

  // y el commit al lado: la versión sola no se mueve entre arreglos, así que
  // sin él la línea no contesta «¿es esta la copia nueva?»
  await expect(linea).toHaveText(/v\d+\.\d+\.\d+ · [0-9a-f]{7}/);
});

test("Ajustes dice exactamente la misma copia", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);
  await page.goto("/");
  await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Ajustes" }).click();
  await page.getByRole("tab", { name: /datos/i }).click();
  await expect(
    page.getByRole("dialog").getByText(new RegExp(`v${VERSION.replace(/\./g, "\\.")} · [0-9a-f]{7}`))
  ).toBeVisible();
});
