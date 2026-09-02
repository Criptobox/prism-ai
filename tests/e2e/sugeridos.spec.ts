import { expect, test } from "./fixtures";

/** Prism AI — Los modelos que se proponen tienen que existir.
 *
 * El fallo real: «Probar» decía «423 modelos visibles» y, justo debajo, los
 * «Sugeridos» salían de una lista escrita a mano en el código. Cuatro de los
 * cinco de OpenRouter ya no existían: los pulsabas, se añadían, y salían en
 * rojo con «el proveedor no los reconoce».
 *
 * Aquí se comprueba el cambio entero: antes de preguntar, la lista de siempre
 * y dicho que lo es; después de preguntar, lo que el proveedor acaba de
 * listar. El proveedor es el mock, así que se sabe exactamente qué contesta.
 */

test("tras «Probar», los sugeridos salen del catálogo del proveedor, no de la lista del código", async ({
  page,
}) => {
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
            // OpenRouter apuntando al mock: la lista de mano es la de verdad
            // del código, pero quien contesta es el mock y se sabe qué trae
            providers: {
              openrouter: {
                apiKey: "sk-test-123",
                baseUrl: "/api/mock-llm",
                enabled: true,
                models: [],
                useProxy: false,
              },
            },
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

  await page.getByRole("button", { name: "Ajustes" }).first().click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByPlaceholder("Buscar proveedor o modelo…").fill("OpenRouter");
  await dialogo.getByRole("button", { name: /OpenRouter/ }).first().click();

  // 1. Antes de preguntar: la lista de siempre, y se dice que lo es
  await expect(dialogo.getByText("Sugeridos de la lista de siempre")).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    dialogo.getByRole("button", { name: "+ deepseek/deepseek-chat-v3-0324:free" })
  ).toBeVisible();

  // 2. Se pregunta al proveedor
  // exact: si no, casa antes con «Probar modelos», que está deshabilitado
  // mientras no tengas ninguno añadido
  await dialogo.getByRole("button", { name: "Probar", exact: true }).click();

  // 3. Ahora salen los del catálogo, y los de la lista de mano desaparecen
  await expect(dialogo.getByText(/Gratis en tu catálogo/)).toBeVisible({ timeout: 20_000 });
  await expect(dialogo.getByRole("button", { name: "+ mock-mini-free" })).toBeVisible();
  await expect(
    dialogo.getByRole("button", { name: "+ deepseek/deepseek-chat-v3-0324:free" })
  ).toHaveCount(0);

  // 4. Y de pago no se propone: la app va de modelos gratis
  await expect(dialogo.getByRole("button", { name: "+ mock-paid-pro" })).toHaveCount(0);

  // 5. Al pulsar uno, se añade de verdad
  await dialogo.getByRole("button", { name: "+ mock-mini-free" }).click();
  await expect(dialogo.getByText("mock-mini-free").first()).toBeVisible();
});
