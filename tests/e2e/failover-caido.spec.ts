import { expect, test } from "./fixtures";

/** Prism AI — Si tu proveedor está caído, se salta a otro. No se queda ahí.
 *
 * Reportado con captura: modelo elegido a mano, Google Gemini contesta
 * «503: This model is currently experiencing high demand», y el error se
 * quedaba en pantalla sin intentar nada más — con otros proveedores
 * conectados y sin usar. Con la cadena agotada, un fallo pasajero se trataba
 * como definitivo.
 *
 * Y el aviso, encima, decía «cuota gratis agotada»: a quien tiene una clave de
 * pago eso le manda a mirar su facturación por un problema del proveedor.
 */

test("un 503 salta al siguiente proveedor y el aviso NO habla de cuota", async ({ page }) => {
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
              // modelo elegido A MANO: la cadena es de uno solo, que es donde
              // el failover se quedaba parado
              defaultModelKey: "custom::mock-mini-free",
              accessCode: "",
              agentModes: [],
              agentMode: false,
              ahorro: false,
              stream: false,
              piiShield: false,
            },
            providers: {
              custom: {
                apiKey: "k1",
                baseUrl: "/api/mock-llm",
                enabled: true,
                models: ["mock-mini-free"],
                useProxy: false,
              },
              // el segundo proveedor al que debe saltar
              groq: {
                apiKey: "k2",
                baseUrl: "/api/mock-llm",
                enabled: true,
                models: ["mock-big-free"],
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

  // el primer modelo está «caído»: 503 con el texto real de Gemini
  await page.route("**/api/mock-llm/**", async (route) => {
    const cuerpo = route.request().postData() ?? "";
    if (route.request().method() === "POST" && cuerpo.includes("mock-mini-free")) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            message:
              "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.",
          },
        }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  const compositor = page.locator("textarea").first();
  await expect(compositor).toBeVisible({ timeout: 30_000 });
  await compositor.fill("Hola");
  await page.keyboard.press("Enter");

  // 1. El aviso dice la causa real, y NO habla de cuota
  const aviso = page.locator("[data-sonner-toast]").filter({ hasText: /no está respondiendo/ });
  await expect(aviso.first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: /cuota/i })).toHaveCount(0);

  // 2. Y no se queda ahí: contesta el segundo proveedor
  await expect(page.getByText(/mock-big-free/).first()).toBeVisible({ timeout: 45_000 });
});
