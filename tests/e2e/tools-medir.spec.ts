import { expect, test, type Page } from "./fixtures";

/** Prism AI — Las tres herramientas de la v3.40, usadas de verdad.
 *
 * `run_regression` mide un antes y un después, `snapshot_diff` dice qué
 * archivos se movieron y `ask_memory` consulta el mapa del proyecto. El modelo
 * simulado `mock-mide` recorre la sesión entera —escribe una página rota, la
 * guarda, la mide, la arregla, la vuelve a medir, compara y pregunta— y al
 * final entrega el texto literal de todas las herramientas, que es lo que se
 * comprueba aquí.
 *
 * El QA móvil se comprueba a propósito: hasta la v3.39 `sandbox-runner` leía
 * `e.data.items` cuando el medidor manda `e.data.result`, así que el agente
 * NUNCA recibía una medida de QA. Con el fallo presente esta prueba lee
 * «sin comparación» donde ahora lee una comparación de verdad.
 */

const MODEL_ID = "mock-mide";

async function seed(page: Page) {
  await page.addInitScript((model: string) => {
    try {
      localStorage.setItem("prism-preview-demo", "1");
      localStorage.setItem(
        "prism-ai-v1",
        JSON.stringify({
          state: {
            sessions: [
              {
                id: "s-mide-1",
                title: "Sesión con mapa",
                createdAt: Date.now() - 600_000,
                updatedAt: Date.now() - 60_000,
                messages: [],
                // el mapa existe para que `ask_memory` tenga algo que consultar
                projectMap: {
                  name: "Cafetería Prima",
                  description: "Landing de una cafetería de especialidad",
                  files: [
                    { name: "index.html", kind: "html", summary: "portada con hero", features: [], tech: [] },
                  ],
                  features: ["hero"],
                  notes: ["el gradiente del hero se descartó por decisión del usuario"],
                  updatedAt: Date.now(),
                },
              },
            ],
            activeSessionId: "s-mide-1",
            onboardingDone: true,
            favorites: [],
            radarSeenIds: [],
            skills: [],
            settings: {
              defaultModelKey: `custom::${model}`,
              accessCode: "",
              agentModes: [],
              agentMode: true,
              // el guion de `mock-mide` son 6 rondas de herramientas
              agentMaxLoops: 8,
              ahorro: false,
              stream: false,
            },
            providers: {
              custom: {
                apiKey: "test-key-123",
                baseUrl: "/api/mock-llm",
                enabled: true,
                models: [model],
                useProxy: false,
              },
            },
            version: 1,
          },
          version: 0,
        })
      );
    } catch {
      /* frame sin acceso */
    }
  }, MODEL_ID);
}

test("el agente mide su propio cambio, compara archivos y consulta la memoria", async ({ page }) => {
  await seed(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const input = page.locator("textarea").first();
  await expect(input).toBeVisible({ timeout: 30_000 });
  await input.fill("arregla la página y mídelo");
  await page.keyboard.press("Enter");

  // El bucle son 6 rondas de herramientas, y dos de ellas ejecutan el
  // proyecto en un iframe con su espera de recogida de logs.
  // dentro de `main`: el título de la sesión en la barra lateral repite el
  // mismo texto y el localizador suelto casaba con los dos
  const burbuja = page.locator("main p", { hasText: "Esto es lo que midieron las herramientas" });
  await expect(burbuja).toBeVisible({ timeout: 120_000 });

  const texto = (await page.locator("main").innerText()).replace(/\s+/g, " ");

  // ——— run_regression, primera vez: no se inventa una comparación
  expect(texto).toContain("No había ejecución anterior");

  // ——— run_regression, segunda vez: mide el arreglo de verdad
  expect(texto).toContain("arregló");
  expect(texto).toContain("noExisteEstaFuncion");

  // ——— el QA móvil SÍ llega al agente (el fallo de sandbox-runner)
  expect(texto, "con el fallo del payload aquí ponía «QA móvil: sin comparación»").toContain(
    "QA móvil: sin cambios"
  );

  // ——— el peso del HTML se compara con su signo
  expect(texto).toMatch(/Peso del HTML: [-+]?\d+ bytes|Peso del HTML: igual/);

  // ——— snapshot_diff: el punto guardado tenía la página rota
  expect(texto).toContain("index.html");
  expect(texto).toContain("Total:");

  // ——— ask_memory: encuentra la decisión que el usuario apuntó
  expect(texto).toContain("Nota de memoria (decisión del usuario)");
  expect(texto).toContain("gradiente del hero se descartó");
});
