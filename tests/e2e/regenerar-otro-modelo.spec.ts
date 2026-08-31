import { expect, test } from "./fixtures";

/** Prism AI — Rehacer la respuesta con OTRO modelo.
 *
 * `regenerate` rehacía siempre con el mismo. Pero cuando una respuesta sale
 * mal, lo que quieres nueve de cada diez veces no es la misma tirada otra
 * vez: es esto mismo probado con otro modelo. Antes eran cuatro pasos por
 * Ajustes.
 *
 * No se comprueba que el menú exista: se intercepta la petición y se mira A
 * QUÉ MODELO se le pidió la segunda vez.
 */

async function seed(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
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
            skills: [],
            settings: {
              defaultModelKey: "custom::mock-mini-free",
              accessCode: "",
              agentModes: [],
              ahorro: false,
              onlyFree: false,
            },
            providers: {
              custom: {
                apiKey: "test-key-123",
                baseUrl: "/api/mock-llm",
                enabled: true,
                models: ["mock-mini-free", "mock-big-free"],
                useProxy: false,
              },
            },
            version: 1,
          },
          version: 0,
        })
      );
      localStorage.setItem("prism-preview-demo", "1");
    } catch {
      /* frame sin acceso */
    }
  });
}

test("el menú de regenerar rehace con el modelo que eliges", async ({ page }) => {
  await seed(page);
  await page.setViewportSize({ width: 1440, height: 900 });

  const modelos: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "POST" || !r.url().includes("/api/mock-llm/")) return;
    try {
      modelos.push(String(JSON.parse(r.postData() ?? "{}").model));
    } catch {
      /* ignore */
    }
  });

  await page.goto("/");
  const input = page.locator("textarea").first();
  await expect(input).toBeVisible({ timeout: 30_000 });
  await input.fill("hola");
  await page.keyboard.press("Enter");

  await expect.poll(() => modelos.length, { timeout: 30_000 }).toBe(1);
  expect(modelos[0]).toBe("mock-mini-free");

  // el menú vive junto al botón de regenerar, en la última respuesta
  const mensaje = page.locator("[class*=msg-in]").last();
  await mensaje.hover();
  await page.getByRole("button", { name: "Elegir otro modelo" }).click();
  await page.getByRole("menuitem", { name: /mock-big-free/ }).click();

  // Lo que importa: la segunda petición va al OTRO modelo.
  await expect.poll(() => modelos.length, { timeout: 30_000 }).toBe(2);
  expect(modelos[1]).toBe("mock-big-free");

  // Y la anterior no se pierde: el contador de versiones lo demuestra.
  await expect(page.getByTitle(/Cada regeneración guarda la anterior/)).toContainText("2/2");
});
