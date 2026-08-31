import { expect, test } from "./fixtures";

/** Prism AI — El modelo que cierra sin escribir nada.
 *
 * Lo que se veía: NVIDIA NIM · moonshotai/kimi-k3, 91,5 s, la caja de
 * «Razonamiento del modelo» y debajo una burbuja **vacía**. Ni error, ni
 * aviso, ni motivo. Pasa con los modelos de razonamiento cuando se les va el
 * presupuesto de salida pensando.
 *
 * La causa en el código: una respuesta vacía se registraba como ÉXITO
 * (`settle(candidate, true, …)`), así que no había ni fallo que contar ni
 * salto al siguiente modelo. Se paraba ahí y ya.
 *
 * `mock-vacio` devuelve exactamente eso: 200 con el contenido vacío.
 */

const PROVIDER_KEY = "test-key-123";
const MODEL_ID = "mock-vacio";

async function seed(page: import("@playwright/test").Page) {
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
            systemPrompt: "Eres Prism AI (test).",
            temperature: 0.7,
            maxTokens: null,
            stream: false,
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

test("una respuesta vacía se explica en vez de dejar la burbuja en blanco", async ({ page }) => {
  await seed(page);
  await page.goto("/");

  const input = page.locator("textarea").first();
  await expect(input).toBeVisible({ timeout: 30_000 });
  await input.fill("Hazme una web sencilla");
  await page.getByRole("button", { name: "Enviar mensaje" }).click();

  // El usuario tiene que enterarse de qué pasó, no mirar un hueco.
  await expect(
    page.getByText("cerró la respuesta sin escribir nada", { exact: false }).first()
  ).toBeVisible({ timeout: 45_000 });
});
