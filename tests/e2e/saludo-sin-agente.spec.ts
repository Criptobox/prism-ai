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
