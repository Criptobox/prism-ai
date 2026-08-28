import { expect, test } from "@playwright/test";

/** Semilla el store con un proveedor custom apuntando al mock interno (/api/mock-llm)
 * y un modelo gratis — el mismo truco que usamos en las verificaciones E2E manuales. */
async function seedMockProvider(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const seed = {
      state: {
        sessions: [],
        activeSessionId: null,
        onboardingDone: true,
        favorites: [],
        radarSeenIds: [],
        settings: {
          defaultModelKey: "custom::mock-mini-free",
          systemPrompt: "Eres Prism AI (test).",
          temperature: 0.7,
          maxTokens: null,
          stream: true,
          contextWindow: 10,
          sendKeyOnProxy: true,
          onlyFree: false,
          agentMode: false,
          agentMaxLoops: 3,
          accent: "violeta",
          accentCustom: "#8b5cf6",
          autoSpeak: false,
          accessCode: "",
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
    };
    localStorage.setItem("prism-ai-v1", JSON.stringify(seed));
  });
}

test.describe("Prism AI — flujo principal", () => {
  test.beforeEach(async ({ page }) => {
    await seedMockProvider(page);
  });

  test("enviar mensaje y recibir respuesta del mock", async ({ page }) => {
    await page.goto("/");
    const input = page.getByRole("textbox").first();
    await expect(input).toBeVisible({ timeout: 30_000 });
    await input.fill("Hola, ¿qué es un closure?");
    await input.press("Enter");
    await expect(page.getByText(/mock-mini-free/i).first()).toBeVisible();
  });

  test("Ctrl+K abre el selector de modelos", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("combobox").first()).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog").or(page.locator("[data-radix-popper-content-wrapper]")).first()).toBeVisible();
  });

  test("«?» abre la cheat sheet de atajos", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("textbox").first()).toBeVisible({ timeout: 30_000 });
    // la app ignora «?» mientras se escribe: quita el foco del input primero
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("Shift+Slash");
    await expect(page.getByText("Atajos de teclado")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByText("Atajos de teclado")).toBeHidden();
  });
});
