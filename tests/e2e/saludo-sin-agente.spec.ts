import { expect, test } from "./fixtures";

/** Prism AI — «Hola» no arranca el bucle del agente.
 *
 * Reportado con captura: en una conversación donde ya se había pedido una
 * página, escribir «Hola» devolvía el bucle entero —plan, pasos y «He
 * actualizado el archivo index.html»— sin que nadie pidiera tocar nada.
 *
 * La causa no era el modelo: con el modo agente encendido, TODOS los turnos
 * llevaban delante la plantilla («estructuras tu respuesta EXACTAMENTE con
 * estas etiquetas») y el catálogo de herramientas. Se comprueba leyendo lo que
 * VIAJA, no lo que se ve.
 */

async function sembrar(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    if (window.top !== window.self) return;
    try {
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
              defaultModelKey: "custom::mock-mini-free",
              accessCode: "",
              agentModes: [],
              // el modo agente ENCENDIDO: es el caso del informe
              agentMode: true,
              agentMaxLoops: 3,
              ahorro: false,
              stream: false,
              piiShield: false,
            },
            providers: {
              custom: {
                apiKey: "k1",
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
    } catch {
      /* marco sin acceso a localStorage */
    }
  });
}

test("«Hola» viaja sin la plantilla del agente ni las herramientas", async ({ page }) => {
  await sembrar(page);
  const cuerpos: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/api/mock-llm/")) {
      cuerpos.push(r.postData() ?? "");
    }
  });

  await page.goto("/");
  const compositor = page.locator("textarea").first();
  await expect(compositor).toBeVisible({ timeout: 30_000 });
  await compositor.fill("Hola");
  await page.keyboard.press("Enter");

  await expect.poll(() => cuerpos.filter((c) => c.includes("Hola")).length, { timeout: 30_000 })
    .toBeGreaterThan(0);

  const enviado = cuerpos.filter((c) => c.includes("Hola"))[0];
  expect(enviado, "sin la plantilla del agente").not.toContain("MODO AGENTE");
  expect(enviado, "sin el bucle de pasos").not.toContain("<step n=");
  expect(enviado, "sin catálogo de herramientas").not.toContain("write_file");
});

test("un encargo de verdad SÍ lleva el agente", async ({ page }) => {
  await sembrar(page);
  const cuerpos: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/api/mock-llm/")) {
      cuerpos.push(r.postData() ?? "");
    }
  });

  await page.goto("/");
  const compositor = page.locator("textarea").first();
  await expect(compositor).toBeVisible({ timeout: 30_000 });
  // el otro lado de la moneda: quitarle el agente a quien lo pide sería peor
  // que el fallo que se está arreglando
  await compositor.fill("arregla el botón del formulario");
  await page.keyboard.press("Enter");

  await expect.poll(() => cuerpos.filter((c) => c.includes("arregla el botón")).length, {
    timeout: 30_000,
  }).toBeGreaterThan(0);

  const enviado = cuerpos.filter((c) => c.includes("arregla el botón"))[0];
  expect(enviado, "con la plantilla del agente").toContain("MODO AGENTE");
});

/** Segundo informe con captura: «puse hola al agente y me mandó un código de
 * una página que yo le había mandado anteriormente».
 *
 * Quitar la plantilla del agente no bastaba. El MAPA DEL PROYECTO seguía
 * viajando en todos los turnos, y termina con «Al pedir cambios: entrega SOLO
 * el/los archivos que modifiques (completos)» — una orden de escribir
 * archivos. Con un «Hola» delante, el modelo la obedecía. */
async function sembrarConProyecto(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    if (window.top !== window.self) return;
    try {
      localStorage.setItem(
        "prism-ai-v1",
        JSON.stringify({
          state: {
            sessions: [
              {
                id: "s-mapa-1",
                title: "Cafetería",
                createdAt: Date.now() - 600_000,
                updatedAt: Date.now() - 60_000,
                messages: [],
                projectMap: {
                  name: "Cafetería Prima",
                  description: "Landing de una cafetería",
                  files: [
                    { name: "index.html", kind: "html", summary: "portada con hero", features: [], tech: [] },
                  ],
                  features: ["hero"],
                  notes: [],
                  updatedAt: Date.now(),
                },
              },
            ],
            activeSessionId: "s-mapa-1",
            onboardingDone: true,
            favorites: [],
            radarSeenIds: [],
            skills: [],
            settings: {
              defaultModelKey: "custom::mock-mini-free",
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
                models: ["mock-mini-free"],
                useProxy: false,
              },
            },
            version: 1,
          },
          version: 0,
        })
      );
    } catch {
      /* marco sin acceso a localStorage */
    }
  });
}

async function cuerpoDe(page: import("@playwright/test").Page, texto: string): Promise<string> {
  const cuerpos: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/api/mock-llm/")) {
      cuerpos.push(r.postData() ?? "");
    }
  });
  const compositor = page.locator("textarea").first();
  await expect(compositor).toBeVisible({ timeout: 30_000 });
  await compositor.fill(texto);
  await page.keyboard.press("Enter");
  await expect
    .poll(() => cuerpos.filter((c) => c.includes(texto)).length, { timeout: 30_000 })
    .toBeGreaterThan(0);
  return cuerpos.filter((c) => c.includes(texto))[0];
}

test("«Hola» tampoco arrastra el mapa del proyecto ni su orden de entregar archivos", async ({
  page,
}) => {
  await sembrarConProyecto(page);
  await page.goto("/");
  const enviado = await cuerpoDe(page, "Hola");
  expect(enviado, "sin el mapa del proyecto").not.toContain("MAPA DEL PROYECTO ACTUAL");
  expect(
    enviado,
    "y sobre todo sin la orden de escribir archivos, que es lo que hacía que devolviera la página"
  ).not.toContain("entrega SOLO");
  expect(enviado, "sin la ficha del proyecto").not.toContain("FICHA DEL PROYECTO");
});

test("un encargo de verdad SÍ lleva el mapa: no se le quita a quien lo necesita", async ({
  page,
}) => {
  await sembrarConProyecto(page);
  await page.goto("/");
  const enviado = await cuerpoDe(page, "cambia el color del hero a violeta");
  expect(enviado).toContain("MAPA DEL PROYECTO ACTUAL");
  expect(enviado).toContain("Cafetería Prima");
});
