import { expect, test } from "@playwright/test";

/** Prism AI — la presilla (+) del recuadro de chat.
 *
 * Seis iconos al lado del texto partían el campo («Escribe tu men…») y
 * escondían el enviar. Ahora van detrás del +: al tocarlo salen adjuntar,
 * voz, agente e imagen.
 */

async function seed(page: import("@playwright/test").Page) {
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
          systemPrompt: "x",
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
    };
    try {
      localStorage.setItem("prism-ai-v1", JSON.stringify(seed));
    } catch {
      /* frame sin acceso */
    }
  });
}

for (const w of [390, 1280]) {
  test.describe(`presilla del chat (${w}px)`, () => {
    test.use(
      w <= 400
        ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1280, height: 800 } }
    );

    test.beforeEach(async ({ page }) => {
      await seed(page);
    });

    test("las opciones extra están ocultas hasta tocar el +", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible({ timeout: 30_000 });

      await expect(page.getByLabel("Adjuntar imágenes o PDF")).toHaveCount(0);
      await expect(page.getByLabel("Modo agente")).toHaveCount(0);
      await expect(page.getByLabel("Modo imagen")).toHaveCount(0);

      const presilla = page.getByRole("button", { name: "Más opciones" });
      await expect(presilla).toBeVisible();
      await presilla.click();

      await expect(page.getByLabel("Adjuntar imágenes o PDF")).toBeVisible();
      await expect(page.getByLabel("Abrir biblioteca de prompts")).toBeVisible();
      await expect(page.getByLabel("Abrir skills")).toBeVisible();
      await expect(page.getByLabel("Dictar por voz")).toBeVisible();
      await expect(page.getByLabel("Modo agente")).toBeVisible();
      await expect(page.getByLabel("Modo imagen")).toBeVisible();

      await page.getByRole("button", { name: "Ocultar opciones" }).click();
      await expect(page.getByLabel("Adjuntar imágenes o PDF")).toHaveCount(0);
      await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible();
    });

    test("el campo de escribir cabe entero, no se parte letra a letra", async ({ page }) => {
      await page.goto("/");
      const campo = page.getByPlaceholder("Escribe tu mensaje…");
      await expect(campo).toBeVisible({ timeout: 30_000 });
      const r = await campo.evaluate((el) => {
        const b = el.getBoundingClientRect();
        return { w: Math.round(b.width), overflow: el.scrollWidth - el.clientWidth };
      });
      expect(r.w, "ancho del campo").toBeGreaterThan(w <= 400 ? 220 : 400);
      expect(r.overflow, "el placeholder no debe recortarse").toBeLessThanOrEqual(0);
    });
  });
}
