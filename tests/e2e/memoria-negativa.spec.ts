import { expect, test, type Page } from "./fixtures";

/** Prism AI — «No tocar»: una regla que se hace cumplir, no una nota.
 *
 * El mapa del proyecto ya guardaba notas y el modelo las leía. Pero una nota
 * es una sugerencia: el agente la entiende y aun así reescribe el archivo que
 * le pediste que no tocara, y cuando pasa has perdido trabajo.
 *
 * Aquí se comprueba lo único que hace de esto una regla: que el intento de
 * escritura acabe RECHAZADO. El modelo simulado `mock-toca-header` intenta
 * escribir en el archivo protegido pase lo que pase, así que es exactamente el
 * caso: el agente lo intenta y el runner lo para.
 */

const MODEL_ID = "mock-toca-header";

async function seed(page: Page, conRegla: boolean) {
  await page.addInitScript(
    ({ model, conRegla }: { model: string; conRegla: boolean }) => {
      if (window.top !== window.self) return;
      try {
        localStorage.setItem("prism-preview-demo", "1");
        localStorage.setItem(
          "prism-ai-v1",
          JSON.stringify({
            state: {
              sessions: [
                {
                  id: "s-neg-1",
                  title: "Proyecto con reglas",
                  createdAt: Date.now() - 600_000,
                  updatedAt: Date.now() - 60_000,
                  // Con mensajes: el botón del mapa vive en el panel de vista
                  // previa, y ese panel solo existe si hay una página que
                  // previsualizar (mismo montaje que map.spec.ts).
                  messages: [
                    { id: "m1", role: "user", content: "hazme una web", createdAt: Date.now() - 600_000 },
                    {
                      id: "m2",
                      role: "assistant",
                      content:
                        "Aquí la tienes:\n\n```html\n<!doctype html><html><head><title>Web</title></head><body><h1>Web</h1></body></html>\n```",
                      createdAt: Date.now() - 120_000,
                    },
                  ],
                  projectMap: {
                    name: "Web",
                    description: "una web",
                    files: [{ name: "Header.tsx", kind: "js", summary: "cabecera", features: [], tech: [] }],
                    features: [],
                    notes: [],
                    updatedAt: Date.now(),
                  },
                  ...(conRegla
                    ? {
                        reglasNo: [
                          {
                            id: "r1",
                            patron: "Header.tsx",
                            motivo: "el diseño lo aprobó el cliente",
                            creadaEl: Date.now(),
                          },
                        ],
                      }
                    : {}),
                },
              ],
              activeSessionId: "s-neg-1",
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
                piiShield: false,
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
        /* marco sin acceso */
      }
    },
    { model: MODEL_ID, conRegla }
  );
}

async function pedir(page: Page, texto: string): Promise<string[]> {
  const cuerpos: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/api/mock-llm/")) {
      cuerpos.push(r.postData() ?? "");
    }
  });
  const input = page.locator("textarea").first();
  await expect(input).toBeVisible({ timeout: 30_000 });
  await input.fill(texto);
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  return cuerpos;
}

test("con la regla puesta, el agente NO puede escribir el archivo", async ({ page }) => {
  await seed(page, true);
  await page.goto("/");
  await pedir(page, "cambia la cabecera");

  const main = page.locator("main");
  await expect(main).toContainText("Lo que me contestó la herramienta", { timeout: 60_000 });
  // el bloqueo, con las palabras del usuario
  await expect(main).toContainText("BLOQUEADO");
  await expect(main).toContainText("el diseño lo aprobó el cliente");
  // y el archivo NO se escribió
  await expect(main).not.toContainText("Archivo «src/Header.tsx» escrito");
});

test("sin la regla, el mismo agente escribe sin problema", async ({ page }) => {
  // El otro lado de la moneda: si bloqueara siempre, no estaría probando nada.
  await seed(page, false);
  await page.goto("/");
  await pedir(page, "cambia la cabecera");

  const main = page.locator("main");
  await expect(main).toContainText("Lo que me contestó la herramienta", { timeout: 60_000 });
  await expect(main).toContainText("escrito");
  await expect(main).not.toContainText("BLOQUEADO");
});

test("la regla viaja en el prompt: el modelo se entera antes de intentarlo", async ({ page }) => {
  await seed(page, true);
  await page.goto("/");
  const cuerpos = await pedir(page, "cambia la cabecera");
  await expect
    .poll(() => cuerpos.filter((c) => c.includes("cambia la cabecera")).length, { timeout: 60_000 })
    .toBeGreaterThan(0);
  const enviado = cuerpos.filter((c) => c.includes("cambia la cabecera"))[0];
  expect(enviado).toContain("NO TOCAR");
  expect(enviado).toContain("el diseño lo aprob");
});

test("se puede crear una regla desde el mapa, y avisa a qué afecta", async ({ page }) => {
  await seed(page, false);
  await page.goto("/");
  await expect(page.locator("textarea").first()).toBeVisible({ timeout: 30_000 });

  // el mapa se abre desde su propio botón (igual que en map.spec.ts)
  await page.getByRole("button", { name: "Mapa del proyecto" }).first().click();
  // el mapa abre en el grafo; las reglas y las notas viven en la vista lista
  await page.getByRole("button", { name: "Vista lista" }).click();
  const patron = page.getByLabel("Archivo o patrón que no se puede tocar");
  await expect(patron).toBeVisible({ timeout: 20_000 });

  await patron.fill("noexiste-en-el-proyecto.ts");
  // una regla que no casa con nada suele ser una errata, y hay que decirlo
  await expect(page.getByText(/no casa con ningún archivo|no se puede comprobar/)).toBeVisible();

  await patron.fill("Header.tsx");
  await page.getByLabel("Motivo de la regla").fill("lo aprobó el cliente");
  await page.getByRole("button", { name: "Proteger" }).click();

  await expect(page.getByText("lo aprobó el cliente")).toBeVisible();
});
