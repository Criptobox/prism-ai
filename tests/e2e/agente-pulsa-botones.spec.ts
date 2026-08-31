import { expect, test } from "./fixtures";

/** Prism AI — El agente pulsa los botones de lo que entrega.
 *
 * La revisión de la v3.28.0 solo cazaba lo que revienta **al cargar**. Pero en
 * una página generada la mayoría de los fallos viven detrás de un clic: el
 * manejador que llama a una función que no existe, el id que se renombró.
 *
 * `mock-boton-roto` entrega una página que **carga perfectamente** y cuyo
 * botón llama a `sumarTotal()`, que no existe. Sin pulsarlo, la revisión
 * anterior lo daba por bueno.
 */

const MODEL_ID = "mock-boton-roto";

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

test("un botón que revienta SOLO al pulsarlo se detecta y se corrige", async ({ page }) => {
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
  await input.fill("hazme una página con un botón");
  await page.keyboard.press("Enter");

  // 1. Prism pulsa el botón y le devuelve el fallo al modelo, sin que nadie
  //    toque nada. La página cargaba limpia: sin pulsar no había señal.
  await expect(page.getByText("Se pidió al agente continuar el trabajo").first()).toBeVisible({
    timeout: 60_000,
  });
  const conBotones = cuerpos.filter((c) => c.includes("He pulsado los botones de tu página"));
  expect(conBotones.length, "se le devolvieron los botones que fallan").toBeGreaterThan(0);
  expect(conBotones[0], "nombrando el botón").toContain("Sumar");
  expect(conBotones[0], "con el error tal cual").toContain("sumarTotal");

  // 2. Y termina arreglado.
  await expect(page.getByText("Botón arreglado tras pulsarlo.").first()).toBeVisible({
    timeout: 60_000,
  });
});
