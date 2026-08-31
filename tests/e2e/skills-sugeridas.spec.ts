import { expect, test } from "./fixtures";

/** Prism AI — La skill que encaja se propone, y el clic la activa de verdad.
 *
 * `classifyTask` ya clasificaba el encargo en seis tipos y solo se usaba para
 * elegir modelo: podías tener siete skills instaladas y ninguna pista de cuál
 * sirve para lo que estás haciendo.
 *
 * Lo que se comprueba aquí es lo que un test de componente no ve:
 *   1. Que al pedir una web aparezca la propuesta.
 *   2. Que el botón «Activar» la encienda DE VERDAD (se mira el interruptor
 *      en el diálogo de Skills, no el toast).
 *   3. Que no insista con la misma dos veces.
 *   4. Que una charla normal no proponga nada.
 */

async function seed(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
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
                apiKey: "test-key-123",
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
    } catch {
      /* frame sin acceso */
    }
  });
  // las integradas arrancan apagadas para que haya algo que proponer
  await page.addInitScript(() => {
    const clave = "prism-ai-v1";
    try {
      const raw = localStorage.getItem(clave);
      if (!raw) return;
      const d = JSON.parse(raw);
      d.state.skills = [
        {
          id: "skill-web-dev",
          name: "Desarrollador web experto",
          description: "",
          icon: "🌐",
          instructions: "Eres un desarrollador web senior.",
          builtin: true,
          enabled: false,
          kinds: ["web"],
        },
        {
          id: "skill-data-analyst",
          name: "Analista de datos",
          description: "",
          icon: "📊",
          instructions: "Eres analista de datos.",
          builtin: true,
          enabled: false,
          kinds: ["data"],
        },
      ];
      localStorage.setItem(clave, JSON.stringify(d));
    } catch {
      /* ignore */
    }
  });
}

test("al pedir una web se propone la skill de web, y el clic la activa", async ({ page }) => {
  await seed(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const input = page.locator("textarea").first();
  await expect(input).toBeVisible({ timeout: 30_000 });

  await input.fill("hazme una landing para mi tienda");
  await page.keyboard.press("Enter");

  // 1. sale la propuesta, con el precio a la vista
  const aviso = page.getByText("Desarrollador web experto").first();
  await expect(aviso).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/car\. por mensaje/).first()).toBeVisible();

  // 2. el botón la enciende de verdad.
  //    Se acota al toast de la skill: el del modo agente también ofrece
  //    «Activar» y sale a la vez en el primer mensaje de la sesión.
  await page
    .locator("[data-sonner-toast]")
    .filter({ hasText: "Desarrollador web experto" })
    .getByRole("button", { name: "Activar" })
    .click();
  await expect(page.getByText("«Desarrollador web experto» activada")).toBeVisible({
    timeout: 10_000,
  });

  // se comprueba en el diálogo de Skills, no en el toast
  await page.getByRole("button", { name: "Skills" }).click();
  const interruptor = page
    .getByRole("dialog")
    .getByRole("switch")
    .first();
  await expect(interruptor).toHaveAttribute("data-state", "checked");
});

test("no insiste: la misma skill no se propone dos veces", async ({ page }) => {
  await seed(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const input = page.locator("textarea").first();
  await expect(input).toBeVisible({ timeout: 30_000 });

  await input.fill("hazme una landing");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Desarrollador web experto").first()).toBeVisible({ timeout: 15_000 });

  // se descarta sin activar y se vuelve a pedir lo mismo. Hay que esperar a
  // que los avisos se vayan solos: mientras están, tapan el compositor.
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 20_000 });
  await input.fill("hazme otra página web");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2500);

  await expect(page.getByText(/car\. por mensaje/)).toHaveCount(0);
});

test("una charla normal no propone nada", async ({ page }) => {
  await seed(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const input = page.locator("textarea").first();
  await expect(input).toBeVisible({ timeout: 30_000 });

  await input.fill("hola, qué tal");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2500);

  await expect(page.getByText(/car\. por mensaje/)).toHaveCount(0);
});
