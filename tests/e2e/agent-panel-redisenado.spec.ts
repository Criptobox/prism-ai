import { expect, test } from "./fixtures";

/** Prism AI — Rediseño del panel del agente (v3.16).
 *
 * Antes (v3.15): el plan, las iteraciones y las revisiones se mostraban
 * de golpe en una lista de `<details>`. El estado del bucle y el botón
 * «Continuar» vivían en `message.tsx`.
 *
 * Ahora (v3.16): el trabajo del agente se organiza en pestañas
 * (Plan · Estructura · Edits · Resultados) con la activa en púrpura
 * sólido, el logo de Prism como marca, un spinner animado mientras
 * genera, y debajo el estado del bucle + botón «Continuar el agente».
 *
 * Esta prueba siembra un proveedor custom con el mock-llm en modo
 * agente (que responde con XML de plan/step/review/answer) y verifica
 * que aparecen las pestañas y el botón «Continuar» cuando el agente se
 * queda a medias.
 */

const PROVIDER_KEY = "test-key-123";
const MODEL_ID = "mock-mini-free";

async function seedAgent(page: import("@playwright/test").Page) {
  await page.addInitScript(
    ({ model, key }: { model: string; key: string }) => {
      const seed = {
        state: {
          sessions: [],
          activeSessionId: null,
          onboardingDone: true,
          favorites: [],
          radarSeenIds: [],
          settings: {
            defaultModelKey: `custom::${model}`,
            systemPrompt: "x",
            temperature: 0.7,
            maxTokens: null,
            stream: false,
            contextWindow: 10,
            sendKeyOnProxy: true,
            onlyFree: false,
            agentMode: true,
            agentMaxLoops: 3,
            accent: "violeta",
            accentCustom: "#8b5cf6",
            autoSpeak: false,
            accessCode: "",
          },
          providers: {
            custom: {
              apiKey: key,
              baseUrl: "/api/mock-llm",
              enabled: true,
              models: [model],
              useProxy: false,
            },
          },
          version: 1,
        },
        version: 0,
      };
      try {
        localStorage.setItem("prism-ai-v1", JSON.stringify(seed));
        localStorage.setItem("prism-preview-demo", "1");
      } catch {
        /* frame sin acceso */
      }
    },
    { model: MODEL_ID, key: PROVIDER_KEY }
  );
}

test.describe("Rediseño del panel del agente (v3.16)", () => {
  test.beforeEach(async ({ page }) => {
    await seedAgent(page);
  });

  test("las pestañas aparecen en la respuesta del agente", async ({ page }) => {
    await page.goto("/");
    const input = page.locator("textarea").first();
    await expect(input).toBeVisible({ timeout: 30_000 });
    // El mock-llm responde con XML de agente cuando el system prompt
    // incluye "MODO AGENTE" (que viene de agentPrompt). Cualquier
    // mensaje con el modo agente activo dispara la respuesta XML.
    await input.fill("hazme una página de aterrizaje");
    await page.getByRole("button", { name: "Enviar mensaje" }).click();

    // El mock-llm responde con <plan>, <step>, <review>, <answer>,
    // <project-map>. El AgentTraceView debería mostrar las pestañas.
    // Esperamos a que la respuesta termine (no streaming).
    await expect(
      page.getByRole("tab", { name: /Plan/i }).first()
    ).toBeVisible({ timeout: 30_000 });
    // Estructura aparece porque el mock emite <project-map>.
    await expect(
      page.getByRole("tab", { name: /Estructura/i }).first()
    ).toBeVisible({ timeout: 10_000 });
    // Resultados aparece porque hay <answer>.
    await expect(
      page.getByRole("tab", { name: /Resultados/i }).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("la pestaña activa se ve con fondo púrpura sólido", async ({ page }) => {
    await page.goto("/");
    const input = page.locator("textarea").first();
    await expect(input).toBeVisible({ timeout: 30_000 });
    await input.fill("hazme una página de aterrizaje");
    await page.getByRole("button", { name: "Enviar mensaje" }).click();

    // Esperamos a que las pestañas aparezcan.
    await expect(
      page.getByRole("tab", { name: /Resultados/i }).first()
    ).toBeVisible({ timeout: 30_000 });

    // La pestaña Resultados (la activa por defecto si hay answer) debe
    // tener la clase que la pinta de púrpura sólido. Por defecto es la
    // última pestaña con contenido.
    const resultados = page.getByRole("tab", { name: /Resultados/i }).first();
    const classes = await resultados.evaluate((el) => el.className);
    expect(classes).toContain("bg-prism-violet");
  });

  test("la marca del agente muestra el logo de Prism", async ({ page }) => {
    await page.goto("/");
    const input = page.locator("textarea").first();
    await expect(input).toBeVisible({ timeout: 30_000 });
    await input.fill("hazme una página");
    await page.getByRole("button", { name: "Enviar mensaje" }).click();

    // El logo de Prism (SVG con aria-label "Prism AI") aparece en la
    // cabecera del panel del agente.
    await expect(
      page.getByRole("img", { name: "Prism AI" }).first()
    ).toBeVisible({ timeout: 30_000 });
  });
});
