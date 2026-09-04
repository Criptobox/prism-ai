import { expect, test } from "./fixtures";

/** Prism AI — Tarea 3 del plan V6: panel unificado.
 *
 * Uso, Cuota y Arena existían, cada uno en su diálogo. Aquí se reúnen en un
 * panel con pestañas montando los mismos componentes (sin reescribirlos), más
 * una fila de cabecera con lo que no se veía en ninguna parte: cuántos modelos
 * están en enfriamiento — la respuesta a «¿por qué no está usando el modelo
 * que elegí?».
 *
 * El E2E pasa por las TRES pestañas y comprueba un dato real en cada una, con
 * una conversación de verdad detrás (el registro de uso no se siembra: sale de
 * enviar un mensaje al mock).
 */

async function seed(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
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
              defaultModelKey: "custom::mock-mini-free",
              systemPrompt: "",
              temperature: 0.7,
              maxTokens: null,
              stream: true,
              contextWindow: 10,
              sendKeyOnProxy: true,
              onlyFree: false,
              agentMode: false,
              agentMaxLoops: 3,
              accessCode: "",
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
      // un 429 de verdad deja esto en health.ts: cooldown un minuto. El chip de
      // enfriamientos es EL dato que no se veía en ningún sitio
      localStorage.setItem(
        "prism-health-v1",
        JSON.stringify({
          state: {
            entries: {
              // OTRO modelo, no el de la conversación: recordSuccess borra el
              // enfriamiento del modelo que acaba de responder bien
              "custom::mock-big-free": {
                until: Date.now() + 60_000,
                consecutive: 1,
                lastStatus: 429,
                reason: "límite de peticiones",
              },
            },
            providerEntries: {},
            lastGood: null,
          },
          version: 0,
        })
      );
    } catch {
      /* frame sin acceso */
    }
  });
}

test("el panel del sistema reúne uso, cuota y arena con la salud en la cabecera", async ({
  page,
}) => {
  await seed(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const input = page.locator("textarea").first();
  await expect(input).toBeVisible({ timeout: 30_000 });

  // una conversación de verdad: el dato de «Uso» sale de aquí, no de un seed.
  // (se espera la RESPUESTA, no el chip del compositor, que enseña el nombre
  // del modelo antes de enviar nada y deja pasar el test sin conversación)
  await input.fill("Hola, ¿qué es un closure?");
  await input.press("Enter");
  await expect(page.locator("main").getByText("funcionando con tu API")).toBeVisible({ timeout: 30_000 });

  // el panel nuevo de la barra lateral, primero en «Modelos»
  await page.getByRole("button", { name: "Panel", exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: /Panel del sistema/ });

  // ——— cabecera: el modelo activo y los enfriamientos ———
  await expect(dialogo.getByText(/1 modelo en enfriamiento/)).toBeVisible();
  await expect(dialogo.getByText(/sin fallos en esta sesión/)).toBeVisible();

  // ——— pestaña Uso: la fila de la petición real ———
  // Ya no es la activa por defecto: desde la v3.48 abre «Gasto», que con una
  // clave de pago conectada es la primera pregunta.
  await dialogo.getByRole("tab", { name: /uso/i }).click();
  const filaUso = dialogo.locator("table tbody tr").filter({ hasText: "mock-mini-free" });
  await expect(filaUso).toBeVisible({ timeout: 10_000 });

  // ——— pestaña Cuota: el estado honesto del proveedor conectado ———
  await dialogo.getByRole("tab", { name: /cuota/i }).click();
  const panelCuota = dialogo.getByRole("tabpanel");
  await expect(panelCuota.getByText("Personalizado").first()).toBeVisible();
  // «sin dato», no un porcentaje inventado: el chip del proveedor sin reporte
  await expect(panelCuota.getByText("sin dato", { exact: true }).first()).toBeVisible();

  // ——— pestaña Arena: con un solo modelo gratis no hay carrera ———
  await dialogo.getByRole("tab", { name: /arena/i }).click();
  await expect(dialogo.getByText("Necesitas al menos 2 modelos gratis conectados")).toBeVisible();
});
