import { expect, test } from "@playwright/test";

/** Modo consenso: la misma petición a varios modelos a la vez y una pasada
 * final que combina lo mejor de todas.
 *
 * Lo que se comprueba es la forma del gasto, que es justo lo que decidió el
 * diseño: N llamadas en paralelo + UNA de síntesis. No un debate por rondas.
 */
async function seed(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const prov = (models: string[]) => ({
      apiKey: "test-key-123",
      baseUrl: "/api/mock-llm",
      enabled: true,
      models,
      useProxy: false,
    });
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
            consensus: true,
          },
          // dos proveedores distintos: el panel nunca repite proveedor
          providers: { custom: prov(["mock-mini-free"]), deepseek: prov(["mock-pro-free"]) },
          version: 1,
        },
        version: 0,
      })
    );
  });
}

test("pregunta a los dos a la vez y combina en UNA sola pasada", async ({ page }) => {
  await seed(page);

  const cuerpos: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/mock-llm") && r.method() === "POST") {
      cuerpos.push(r.postData() ?? "");
    }
  });

  await page.goto("/");
  const input = page.getByPlaceholder("Consenso: varios modelos responden y uno combina lo mejor…");
  await expect(input).toBeVisible({ timeout: 30_000 });
  await input.fill("Cómo centro un div");
  await input.press("Enter");

  await expect(page.locator('[data-role="assistant"]').first()).toContainText(/Prism AI|pipeline/i, {
    timeout: 30_000,
  });

  // dos del panel + una de síntesis: ni una ronda más
  expect(cuerpos).toHaveLength(3);

  // las dos del panel salen a la vez, así que el orden de llegada no es fijo:
  // lo que importa es que se preguntó a los dos modelos, no cuál contestó antes
  const panel = cuerpos.slice(0, 2).join(" ");
  expect(panel).toContain("mock-mini-free");
  expect(panel).toContain("mock-pro-free");

  // la última es la síntesis: lleva la petición original y las dos respuestas,
  // etiquetadas A y B sin decir de qué modelo es cada una
  const sintesis = cuerpos[2];
  expect(sintesis).toContain("Cómo centro un div");
  expect(sintesis).toContain('respuesta id=\\"A\\"');
  expect(sintesis).toContain('respuesta id=\\"B\\"');
  expect(sintesis).toContain("NO compares");
});

test("con un solo proveedor avisa y responde de la forma normal", async ({ page }) => {
  await page.addInitScript(() => {
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
            consensus: true,
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
  });

  await page.goto("/");
  const input = page.getByPlaceholder("Consenso: varios modelos responden y uno combina lo mejor…");
  await expect(input).toBeVisible({ timeout: 30_000 });
  await input.fill("hola");
  await input.press("Enter");

  // lo dice en vez de fallar en silencio, y contesta igual
  await expect(page.getByText(/necesita al menos dos proveedores/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-role="assistant"]').first()).toContainText(/Prism AI|pipeline/i, {
    timeout: 30_000,
  });
});
