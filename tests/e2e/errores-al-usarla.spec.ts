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

  // Se espera a que el barrido automático TERMINE antes de usarla. No es
  // cortesía con el test: mientras el barrido corre, el marco de la vista
  // previa se está montando y desmontando, y un clic que caiga justo ahí se
  // pierde con el marco que lo recibió. Es lo mismo que hace una persona:
  // esperar a que la página deje de moverse. El aviso del barrido es la
  // señal de que ya paró.
  await expect(page.getByText("El agente probó su código")).toBeVisible({ timeout: 45_000 });

  // Ahora la usas tú.
  await marco.getByText("Ver más").click();

  // 1. El aviso sale y dice POR DÓNDE fue, que es lo que le falta a un stack
  //    trace suelto.
  await expect(page.getByText('Error al pulsar «Ver más»')).toBeVisible({ timeout: 15_000 });

  // 2. «Arreglar» se lo manda al modelo con el error y el gesto.
  //
  // Se pulsa reintentando, y hay motivo: el aviso aparece mientras la app
  // todavía se está asentando (el barrido acaba de terminar y la respuesta
  // acaba de cerrarse), y en ese hueco React llega a sustituir el nodo del
  // botón entre que Playwright lo localiza y suelta el clic. El clic se va
  // con el nodo viejo: no falla, simplemente no llama a nadie. Comprobado
  // instrumentando el `onClick` — con la app quieta entra siempre.
  //
  // Lo que se comprueba sigue siendo lo mismo: que pulsar «Arreglar» manda
  // al modelo el error y el gesto. Si eso está roto, los tres intentos se
  // agotan y el test cae igual.
  const arreglar = page.getByRole("button", { name: "Arreglar" });
  const mandado = () => cuerpos.filter((c) => c.includes("He estado usando la página que hiciste"));
  for (let intento = 0; intento < 3 && mandado().length === 0; intento++) {
    if (await arreglar.isVisible()) await arreglar.click();
    await page.waitForTimeout(1000);
  }
  await expect.poll(() => mandado().length, { timeout: 30_000 }).toBeGreaterThan(0);
  const enviado = mandado()[0];
  expect(enviado, "con el error tal cual").toContain("mostrarMas");
  expect(enviado, "y por dónde se llegó").toContain("Ver más");

  // 3. Y queda arreglado.
  await expect(page.getByText("Enlace arreglado tras usarla.").first()).toBeVisible({
    timeout: 45_000,
  });
});
