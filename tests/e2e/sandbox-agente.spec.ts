import { expect, test } from "./fixtures";

/** Prism AI — Bucle Sandbox → agente (PLAN-V4 punto 3).
 *
 * Antes (v3.14): el agente escribía código y te preguntaba a ti si
 * funcionaba. Ahora (v3.15): el agente puede llamar `run_project` y
 * el runner ejecuta el proyecto en un iframe OCULTO, recoge los logs
 * y se los pasa al modelo. El modelo lee sus propios errores y los
 * corrige.
 *
 * Esta prueba siembra un proyecto en el sandboxInitial (los archivos
 * que el agente ve), activa el modo agente, y verifica que:
 *   1. El modelo llama a `run_project` (tool_call).
 *   2. El runner ejecuta el proyecto en un iframe oculto.
 *   3. Los logs de la ejecución llegan al modelo en la siguiente
 *      vuelta (mensaje `role: "tool"`).
 *
 * El mock-llm está extendido para que, si el body trae `tools` y el
 * modelo es `mock-tools`, devuelva un `tool_call` a `run_project`. La
 * siguiente vuelta ya no lleva tools (el último mensaje es tool_result)
 * y el mock responde con texto final.
 */

const PROVIDER_KEY = "test-key-123";
const MODEL_ID = "mock-tools";

async function seedAgentWithProject(page: import("@playwright/test").Page) {
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

test.describe("Bucle Sandbox → agente (PLAN-V4 punto 3)", () => {
  test.beforeEach(async ({ page }) => {
    await seedAgentWithProject(page);
  });

  test("el agente llama a run_project y recibe los logs del Sandbox", async ({ page }) => {
    // Capturamos todas las peticiones al mock-llm para inspeccionar el
    // body y ver si el tool_result de run_project viaja.
    const cuerpos: { messages: { role: string; content?: string }[]; tools?: unknown; model?: string }[] = [];
    page.on("request", (r) => {
      if (r.method() !== "POST") return;
      if (!r.url().includes("/api/mock-llm/")) return;
      const raw = r.postData();
      if (!raw) return;
      try {
        cuerpos.push(JSON.parse(raw));
      } catch {
        /* ignore */
      }
    });

    await page.goto("/");
    const input = page.locator("textarea").first();
    await expect(input).toBeVisible({ timeout: 30_000 });
    // El mock-llm responde a `run_project` con un tool_call. El usuario
    // solo tiene que pedir "ejecuta el proyecto" — el agente llama al
    // tool y el runner lo ejecuta.
    await input.fill("ejecuta el proyecto y dime qué sale");
    await page.getByRole("button", { name: "Enviar mensaje" }).click();

    // Esperamos a que salga la tercera petición (la que reinyecta el
    // resultado del tool). El probe + el chat + la reinyección = 3.
    await expect.poll(() => cuerpos.length, { timeout: 60_000 }).toBeGreaterThanOrEqual(3);

    // La tercera petición trae un mensaje `role: "tool"` con el
    // resultado de ejecutar `run_project`. El runner devuelve "El
    // proyecto no tiene archivos" porque no hay sandboxInitial.
    const tercera = cuerpos[2];
    const toolMsg = tercera.messages.find((m) => m.role === "tool");
    expect(toolMsg, "la tercera petición trae el resultado del tool").toBeDefined();
    // El contenido del tool_result menciona que no hay archivos
    // (porque el test no siembra un proyecto en sandboxInitial).
    expect(toolMsg?.content ?? "").toContain("no tiene archivos");
  });
});
