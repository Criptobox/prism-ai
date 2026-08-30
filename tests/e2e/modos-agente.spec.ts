import { expect, test, type Page } from "@playwright/test";

/** Prism AI — los modos de agente llegan de verdad al modelo.
 *
 * Un interruptor que se ilumina y no cambia nada es peor que no tenerlo. Aquí
 * no se comprueba el botón: se intercepta la petición que sale hacia el
 * proveedor y se mira el prompt de sistema que viaja dentro.
 */
async function seed(page: Page) {
  await page.addInitScript(() => {
    if (window.top !== window.self) return;
    try {
      if (localStorage.getItem("prism-ai-v1")) return;
      localStorage.setItem(
        "prism-ai-v1",
        JSON.stringify({
          state: {
            sessions: [],
            activeSessionId: null,
            onboardingDone: true,
            favorites: [],
            radarSeenIds: [],
            settings: { defaultModelKey: "custom::mock-mini-free", accessCode: "", agentModes: [] },
            providers: {
              custom: { apiKey: "k", baseUrl: "/api/mock-llm", enabled: true, models: ["mock-mini-free"], useProxy: false },
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

/** El prompt de sistema del último envío al proveedor. */
async function systemPromptDeLaPeticion(page: Page, escribir: string): Promise<string> {
  const cuerpos: string[] = [];
  await page.route("**/api/mock-llm/**", async (route) => {
    if (route.request().method() === "POST") cuerpos.push(route.request().postData() ?? "");
    await route.continue();
  });
  await page.getByPlaceholder("Escribe tu mensaje…").fill(escribir);
  await page.keyboard.press("Enter");
  await expect.poll(() => cuerpos.length, { timeout: 20_000 }).toBeGreaterThan(0);
  const body = JSON.parse(cuerpos[0]) as { messages: { role: string; content: string }[] };
  return body.messages.find((m) => m.role === "system")?.content ?? "";
}

test("sin modos activos, el prompt no lleva ninguno", async ({ page }) => {
  await seed(page);
  await page.goto("/");
  await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible({ timeout: 30_000 });
  const sys = await systemPromptDeLaPeticion(page, "hola");
  expect(sys).not.toContain("[Modo:");
});

test("el modo que enciendes viaja en el prompt de sistema", async ({ page }) => {
  await seed(page);
  await page.goto("/");
  await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Ajustes" }).click();
  await page.getByRole("tab", { name: /chat/i }).click();
  await page.getByRole("button", { name: /Sin inventar/ }).click();
  await page.getByRole("button", { name: /Archivos completos/ }).click();
  await page.keyboard.press("Escape");

  const sys = await systemPromptDeLaPeticion(page, "hazme un archivo");
  expect(sys, "el modo elegido tiene que ir dentro").toContain("[Modo: sin inventar]");
  expect(sys).toContain("[Modo: archivos completos]");
  // y solo los elegidos
  expect(sys).not.toContain("[Modo: cambio mínimo]");

  // lo que de verdad importa de cada modo: la prohibición
  expect(sys).toMatch(/no lo sé/i);
  expect(sys).toMatch(/Prohibido/);
});

test("los modos se quedan puestos entre recargas", async ({ page }) => {
  await seed(page);
  await page.goto("/");
  await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Ajustes" }).click();
  await page.getByRole("tab", { name: /chat/i }).click();
  const boton = page.getByRole("button", { name: /Con freno/ });
  await boton.click();
  await expect(boton).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Ajustes" }).click();
  await page.getByRole("tab", { name: /chat/i }).click();
  await expect(page.getByRole("button", { name: /Con freno/ })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
});
