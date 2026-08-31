import { expect, test, type Page } from "@playwright/test";

/** Prism AI — El modo ahorro llega de verdad al modelo, y el medidor no miente.
 *
 * Dos cosas que un interruptor bonito no garantiza:
 *   1. Que la instrucción de ir al grano VIAJE en el prompt de sistema.
 *   2. Que el medidor de Ajustes enseñe el número del prompt que se manda,
 *      y no uno calculado por su cuenta que se desincroniza a la primera.
 *
 * Por eso no se mira el botón: se intercepta la petición y se lee lo que sale.
 */
async function seed(page: Page) {
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
            settings: {
              defaultModelKey: "custom::mock-mini-free",
              accessCode: "",
              agentModes: [],
              ahorro: false,
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
        })
      );
      localStorage.setItem("prism-preview-demo", "1");
    } catch {}
  });
}

/** El prompt de sistema del siguiente envío al proveedor. */
async function systemPromptDe(page: Page, escribir: string): Promise<string> {
  const cuerpos: string[] = [];
  await page.route("**/api/mock-llm/**", async (route) => {
    if (route.request().method() === "POST") cuerpos.push(route.request().postData() ?? "");
    await route.continue();
  });
  await page.getByPlaceholder("Escribe tu mensaje…").fill(escribir);
  await page.keyboard.press("Enter");
  await expect.poll(() => cuerpos.length, { timeout: 20_000 }).toBeGreaterThan(0);
  const body = JSON.parse(cuerpos[0]) as { messages: { role: string; content: string }[] };
  const sys = body.messages.find((m) => m.role === "system")?.content ?? "";
  await page.unroute("**/api/mock-llm/**");
  return sys;
}

async function abrirAjustesChat(page: Page) {
  await page.getByRole("button", { name: "Ajustes" }).click();
  await page.getByRole("tab", { name: /chat/i }).click();
}

test("apagado, la instrucción de ahorro no viaja", async ({ page }) => {
  await seed(page);
  await page.goto("/");
  await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible({ timeout: 30_000 });
  const sys = await systemPromptDe(page, "hola");
  expect(sys).not.toContain("MODO AHORRO");
});

test("encendido, la instrucción de ir al grano viaja en el prompt de sistema", async ({ page }) => {
  await seed(page);
  await page.goto("/");
  await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible({ timeout: 30_000 });

  await abrirAjustesChat(page);
  await page.getByRole("switch", { name: "Modo ahorro" }).click();
  await page.keyboard.press("Escape");

  const sys = await systemPromptDe(page, "hola");
  expect(sys).toContain("MODO AHORRO");
  expect(sys, "lo que le prohíbe es lo que importa").toContain("Nada de preámbulos");
});

test("el medidor enseña el número del prompt que de verdad se manda", async ({ page }) => {
  await seed(page);
  await page.goto("/");
  await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible({ timeout: 30_000 });

  // 1. lo que dice el medidor
  await abrirAjustesChat(page);
  const linea = page.getByText(/^[\d.,]+ car\.$/).first();
  await expect(linea).toBeVisible();
  const texto = (await linea.textContent()) ?? "";
  const medido = Number(texto.replace(/[^\d]/g, ""));
  expect(medido).toBeGreaterThan(0);
  await page.keyboard.press("Escape");

  // 2. lo que sale por el cable
  const sys = await systemPromptDe(page, "hola");

  // El medidor mide el prompt SIN la sesión abierta (todavía no hay mapa),
  // así que el que viaja puede traer piezas de más, nunca de menos.
  expect(sys.length).toBeGreaterThanOrEqual(medido);
  // y no puede ser un número inventado: se parecen de verdad
  expect(Math.abs(sys.length - medido)).toBeLessThan(medido * 0.5);
});
