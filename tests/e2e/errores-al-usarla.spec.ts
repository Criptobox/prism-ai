import { expect, test } from "./fixtures";

/** Prism AI — Los fallos que salen cuando TÚ usas la página.
 *
 * El barrido automático (v3.29) pulsa botones a ciegas, en el orden del DOM y
 * sin escribir en los campos. Le faltan tres cosas que solo aporta el uso
 * real: tu orden, tus datos y los enlaces que tú eliges — un `<a>` no se pulsa
 * a ciegas porque puede navegar fuera y dejar la prueba sin página.
 *
 * Y hasta ahora eso no se recogía: la vista previa en vivo no llevaba el
 * puente de consola, así que el error moría dentro del iframe.
 *
 * `mock-enlace-roto` esconde el fallo detrás de un enlace. El barrido no lo
 * ve; usándola, sí.
 */

const MODEL_ID = "mock-enlace-roto";

async function seed(page: import("@playwright/test").Page) {
  await page.addInitScript((model: string) => {
    try {
      localStorage.setItem("prism-preview-demo", "1");
      localStorage.setItem(
        "prism-ai-v1",
        JSON.stringify({
          state: {
            sessions: [],
            activeSessionId: null,
            onboardingDone: true,
            favorites: [],
            radarSeenIds: [],
            skills: [],
            settings: {
              defaultModelKey: `custom::${model}`,
              accessCode: "",
              agentModes: [],
              agentMode: true,
              agentMaxLoops: 3,
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

test("un fallo que solo sale usándola se detecta, dice DÓNDE, y se arregla", async ({ page }) => {
  await seed(page);
  await page.setViewportSize({ width: 1440, height: 900 });

  const cuerpos: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/api/mock-llm/")) {
      cuerpos.push(r.postData() ?? "");
    }
  });

  await page.goto("/");
  const input = page.locator("textarea").first();
  await expect(input).toBeVisible({ timeout: 30_000 });
  await input.fill("hazme un catálogo");
  await page.keyboard.press("Enter");

  const marco = page.frameLocator('iframe[title="Vista previa de la página generada"]');
  await expect(marco.locator("h1")).toHaveText("Catálogo", { timeout: 45_000 });

  // Nadie ha avisado de nada todavía: la página carga limpia y el barrido
  // automático no pulsa enlaces.
  await expect(page.getByText(/Error al pulsar/)).toHaveCount(0);

  // Ahora la usas tú.
  await marco.getByText("Ver más").click();

  // 1. El aviso sale y dice POR DÓNDE fue, que es lo que le falta a un stack
  //    trace suelto.
  await expect(page.getByText('Error al pulsar «Ver más»')).toBeVisible({ timeout: 15_000 });

  // 2. «Arreglar» se lo manda al modelo con el error y el gesto.
  await page.getByRole("button", { name: "Arreglar" }).click();
  await expect
    .poll(
      () => cuerpos.filter((c) => c.includes("He estado usando la página que hiciste")).length,
      { timeout: 30_000 }
    )
    .toBeGreaterThan(0);
  const enviado = cuerpos.filter((c) => c.includes("He estado usando la página que hiciste"))[0];
  expect(enviado, "con el error tal cual").toContain("mostrarMas");
  expect(enviado, "y por dónde se llegó").toContain("Ver más");

  // 3. Y queda arreglado.
  await expect(page.getByText("Enlace arreglado tras usarla.").first()).toBeVisible({
    timeout: 45_000,
  });
});
