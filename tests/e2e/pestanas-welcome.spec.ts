import { expect, test } from "./fixtures";

/** E2E de las pestañas de conversación (D2) y la bienvenida contextual
 * (D3) — PLAN-V7, v3.33. Regla de la casa: lo que el usuario ve y pulsa,
 * se abre y se usa. */
import type { Page } from "@playwright/test";

/** Semilla con proveedor mock y un estado inicial controlado. */
async function seed(page: Page, extra: Record<string, unknown> = {}) {
  await page.addInitScript((payload) => {
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
        ...(payload as Record<string, unknown>),
      },
      version: 0,
    };
    localStorage.setItem("prism-ai-v1", JSON.stringify(seed));
  }, extra);
}

const TABS = (page: Page) => page.getByRole("tablist").getByRole("tab");

test.describe("Pestañas de conversación (D2)", () => {
  test.beforeEach(async ({ page }) => {
    await seed(page);
  });

  test("enviar en dos conversaciones abre dos pestañas y cambiar de pestaña cambia el chat", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const input = page.locator("textarea").first();
    await expect(input).toBeVisible({ timeout: 30_000 });

    // primera conversación
    await input.fill("primera pregunta sobre fotosintesis");
    await page.getByRole("button", { name: "Enviar mensaje" }).click();
    await expect(page.getByText(/mock-mini-free/i).first()).toBeVisible({ timeout: 30_000 });

    // segunda: nueva conversación desde la pestaña +
    await page.getByRole("button", { name: "Abrir conversación en pestaña nueva" }).click();
    await input.fill("segunda pregunta sobre termodinamica");
    await page.getByRole("button", { name: "Enviar mensaje" }).click();
    await expect(page.getByText(/mock-mini-free/i).first()).toBeVisible({ timeout: 30_000 });

    // dos pestañas abiertas y la ACTIVA es la segunda (la última en usarse)
    await expect(TABS(page)).toHaveCount(2);
    await expect(TABS(page).nth(1)).toHaveAttribute("aria-selected", "true");

    // cambiar a la primera: su texto vuelve a verse
    await TABS(page).first().click();
    await expect(TABS(page).first()).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("primera pregunta sobre fotosintesis").first()).toBeVisible();

    // y la segunda sigue cerrable SIN borrarse: queda en la barra lateral
    const cierro = TABS(page).nth(1).getByRole("button", { name: /Cerrar pestaña/ });
    await cierro.click();
    await expect(TABS(page)).toHaveCount(1);
    // la conversación no se borró: el título sigue en la barra lateral
    await expect(page.locator("aside").getByText(/termodinamica/i).first()).toBeVisible();
  });

  test("cerrar la pestaña activa con dos abiertas activa la vecina", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const input = page.locator("textarea").first();
    await expect(input).toBeVisible({ timeout: 30_000 });

    await input.fill("conversacion uno");
    await page.getByRole("button", { name: "Enviar mensaje" }).click();
    await expect(page.getByText(/mock-mini-free/i).first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Abrir conversación en pestaña nueva" }).click();
    await input.fill("conversacion dos");
    await page.getByRole("button", { name: "Enviar mensaje" }).click();
    await expect(page.getByText(/mock-mini-free/i).first()).toBeVisible({ timeout: 30_000 });

    // cierro la ACTIVA (la segunda): debe activarse la primera
    await TABS(page).nth(1).getByRole("button", { name: /Cerrar pestaña/ }).click();
    await expect(TABS(page)).toHaveCount(1);
    await expect(TABS(page).first()).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("conversacion uno").first()).toBeVisible();
  });
});

test.describe("Bienvenida contextual (D3)", () => {
  test("con una conversación reciente, «Continuar» la reabre con su contenido", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const now = Date.now();
    await seed(page, {
      sessions: [
        {
          id: "s-1",
          title: "la web del gimnasio",
          modelKey: "custom::mock-mini-free",
          createdAt: now - 1000,
          updatedAt: now,
          messages: [
            { id: "m1", role: "user", content: "hazme la web del gimnasio", createdAt: now },
            { id: "m2", role: "assistant", content: "aquí tienes la web del gimnasio", createdAt: now },
          ],
        },
      ],
      activeSessionId: null,
    });
    await page.goto("/");

    // el welcome ofrece retomar lo último, con su nombre delante
    const continuar = page.getByRole("button", { name: /Continuar «la web del gimnasio»/ });
    await expect(continuar).toBeVisible({ timeout: 30_000 });
    await continuar.click();
    // el contexto delante: los mensajes de esa conversación
    await expect(page.getByText("hazme la web del gimnasio").first()).toBeVisible();
  });

  test("«Descifrar un error» RELLENA el compositor, no envía", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const now = Date.now();
    await seed(page, {
      sessions: [
        {
          id: "s-1",
          title: "cualquier cosa",
          modelKey: "custom::mock-mini-free",
          createdAt: now - 1000,
          updatedAt: now,
          messages: [
            { id: "m1", role: "user", content: "hola", createdAt: now },
            { id: "m2", role: "assistant", content: "adiós", createdAt: now },
          ],
        },
      ],
      activeSessionId: null,
    });
    await page.goto("/");

    await page.getByRole("button", { name: "Descifrar un error" }).click();
    const input = page.locator("textarea").first();
    await expect(input).toHaveValue(/Tengo este error/);
    // y sin enviar: ningún mensaje en el lienzo (seguimos en la bienvenida,
    // el texto está en el compositor y solo ahí)
    await expect(page.locator("[data-role]")).toHaveCount(0);
  });

  test("sin conversaciones previas no se ofrece «Continuar» (no hay nada real que retomar)", async ({ page }) => {
    await seed(page);
    await page.goto("/");
    await expect(page.getByRole("button", { name: /Continuar/ })).toHaveCount(0);
  });
});
