import { expect, test } from "./fixtures";

/** E2E del HUD de contexto del compositor (v3.32, PLAN-V7 idea D4).
 *
 * Regla de la casa: si el usuario lo ve, hay un E2E que lo abre y lo usa.
 * El HUD aparece con la conversación empezada; una semilla con mensajes
 * largos lo deja por encima del umbral de aviso sin esperar a que nadie
 * escriba una conversación entera a mano. */
import type { Locator, Page } from "@playwright/test";

const HUD = (page: Page): Locator => page.locator('[aria-label^="Contexto estimado"]');

/** Semilla: proveedor mock + una sesión con un mensaje LARGO (60k chars
 * ≈ 15k tokens ≈ 47 % de la ventana por defecto de 32k). Con dos
 * mensajes llegamos al aviso (>80 %) sin depender de tiempos de red. */
async function semillar(page: Page, chars: number) {
  await page.addInitScript((largo: number) => {
    const now = Date.now();
    const seed = {
      state: {
        sessions: [
          {
            id: "s-hud",
            title: "conversación larga",
            modelKey: "custom::mock-mini-free",
            createdAt: now,
            updatedAt: now,
            messages: [
              { id: "m1", role: "user", content: "c".repeat(largo), createdAt: now },
              { id: "m2", role: "assistant", content: "r".repeat(largo), createdAt: now },
            ],
          },
        ],
        activeSessionId: "s-hud",
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
  }, chars);
}

test.describe("HUD de contexto", () => {
  test("con conversación empezada, el medidor aparece con el porcentaje", async ({ page }) => {
    await semillar(page, 10_000); // 2 mensajes × 2,5k tokens = 5k ≈ 16 %
    await page.goto("/");
    const hud = HUD(page);
    await expect(hud).toBeVisible({ timeout: 30_000 });
    await expect(hud).toContainText(/ctx ≈\d+([\.,]\d+)?k · \d+([\.,]\d+)?%/);
  });

  test("una conversación que llena la ventana avisa (ámbar) sin inventar datos", async ({ page }) => {
    await semillar(page, 60_000); // 2 × 15k tokens = 30k ≈ 94 % → aviso
    await page.goto("/");
    const hud = HUD(page);
    await expect(hud).toBeVisible({ timeout: 30_000 });
    // el texto del aviso viaja en el title del medidor: es la parte honesta
    const titulo = await hud.getAttribute("title");
    expect(titulo).toContain("estimación local");
    expect(titulo).toContain("ventana de referencia");
  });

  test("en una conversación vacía no se pinta (no hay nada que medir)", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("prism-preview-demo", "1");
      localStorage.setItem(
        "prism-ai-v1",
        JSON.stringify({
          state: {
            sessions: [],
            activeSessionId: null,
            onboardingDone: true,
            settings: { onlyFree: false, agentMode: false },
            providers: {
              custom: {
                apiKey: "k",
                baseUrl: "/api/mock-llm",
                enabled: true,
                models: ["mock-mini-free"],
                useProxy: false,
              },
            },
            version: 1,
          },
          version: 0,
        })
      );
    });
    await page.goto("/");
    await expect(page.getByRole("textbox").first()).toBeVisible({ timeout: 30_000 });
    await expect(HUD(page)).toHaveCount(0);
  });
});
