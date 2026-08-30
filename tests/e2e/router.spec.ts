import {  expect, test  } from "./fixtures";

/** Prism AI — E2E del router (v2.8, inspirado en OmniRoute):
 * Auto en el selector, badges de cooldown (salud) y panel de métricas de uso. */

/** Semilla idéntica a chat.spec.ts: proveedor custom apuntando al mock interno. */
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

test.describe("Prism AI — router (Auto, salud, uso)", () => {
  test.beforeEach(async ({ page }) => {
    await seedMockProvider(page);
  });

  test("Auto aparece en el selector y responde con el mock", async ({ page }) => {
    await page.goto("/");
    const input = page.getByPlaceholder("Escribe tu mensaje…");
    await expect(input).toBeVisible({ timeout: 30_000 });
    await page.getByRole("combobox").first().click();
    await expect(page.getByText("actívalo y Prism elige el modelo")).toBeVisible();
    await page.getByRole("switch", { name: "Activar Auto" }).click();
    // el botón del picker muestra Auto
    await expect(page.getByRole("combobox").first()).toContainText("Auto");
    await input.fill("Hola Auto");
    await input.press("Enter");
    await expect(page.getByText(/mock-mini-free/i).first()).toBeVisible({ timeout: 20_000 });
  });

  test("los modelos en cooldown muestran badge con los segundos restantes", async ({ page }) => {
    await page.addInitScript(() => {
      const health = {
        state: {
          entries: {
            "custom::mock-big-free": {
              until: Date.now() + 90_000,
              consecutive: 1,
              lastStatus: 429,
              reason: "límite de peticiones",
            },
          },
          lastGood: { key: "custom::mock-mini-free", at: Date.now() - 1000 },
        },
        version: 0,
      };
      localStorage.setItem("prism-health-v1", JSON.stringify(health));
    });
    await page.goto("/");
    const input = page.getByRole("textbox").first();
    await expect(input).toBeVisible({ timeout: 30_000 });
    await page.getByRole("combobox").first().click();
    // badge de cooldown con segundos/minutos en el modelo enfriado
    await expect(page.getByText(/^\d+\s?(s|min)$/)).toBeVisible();
    // badge ✓ ok en el último modelo bueno (LKGP)
    await expect(page.getByText("✓ ok")).toBeVisible();
  });

  test("el panel de Uso muestra las métricas locales sembradas", async ({ page }) => {
    await page.addInitScript(() => {
      const usage = {
        state: {
          byModel: {
            "custom::mock-mini-free": {
              requests: 3,
              ok: 2,
              fail: 1,
              totalMs: 2400,
              ms: [900, 1500],
              charsIn: 3000,
              charsOut: 800,
              savedChars: 600,
              lastUsed: Date.now(),
            },
          },
          days: { [new Date().toISOString().slice(0, 10)]: 3 },
        },
        version: 0,
      };
      localStorage.setItem("prism-usage-v1", JSON.stringify(usage));
    });
    await page.goto("/");
    const input = page.getByRole("textbox").first();
    await expect(input).toBeVisible({ timeout: 30_000 });
    // «Uso» salió del menú «Más» y es un botón del pie, junto a Sandbox y Radar
    await page.getByRole("button", { name: "Uso" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Peticiones hoy")).toBeVisible();
    await expect(dialog.getByText("mock-mini-free")).toBeVisible();
    await expect(dialog.getByText("−20%").first()).toBeVisible(); // 600/3000 = 20% de ahorro
  });

  test("la compresión estándar marca el ahorro (chip ctx −%) en la respuesta", async ({ page }) => {
    await page.addInitScript(() => {
      const seed = JSON.parse(localStorage.getItem("prism-ai-v1")!);
      seed.state.settings.compression = "standard";
      const largo = Array.from({ length: 14 }, () =>
        "Por supuesto, básicamente la   función   anterior   recibe   los   parámetros   y   devuelve   el   resultado   esperado   por   el   usuario   final   de   la   aplicación."
      ).join(" ");
      const now = Date.now();
      const s = {
        id: "s-comp",
        title: "compresión",
        createdAt: now,
        updatedAt: now,
        modelKey: "custom::mock-mini-free",
        messages: [
          { id: "m1", role: "user", content: "explícame la función", createdAt: now - 60_000 },
          { id: "m2", role: "assistant", content: largo, createdAt: now - 30_000 },
        ],
      };
      seed.state.sessions = [s];
      seed.state.activeSessionId = "s-comp";
      localStorage.setItem("prism-ai-v1", JSON.stringify(seed));
    });
    await page.goto("/");
    const input = page.getByPlaceholder("Escribe tu mensaje…");
    await expect(input).toBeVisible({ timeout: 30_000 });
    await input.fill("¿y ahora?");
    await input.press("Enter");
    await expect(page.getByText(/ctx −\d+%/).first()).toBeVisible({ timeout: 20_000 });
  });
});
