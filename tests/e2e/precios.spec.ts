import { expect, test, type Page } from "./fixtures";
import { PRECIOS } from "../../src/lib/prism/precios-datos";
import { costeDe, fmtDinero } from "../../src/lib/prism/precios";

/** Prism AI — El dinero, y la regla que lo hace posible.
 *
 *   importe = (tokens que dijo el proveedor) × (precio fechado del catálogo)
 *
 * Las dos mitades o ninguna. Aquí se comprueban las dos caras: que con las dos
 * sale un importe **exacto** —calculado aparte, no leído de la pantalla— y que
 * al lado va siempre la fuente y la fecha.
 */

/** El modelo del mock habla protocolo Anthropic y SÍ está en el catálogo. */
const MODELO = "claude-opus-5";

async function seed(page: Page) {
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
              defaultModelKey: "anthropic::claude-opus-5",
              accessCode: "",
              agentModes: [],
              agentMode: false,
              ahorro: false,
              stream: false,
              piiShield: false,
              onlyFree: false,
              systemPrompt: "Eres Prism AI.",
            },
            providers: {
              anthropic: {
                apiKey: "test-key-123",
                baseUrl: "/api/mock-llm",
                enabled: true,
                models: ["claude-opus-5"],
                useProxy: false,
              },
            },
            version: 1,
          },
          version: 0,
        })
      );
      localStorage.removeItem("prism-usage-v1");
    } catch {
      /* marco sin acceso */
    }
  });
}

async function enviar(page: Page, texto: string) {
  await expect(page.getByRole("button", { name: "Detener generación" })).toHaveCount(0, {
    timeout: 60_000,
  });
  await page.waitForTimeout(400);
  const input = page.locator("textarea").first();
  await expect(input).toBeVisible({ timeout: 30_000 });
  await input.fill(texto);
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(input).toHaveValue("", { timeout: 30_000 });
}

async function abrirPanel(page: Page) {
  const menu = page.getByRole("button", { name: /^Abrir conversaciones/ });
  if (await menu.isVisible().catch(() => false)) await menu.click();
  await page.getByRole("button", { name: "Panel", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Panel del sistema", { timeout: 20_000 });
}

/** Lo que el mock declara en `usage` de cada respuesta. Está aquí para poder
 *  calcular el importe esperado sin leerlo de la pantalla: si la prueba
 *  sacara el número de la propia pantalla no comprobaría nada. */
const USO_DEL_MOCK = { entrada: 120, salida: 45, cacheLeido: 880, cacheEscrito: 40 };

test("el importe es exactamente tokens × precio del catálogo", async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page);
  await page.goto("/");
  await enviar(page, "hazme una página web");
  await abrirPanel(page);

  // el mismo cálculo, hecho aquí a partir del catálogo empaquetado
  const esperado = costeDe(USO_DEL_MOCK, PRECIOS[MODELO]);
  expect(esperado, `«${MODELO}» tiene que estar en el catálogo`).not.toBeNull();

  // atado a SU tarjeta: mirando el diálogo entero, un importe de cualquier
  // otra zona daría la prueba por buena sin comprobar el total
  const tarjeta = page
    .getByRole("dialog")
    .locator("div.rounded-xl")
    .filter({ hasText: "Lo que llevas gastado" })
    .last();
  await expect(tarjeta).toBeVisible();
  await expect(tarjeta).toContainText(fmtDinero(esperado!.total));
});

test("todo importe lleva su fuente y su fecha al lado", async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page);
  await page.goto("/");
  await enviar(page, "hazme una página web");
  await abrirPanel(page);

  const dialogo = page.getByRole("dialog");
  // un número sin procedencia se lee como una factura, y esto no lo es
  await expect(dialogo).toContainText("LiteLLM");
  await expect(dialogo).toContainText("instantánea del");
  await expect(dialogo).toContainText("no tu factura");
});

test("dice cuánto ahorró la caché, en dinero", async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page);
  await page.goto("/");
  await enviar(page, "hazme una página web");
  await abrirPanel(page);

  const esperado = costeDe(USO_DEL_MOCK, PRECIOS[MODELO])!;
  const ahorro = esperado.sinCache - esperado.total;
  expect(ahorro, "con caché leída tiene que haber ahorro").toBeGreaterThan(0);

  const tarjeta = page
    .getByRole("dialog")
    .locator("div.rounded-xl")
    .filter({ hasText: "Lo que llevas gastado" })
    .last();
  await expect(tarjeta).toContainText("La caché del prompt te ha ahorrado");
  await expect(tarjeta).toContainText(fmtDinero(ahorro));
});

test("el encargo también lleva su importe, no solo el modelo", async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page);
  await page.goto("/");
  await enviar(page, "hazme una página web con un hero");
  await abrirPanel(page);

  const esperado = costeDe(USO_DEL_MOCK, PRECIOS[MODELO])!;
  // «página web» es el encargo clasificado; su coste es el de esa única llamada
  const bloque = page
    .getByRole("dialog")
    .locator("li")
    .filter({ hasText: "página web" })
    .first();
  await expect(bloque).toContainText(fmtDinero(esperado.total));
});
