import { expect, test, type Page } from "@playwright/test";

/** Prism AI — E2E de los arreglos post-v3.4.0:
 *  - la versión se ve en la barra lateral (VersionLine no se renderizaba)
 *  - prompts y skills personalizadas sobreviven a la recarga (persistencia)
 *  - «Borrar todo» limpia de verdad (bóveda, token de GitHub, salud, métricas)
 *  - el failover mantiene el streaming (botón Detener visible en el reintento)
 *  - un enlace de GitHub con pregunta no secuestra el chat; ofrece abrirlo en la burbuja
 */

const SETTINGS = {
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
  lastManualModelKey: null,
};

async function seedStore(page: Page, extra: Record<string, unknown> = {}) {
  await page.addInitScript(({ ext, settings }) => {
    const seed = {
      state: {
        sessions: [],
        activeSessionId: null,
        onboardingDone: true,
        favorites: [],
        radarSeenIds: [],
        settings,
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
        ...ext,
      },
      version: 0,
    };
    localStorage.setItem("prism-ai-v1", JSON.stringify(seed));
  }, { ext: extra, settings: SETTINGS });
}

async function seedFailover(page: Page) {
  await page.addInitScript((settings) => {
    const seed = {
      state: {
        sessions: [],
        activeSessionId: null,
        onboardingDone: true,
        favorites: [],
        radarSeenIds: [],
        settings: { ...settings, defaultModelKey: "aihubmix::coding-kimi-k3-free" },
        providers: {
          aihubmix: {
            apiKey: "sk-test-123",
            baseUrl: "/api/mock-llm",
            enabled: true,
            models: ["coding-kimi-k3-free"],
            useProxy: false,
          },
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
  }, SETTINGS);
}

test.describe("Prism AI — arreglos post-v3.4.0", () => {
  test("la versión se ve en la barra lateral", async ({ page }) => {
    await page.route("**/api/version", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ version: "3.4.0", latest: "3.4.0", status: "ok" }),
      });
    });
    await seedStore(page);
    await page.goto("/");
    await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible({ timeout: 30_000 });
    // antes VersionLine estaba definido pero nunca se renderizaba
    await expect(page.getByText("v3.4.0 · al día")).toBeVisible();
  });

  test("un prompt personalizado sobrevive a la recarga", async ({ page }) => {
    await seedStore(page);
    await page.goto("/");
    const input = page.getByPlaceholder("Escribe tu mensaje…");
    await expect(input).toBeVisible({ timeout: 30_000 });

    // abrir la biblioteca desde la presilla +
    await page.getByRole("button", { name: "Más opciones" }).click();
    await page.getByRole("button", { name: "Abrir biblioteca de prompts" }).click();
    await page.getByRole("button", { name: "Nuevo" }).click();
    await page.getByPlaceholder("Ej. Mi prompt de informes").fill("Mi prompt E2E");
    await page
      .getByPlaceholder("Escribe el prompt completo…")
      .fill("Actúa como un contador y resume este gasto.");
    await page.getByRole("button", { name: "Guardar prompt" }).click();
    await expect(page.getByText("Mi prompt E2E")).toBeVisible();

    // recargar: antes el partialize no guardaba prompts y se perdía
    await page.reload();
    await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Más opciones" }).click();
    await page.getByRole("button", { name: "Abrir biblioteca de prompts" }).click();
    await expect(page.getByText("Mi prompt E2E")).toBeVisible();
  });

  test("el estado de las skills persiste tras recargar", async ({ page }) => {
    await seedStore(page);
    await page.goto("/");
    await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Más opciones" }).click();
    await page.getByRole("button", { name: "Abrir skills" }).click();
    const mentor = page.getByRole("switch", { name: "Activar Mentor de código" });
    await mentor.click();
    await expect(mentor).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");

    await page.reload();
    await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Más opciones" }).click();
    await page.getByRole("button", { name: "Abrir skills" }).click();
    await expect(page.getByRole("switch", { name: "Activar Mentor de código" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  test("«Borrar todo» limpia token, bóveda, salud y métricas", async ({ page }) => {
    await seedStore(page, {
      sessions: [
        {
          id: "s-borrar",
          title: "Sesión a borrar",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: [
            { id: "m1", role: "user", content: "borrar", createdAt: Date.now() },
            { id: "m2", role: "assistant", content: "ok", createdAt: Date.now() },
          ],
        },
      ],
      activeSessionId: "s-borrar",
    });
    await page.addInitScript(() => {
      localStorage.setItem("prism-github-token", "gho_fake");
      localStorage.setItem("prism-github-account", JSON.stringify({ login: "ana" }));
      localStorage.setItem("prism-health-v1", "{\"state\":{\"entries\":{}}}");
      localStorage.setItem("prism-usage-v1", "{\"state\":{\"byModel\":{}}}");
    });
    await page.goto("/");
    await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible({ timeout: 30_000 });
    // la bóveda se siembra DESPUÉS de montar para no disparar el diálogo de PIN:
    // lo que se prueba es que hardReset la borra, no el flujo de desbloqueo
    await page.evaluate(() => localStorage.setItem("prism-vault-v1", "{\"v\":1}"));

    // aceptar el confirm nativo de «Borrar todo»
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Ajustes" }).first().click();
    await page.getByRole("tab", { name: "Datos" }).click();
    await page.getByRole("button", { name: "Borrar todo" }).click();
    await expect(page.getByText("Todo restablecido")).toBeVisible();
    await expect(page.getByText("Aún no hay conversaciones")).toBeVisible();

    const restos = await page.evaluate(() => ({
      token: localStorage.getItem("prism-github-token"),
      account: localStorage.getItem("prism-github-account"),
      vault: localStorage.getItem("prism-vault-v1"),
      health: localStorage.getItem("prism-health-v1"),
      usage: localStorage.getItem("prism-usage-v1"),
    }));
    expect(Object.values(restos).every((v) => v === null)).toBe(true);
  });

  test("el failover reintenta sin perder el indicador de streaming", async ({ page }) => {
    await seedFailover(page);
    await page.goto("/");
    const input = page.getByPlaceholder("Escribe tu mensaje…");
    await expect(input).toBeVisible({ timeout: 30_000 });

    // «kimi-k3» dispara el 429 real de AiHubMix en el mock → failover
    await input.fill("Crea una página de aterrizaje para una cafetería");
    await input.press("Enter");

    await expect(page.getByText(/Cuota gratis agotada en AiHubMix/)).toBeVisible({ timeout: 20_000 });
    // el reintento arranca con el chat EN STREAMING: botón Detener visible
    await expect(page.getByRole("button", { name: "Detener generación" })).toBeVisible({
      timeout: 5000,
    });
    // y al terminar la respuesta vino del modelo de reserva
    await expect(page.getByText(/Personalizado · mock-mini-free/i)).toBeVisible({
      timeout: 30_000,
    });
  });

  test("un enlace de GitHub con pregunta no abre Repo Studio; ofrece abrirlo", async ({ page }) => {
    await seedStore(page);
    await page.goto("/");
    const input = page.getByPlaceholder("Escribe tu mensaje…");
    await expect(input).toBeVisible({ timeout: 30_000 });

    await input.fill("¿Qué opinas de https://github.com/octocat/Hello-World?");
    await input.press("Enter");

    // no secuestra el chat: el diálogo no se abre solo
    await expect(page.getByRole("heading", { name: "Repo Studio" })).toBeHidden({ timeout: 5000 });
    // la pregunta va al modelo y la burbuja ofrece abrir el repo
    await expect(
      page.getByRole("button", { name: "Abrir octocat/Hello-World en Repo Studio" })
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("[data-role='assistant']").last()).toBeVisible();
  });

  test("un enlace suelto abre Repo Studio sin llamar al modelo", async ({ page }) => {
    await seedStore(page);
    await page.goto("/");
    const input = page.getByPlaceholder("Escribe tu mensaje…");
    await expect(input).toBeVisible({ timeout: 30_000 });

    await input.fill("https://github.com/octocat/Hello-World");
    await input.press("Enter");

    await expect(page.getByRole("heading", { name: "Repo Studio" })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("[data-role='assistant']").last()).toContainText(
      "He abierto octocat/Hello-World"
    );
    // no hay respuesta del modelo (el mensaje solo tenía el enlace)
    await expect(page.getByText(/Prism AI funcionando con tu API/)).toHaveCount(0);
  });
});
