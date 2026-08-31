import { expect, test } from "./fixtures";

/** Prism AI — El agente prueba su propio código, también sin `tools`.
 *
 * `PLAN-V4` §3 decía: «hoy el agente escribe código y te pregunta a TI si
 * funciona». Se arregló a medias — el agente ejecuta el proyecto cuando el
 * modelo soporta `tools` y llama a `run_project`—, pero **la mayoría de los
 * modelos gratis no soportan `tools`**. Esos van por el camino XML, así que
 * el arreglo llegaba justo a los modelos para los que Prism NO existe.
 *
 * `mock-codigo-roto` entrega una página que llama a una función inexistente:
 * la consola del iframe suelta un ReferenceError de verdad. Si se le
 * devuelven los errores, entrega la arreglada.
 */

const MODEL_ID = "mock-codigo-roto";

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
              // agente encendido y el modelo NO soporta tools: camino XML,
              // que es el que no estaba cubierto
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

test("el agente ejecuta lo que entrega, ve el error y se corrige solo", async ({ page }) => {
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
  await input.fill("hazme una página");
  await page.keyboard.press("Enter");

  // 1. Prism le devuelve los errores de consola AL MODELO, sin que nadie pulse
  //    nada. La nota discreta del centro lo deja ver en el hilo.
  await expect(page.getByText("Se pidió al agente continuar el trabajo").first()).toBeVisible({
    timeout: 60_000,
  });

  // 2. Y esa petición lleva el error real que soltó el navegador.
  const conError = cuerpos.filter((c) => c.includes("He ejecutado tu código en el navegador"));
  expect(conError.length, "se le devolvieron los errores").toBeGreaterThan(0);
  expect(conError[0], "con el error tal cual, que es el dato").toContain("pintarTodo");

  // 3. Lo que importa de verdad: la página termina arreglada. Sale dos veces
  //    en la misma burbuja (línea de tiempo y panel de respuesta).
  await expect(page.getByText("Corregido tras ejecutarlo.").first()).toBeVisible({
    timeout: 60_000,
  });
});
