import { expect, test } from "@playwright/test";
import { RADAR_NOVEDAD_IDS } from "../../src/lib/prism/free-radar";

/** Comprobar modelos antes de fiarse de ellos.
 *
 * Lo reportado: un modelo aparece como gratis y al usarlo no funciona. El mock
 * rechaza los ids que no conoce —como haría un proveedor real— así que este
 * escenario recorre el camino entero: probar, ver marcado el que no sirve y
 * quitarlo.
 */
const PROV = (models: string[]) => ({
  apiKey: "test-key-123",
  baseUrl: "/api/mock-llm",
  enabled: true,
  models,
  useProxy: false,
});

test.beforeEach(async ({ page }) => {
  // El aviso del radar salta a los 2,5 s y mantiene la pila de avisos en
  // movimiento, así que el botón del aviso propio nunca llega a estar quieto.
  // Darlo por visto lo quita de en medio: este escenario no va del radar.
  await page.addInitScript(({ prov, vistos }) => {
    localStorage.setItem(
      "prism-ai-v1",
      JSON.stringify({
        state: {
          sessions: [],
          activeSessionId: null,
          onboardingDone: true,
          favorites: [],
          radarSeenIds: vistos,
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
          providers: { custom: prov },
          version: 1,
        },
        version: 0,
      })
    );
    localStorage.setItem("prism-preview-demo", "1");
  }, { prov: PROV(["mock-mini-free", "mock-pro-free", "modelo-fantasma"]), vistos: RADAR_NOVEDAD_IDS });
});

async function abrirProveedor(page: import("@playwright/test").Page) {
  await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Ajustes").click();
  await page.getByRole("tab", { name: /claves/i }).click();
  await page.getByPlaceholder("Buscar proveedor o modelo…").fill("Personalizado");
  await page.getByText("Personalizado", { exact: true }).first().click();
}

test("marca el modelo que el proveedor no reconoce y lo quita de un clic", async ({ page }) => {
  await page.goto("/");
  await abrirProveedor(page);

  // acotado al diálogo: tras probar, el nombre sale también dentro del aviso,
  // que vive fuera, y sin acotar la búsqueda casaría con los dos
  const ajustes = page.getByRole("dialog");
  const fantasma = ajustes.getByText("modelo-fantasma", { exact: true });
  await expect(fantasma).toBeVisible();

  await page.getByRole("button", { name: /Probar modelos/i }).click();

  const aviso = page.locator("[data-sonner-toast]").filter({ hasText: "no sirve" });
  await expect(aviso).toBeVisible({ timeout: 30_000 });
  await expect(aviso).toContainText("modelo-fantasma");

  // y se ve marcado en la lista, no solo en el aviso
  await expect(fantasma.locator("xpath=ancestor::span[1]")).toHaveCSS(
    "text-decoration-line",
    "line-through"
  );

  /* La acción vive DENTRO del diálogo, no en el aviso: el aviso se pinta fuera
   * y su clic cerraba Ajustes sin llegar a aplicar nada. */
  await ajustes.getByRole("button", { name: "Quitar los que fallan" }).click();

  await expect(ajustes.getByText("modelo-fantasma", { exact: true })).toHaveCount(0);
  // los buenos siguen ahí: no se lleva por delante la lista entera
  await expect(ajustes.getByText("mock-mini-free", { exact: true }).first()).toBeVisible();
  // y Ajustes sigue abierto, que es justo lo que fallaba
  await expect(ajustes).toBeVisible();
});

test("cuando todos responden no propone quitar nada", async ({ page }) => {
  await page.addInitScript((prov) => {
    const raw = JSON.parse(localStorage.getItem("prism-ai-v1") || "{}");
    raw.state.providers.custom = prov;
    localStorage.setItem("prism-ai-v1", JSON.stringify(raw));
  }, PROV(["mock-mini-free", "mock-pro-free"]));

  await page.goto("/");
  await abrirProveedor(page);
  await page.getByRole("button", { name: /Probar modelos/i }).click();

  await expect(page.getByText("2 de 2 responden")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Quitarlos" })).toHaveCount(0);
});
