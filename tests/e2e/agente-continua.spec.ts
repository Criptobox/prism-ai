import { expect, test } from "./fixtures";

/** Prism AI — El agente que se corta a mitad se retoma solo.
 *
 * El fallo que esto cubre: un modelo se quedaba sin tokens en mitad de una
 * etiqueta (`<step>` sin cerrar) y Prism lo daba por respuesta buena. No
 * salía ni el aviso ni el botón «Continuar», y el trabajo moría ahí. Es lo
 * que se veía como «el agente se detiene y no continúa».
 *
 * El modelo `mock-cortado` del mock-llm reproduce exactamente eso: la primera
 * respuesta se corta dentro del `<step>`, y solo cierra el trabajo cuando
 * recibe la instrucción de continuar.
 *
 * Se comprueba lo que ve el usuario, no que exista una función:
 *   1. Aparece la nota «Se pidió al agente continuar el trabajo» — la escribe
 *      la app sola, sin que nadie pulse nada.
 *   2. Llega la respuesta final que solo existe tras la continuación.
 *   3. La segunda petición al proveedor lleva de verdad esa instrucción.
 */

const PROVIDER_KEY = "test-key-123";
const MODEL_ID = "mock-cortado";

async function seedAgente(page: import("@playwright/test").Page) {
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

test.describe("El agente cortado a mitad se retoma solo", () => {
  test("continúa sin que el usuario pulse nada y cierra el trabajo", async ({ page }) => {
    await seedAgente(page);

    const cuerpos: { messages?: { role: string; content: unknown }[]; model?: string }[] = [];
    page.on("request", (r) => {
      if (r.method() !== "POST" || !r.url().includes("/api/mock-llm/")) return;
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
    await input.fill("Construye la estructura del documento");
    await page.getByRole("button", { name: "Enviar mensaje" }).click();

    // 1. La app escribe sola la instrucción de continuar. Es la nota
    //    discreta del centro, la misma que el botón «Continuar el agente».
    const nota = page.getByText("Se pidió al agente continuar el trabajo");
    await expect(nota.first()).toBeVisible({ timeout: 45_000 });

    // 2. Y llega el cierre, que el mock SOLO devuelve tras la continuación.
    //    Sale dos veces en la misma burbuja (línea de tiempo + panel de
    //    respuesta), de ahí el `.first()`.
    await expect(page.getByText("Trabajo retomado y terminado tras el corte.").first()).toBeVisible({
      timeout: 45_000,
    });

    // 3. UNA continuación, no una cascada: el tope existe justo para que un
    //    modelo que no sabe cerrar el bucle no se quede dando vueltas.
    await expect(nota).toHaveCount(1);

    // 4. No es solo la pantalla: la instrucción viajó al proveedor.
    const conContinuar = cuerpos.filter((c) =>
      c.messages?.some(
        (m) =>
          m.role === "user" &&
          typeof m.content === "string" &&
          m.content.startsWith("Continúa el trabajo anterior")
      )
    );
    expect(conContinuar.length, "la petición de continuar salió de verdad").toBeGreaterThan(0);
  });
});
