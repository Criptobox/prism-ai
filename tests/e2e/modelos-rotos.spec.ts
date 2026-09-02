import { expect, test } from "./fixtures";

/** Prism AI — Un modelo que no responde deja de ofrecerse en el chat.
 *
 * Reportado con captura: «Probar modelos» tachaba en rojo los cuatro modelos
 * de Groq que el proveedor no reconoce… y el selector del chat los seguía
 * ofreciendo como si nada. El veredicto vivía en un `useState` dentro del
 * diálogo de Ajustes: al cerrarlo se perdía.
 *
 * Aquí se recorre el camino entero: probar en Ajustes, cerrar, y mirar el
 * selector del chat.
 */

test("tras «Probar modelos», el que falla desaparece del selector del chat", async ({ page }) => {
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
            skills: [],
            settings: {
              defaultModelKey: "custom::mock-mini-free",
              accessCode: "",
              agentModes: [],
              agentMode: false,
              ahorro: false,
              stream: false,
              onlyFree: false,
            },
            providers: {
              custom: {
                apiKey: "test-key-123",
                baseUrl: "/api/mock-llm",
                enabled: true,
                // uno bueno y uno que el mock no reconoce (404 model_not_found)
                models: ["mock-mini-free", "modelo-fantasma"],
                useProxy: false,
              },
            },
            version: 1,
          },
          version: 0,
        })
      );
      localStorage.removeItem("prism-modelos-rotos-v1");
    } catch {
      /* marco sin acceso a localStorage */
    }
  });

  await page.goto("/");
  await expect(page.locator("textarea").first()).toBeVisible({ timeout: 30_000 });

  // 1. Antes de probar, el fantasma se ofrece: nadie sabe todavía que no existe
  // el selector es un combobox, no un button
  const selector = page.getByRole("combobox").first();
  await selector.click();
  await expect(page.getByText("modelo-fantasma").first()).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press("Escape");

  // 2. Se prueban los modelos en Ajustes
  await page.getByRole("button", { name: "Ajustes" }).first().click();
  const ajustes = page.getByRole("dialog");
  await ajustes.getByPlaceholder("Buscar proveedor o modelo…").fill("Personalizado");
  await ajustes.getByRole("button", { name: /Personalizado/ }).first().click();
  await ajustes.getByRole("button", { name: "Probar modelos" }).click();

  // el diálogo lo cuenta: uno no responde
  await expect(ajustes.getByText(/1 no responde/)).toBeVisible({ timeout: 30_000 });

  // 3. Se cierra Ajustes — aquí es donde antes se perdía el veredicto
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // 4. El selector del chat ya no lo ofrece, y el bueno sigue estando
  await selector.click();
  await expect(page.getByText("mock-mini-free").first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("modelo-fantasma")).toHaveCount(0);
});
