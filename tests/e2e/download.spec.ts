import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

/** La vista previa pinta el HTML, pero una respuesta puede traer un proyecto
 * entero. Antes, «descargar» bajaba solo lo pintado y el resto —styles.css,
 * app.js— se quedaba en el chat para copiarlo a mano bloque por bloque.
 *
 * Aquí se comprueba de verdad: se descarga el ZIP y se mira dentro. */

const RESPUESTA = [
  "Aquí tienes la página:",
  "",
  "**index.html**",
  "```html",
  '<!doctype html><html><head><link rel="stylesheet" href="styles.css"></head>',
  "<body><h1>Cafetería</h1><script src=\"app.js\"></script></body></html>",
  "```",
  "",
  "**styles.css**",
  "```css",
  "body { background: #111; color: #eee }",
  "```",
  "",
  "**app.js**",
  "```js",
  "console.log('listo');",
  "```",
].join("\n");

async function seed(page: import("@playwright/test").Page) {
  await page.addInitScript((respuesta) => {
    localStorage.setItem(
      "prism-ai-v1",
      JSON.stringify({
        state: {
          sessions: [
            {
              id: "s1",
              title: "Cafetería de especialidad",
              createdAt: 1,
              updatedAt: 2,
              messages: [
                { id: "u1", role: "user", content: "Hazme una página", createdAt: 1 },
                { id: "a1", role: "assistant", content: respuesta, createdAt: 2 },
              ],
            },
          ],
          activeSessionId: "s1",
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
          },
          providers: {
            custom: {
              apiKey: "k",
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
  }, RESPUESTA);
}

test("descarga el proyecto entero, no solo lo que se ve pintado", async ({ page }) => {
  await seed(page);
  await page.goto("/");

  // la vista previa se abre sola al detectar HTML en la respuesta
  const descargar = page.getByLabel("Descargar lo creado");
  await expect(descargar).toBeVisible({ timeout: 30_000 });
  await descargar.click();

  await expect(page.getByText("Esta respuesta creó 3 archivos")).toBeVisible();

  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: /Descargar todo/ }).click(),
  ]);

  // el nombre sale del título de la conversación, no de una fecha suelta
  expect(descarga.suggestedFilename()).toMatch(/^cafeteria-de-especialidad-\d{4}-\d{2}-\d{2}\.zip$/);

  const ruta = await descarga.path();
  const bytes = await readFile(ruta);
  const texto = bytes.toString("latin1");
  // los nombres viajan en claro en la cabecera de cada entrada del ZIP
  expect(texto).toContain("index.html");
  expect(texto).toContain("styles.css");
  expect(texto).toContain("app.js");
  expect(bytes.subarray(0, 2).toString()).toBe("PK");
});

test("un archivo suelto se puede bajar por su cuenta", async ({ page }) => {
  await seed(page);
  await page.goto("/");

  await page.getByLabel("Descargar lo creado").click();
  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "styles.css" }).click(),
  ]);
  expect(descarga.suggestedFilename()).toBe("styles.css");
  const contenido = await readFile(await descarga.path(), "utf8");
  expect(contenido).toContain("background: #111");
});
