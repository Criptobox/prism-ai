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

test.describe("Prism AI — nada se pierde", () => {
  test.beforeEach(async ({ page }) => {
    await seedMockProvider(page);
  });

  test("regenerar guarda la respuesta anterior en vez de borrarla", async ({ page }) => {
    await page.goto("/");
    const input = page.getByPlaceholder("Escribe tu mensaje…");
    await expect(input).toBeVisible({ timeout: 30_000 });
    await input.fill("Hola, dime algo");
    await input.press("Enter");

    const respuesta = page.locator("[data-role='assistant']").last();
    await expect(respuesta).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    const primera = (await respuesta.innerText()).trim();
    expect(primera.length).toBeGreaterThan(0);

    // regenerar: antes esto BORRABA la respuesta para siempre
    await page.getByRole("button", { name: "Regenerar" }).first().click();
    await page.waitForTimeout(2500);

    // aparece el contador de versiones
    const contador = page.getByTitle(/Cada regeneración guarda la anterior/);
    await expect(contador).toBeVisible({ timeout: 20_000 });
    await expect(contador).toHaveText("2/2");

    // y la respuesta original sigue ahí, a una flecha de distancia
    await page.getByRole("button", { name: "Versión anterior" }).first().click();
    await expect(contador).toHaveText("1/2");
    await expect(page.locator("[data-role='assistant']").last()).toContainText(
      primera.slice(0, 30)
    );
  });

  test("«Nueva conversación» no deja conversaciones vacías en la lista", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible({ timeout: 30_000 });

    // tres clics seguidos no deben ensuciar la barra lateral
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: "Nueva conversación" }).first().click();
      await page.waitForTimeout(200);
    }
    await expect(page.getByText("Aún no hay conversaciones")).toBeVisible();

    // al escribir sí se crea, una sola vez
    const input = page.getByPlaceholder("Escribe tu mensaje…");
    await input.fill("Primera de verdad");
    await input.press("Enter");
    await expect(page.getByText("Aún no hay conversaciones")).toBeHidden({ timeout: 20_000 });
  });

  test("se puede enviar el mismo texto otra vez", async ({ page }) => {
    await page.goto("/");
    const input = page.getByPlaceholder("Escribe tu mensaje…");
    await expect(input).toBeVisible({ timeout: 30_000 });
    await input.fill("Hola otra vez");
    await input.press("Enter");
    await expect(page.locator("[data-role='user']")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Regenerar" })).toBeVisible({ timeout: 30_000 });

    await input.fill("Hola otra vez");
    await input.press("Enter");
    await expect(page.locator("[data-role='user']")).toHaveCount(2);
  });

  test("los hilos archivan un tema sin salir de la conversación", async ({ page }) => {
    await page.goto("/");
    const input = page.getByPlaceholder("Escribe tu mensaje…");
    await expect(input).toBeVisible({ timeout: 30_000 });
    await input.fill("Tema uno sobre bases de datos");
    await input.press("Enter");
    await expect(page.locator("[data-role='assistant']").last()).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: /Nuevo hilo/ }).click();
    // el lienzo queda limpio pero la conversación sigue siendo la misma
    await expect(page.locator("[data-role='assistant']")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /1 hilo/ })).toBeVisible();

    // y se puede volver al tema anterior entero
    await page.getByRole("button", { name: /1 hilo/ }).click();
    await page.getByRole("menuitem").first().click();
    // el mensaje vuelve entero, no solo el nombre del hilo
    await expect(page.locator("[data-role='user']")).toContainText(
      "Tema uno sobre bases de datos"
    );
    await expect(page.locator("[data-role='assistant']")).toHaveCount(1);
  });
});
