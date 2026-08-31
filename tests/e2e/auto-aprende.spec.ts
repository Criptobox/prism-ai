import { expect, test } from "./fixtures";

/** Prism AI — «Auto» aprende de lo que TE ha funcionado, y lo enseña.
 *
 * `useUsage` guardaba aciertos y tiempos por modelo desde hace versiones, y
 * `buildTaskChain` no los miraba: ordenaba por una tabla estática y por el
 * último acierto. Auto no aprendía, recordaba una cosa.
 *
 * La regla que se comprueba aquí es la que evita el invento: con pocas
 * muestras se dice **«sin dato»** en vez de un porcentaje sacado de dos
 * respuestas.
 */

async function seed(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("prism-preview-demo", "1");
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
      // historial medido: uno con muestras de sobra, otro con dos
      localStorage.setItem(
        "prism-usage-v1",
        JSON.stringify({
          state: {
            byModel: {
              "groq::veterano-free": {
                requests: 20,
                ok: 18,
                fail: 2,
                totalMs: 18 * 1500,
                ms: [1500],
                charsIn: 1000,
                charsOut: 2000,
                savedChars: 0,
                lastUsed: Date.now(),
              },
              "groq::recien-llegado-free": {
                requests: 2,
                ok: 2,
                fail: 0,
                totalMs: 2 * 500,
                ms: [500],
                charsIn: 100,
                charsOut: 200,
                savedChars: 0,
                lastUsed: Date.now() - 1000,
              },
            },
            days: {},
          },
          version: 0,
        })
      );
    } catch {
      /* frame sin acceso */
    }
  });
}

test("el panel de Uso enseña lo medido, y dice «sin dato» cuando no lo hay", async ({ page }) => {
  await seed(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("textarea").first()).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Uso" }).click();
  const dialogo = page.getByRole("dialog");

  // 18 de 20 son el 90%, y la media de las correctas 1,5 s
  await expect(dialogo.getByText(/90% de aciertos · 1\.5s de media · 20 respuestas/)).toBeVisible();

  // el de dos respuestas NO recibe un porcentaje inventado
  await expect(dialogo.getByText(/sin dato · faltan 3 respuestas/)).toBeVisible();
});
