import { expect, test, type Page } from "@playwright/test";

/** Prism AI — la interfaz que salió del prototipo.
 *
 * Tres cosas, y ninguna se comprueba mirando si un elemento existe:
 *  · la barra lateral está agrupada y ya no hay cajón «Más»
 *  · los chips de la cabecera NO salen cuando no hay dato que enseñar
 *  · el estilo del compositor llega de verdad al prompt del modelo
 */
async function seed(page: Page, over: Record<string, unknown> = {}) {
  await page.addInitScript((o) => {
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
            settings: { defaultModelKey: "custom::mock-mini-free", accessCode: "", outputStyle: "normal", agentModes: [] },
            providers: {
              custom: { apiKey: "k", baseUrl: "/api/mock-llm", enabled: true, models: ["mock-mini-free"], useProxy: false },
            },
            version: 1,
            ...(o as object),
          },
          version: 0,
        })
      );
      localStorage.setItem("prism-preview-demo", "1");
    } catch {}
  }, over);
}

test("la barra lateral está agrupada y no queda cajón de sastre", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await seed(page);
  await page.goto("/");
  await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible({ timeout: 30_000 });

  const lateral = page.locator("aside");
  for (const g of ["Proyectos", "Modelos", "Herramientas"]) {
    await expect(lateral.getByText(g, { exact: true })).toBeVisible();
  }

  // lo que antes vivía escondido en «Más» ahora se ve sin abrir nada
  for (const b of ["Biblioteca", "Skills", "Arena", "Guía"]) {
    await expect(lateral.getByRole("button", { name: b })).toBeVisible();
  }
  await expect(lateral.getByRole("button", { name: "Más" }), "el cajón de sastre").toHaveCount(0);
});

test("sin dato de cuota medido, la cabecera no enseña ningún porcentaje", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await seed(page);
  await page.goto("/");
  await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible({ timeout: 30_000 });

  // el mock no manda cabeceras x-ratelimit: no hay nada medido, así que no
  // puede salir un porcentaje. Inventarlo sería lo peor, porque la cabecera
  // es lo primero que se mira.
  const cabecera = page.locator("header").first();
  await expect(cabecera.getByText(/%\s*(requests|tokens)/)).toHaveCount(0);
});

test("el estilo elegido en el compositor viaja en el prompt de sistema", async ({ page }) => {
  await seed(page);
  await page.goto("/");
  await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible({ timeout: 30_000 });

  const tira = page.getByRole("radiogroup", { name: "Estilo de respuesta" });
  await expect(tira).toBeVisible();
  await tira.getByRole("radio", { name: "Conciso" }).click();

  const cuerpos: string[] = [];
  await page.route("**/api/mock-llm/**", async (route) => {
    if (route.request().method() === "POST") cuerpos.push(route.request().postData() ?? "");
    await route.continue();
  });
  await page.getByPlaceholder("Escribe tu mensaje…").fill("hola");
  await page.keyboard.press("Enter");
  await expect.poll(() => cuerpos.length, { timeout: 20_000 }).toBeGreaterThan(0);

  const body = JSON.parse(cuerpos[0]) as { messages: { role: string; content: string }[] };
  const sys = body.messages.find((m) => m.role === "system")?.content ?? "";
  expect(sys, "el estilo tiene que llegar al modelo, no solo iluminar el botón").toContain(
    "[Estilo: conciso]"
  );
});
