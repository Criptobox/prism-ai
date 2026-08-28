import { expect, test } from "@playwright/test";

/** Prism AI — E2E de las mejoras «Edición Orca» (v2.9):
 * Escudo PII al enviar y registro de peticiones con Copiar como cURL. */

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
          compression: "off",
          outputStyle: "normal",
          piiShield: true,
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

test.describe("Prism AI — edición Orca (escudo PII + cURL)", () => {
  test.beforeEach(async ({ page }) => {
    await seedMockProvider(page);
  });

  test("el escudo PII enmascara el correo al enviar y muestra el chip 🛡", async ({ page }) => {
    await page.goto("/");
    const input = page.getByPlaceholder("Escribe tu mensaje…");
    await expect(input).toBeVisible({ timeout: 30_000 });
    await input.fill("Mi correo es usuario.oculto@ejemplo.com, escríbeme");
    await input.press("Enter");
    // aviso del escudo
    await expect(page.getByText(/Escudo PII: 1 dato enmascarado/)).toBeVisible({ timeout: 20_000 });
    // la burbuja del usuario NO cambia (sigue visible su texto)
    await expect(page.getByText(/usuario\.oculto@ejemplo\.com/).first()).toBeVisible();
    // chip del escudo en la respuesta del asistente
    await expect(page.getByText(/🛡 1/)).toBeVisible({ timeout: 20_000 });
  });

  test("la petición queda registrada y «Copiar cURL» muestra el comando con claves redactadas", async ({
    page,
  }) => {
    await page.goto("/");
    const input = page.getByPlaceholder("Escribe tu mensaje…");
    await expect(input).toBeVisible({ timeout: 30_000 });
    await input.fill("Hola registro");
    await input.press("Enter");
    await expect(page.getByText(/mock-mini-free/i).first()).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: /uso/i }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Peticiones recientes")).toBeVisible();
    await expect(dialog.getByText("mock-mini-free").first()).toBeVisible();

    // sin permiso de portapapeles → se abre el visor del cURL
    await dialog.getByRole("button", { name: /copiar curl/i }).first().click();
    const viewer = page.getByRole("dialog").filter({ hasText: "cURL de la petición" });
    await expect(viewer).toBeVisible();
    await expect(viewer.getByText(/curl -X POST/)).toBeVisible();
    await expect(viewer.getByText(/TU_API_KEY/).first()).toBeVisible();
    await expect(viewer.getByText(/test-key-123/)).toHaveCount(0); // jamás la clave real
  });
});
