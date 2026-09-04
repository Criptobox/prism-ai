import { expect, test, type Page } from "./fixtures";

/** Prism AI — La pestaña «Gasto» del Panel del sistema, y los dos daños
 *  visuales que la destaparon.
 *
 * Lo que se comprueba aquí no es que «se vea bonito»: es que el panel diga en
 * qué se te va el dinero (modelo de pago × tipo de encargo), que NO invente un
 * importe, y que el pie no se pinte encima de la tabla —que es lo que pasaba y
 * lo que hacía el panel ilegible en un móvil.
 */

const MODELO_PAGO = "mock-paid-pro";
const MODELO_GRATIS = "mock-mini-free";

async function seed(page: Page, modelo: string, extra: Record<string, unknown> = {}) {
  await page.addInitScript(
    ({ modelo, extra }: { modelo: string; extra: Record<string, unknown> }) => {
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
                defaultModelKey: `custom::${modelo}`,
                accessCode: "",
                agentModes: [],
                agentMode: false,
                ahorro: false,
                stream: false,
                piiShield: false,
                onlyFree: false,
              },
              providers: {
                custom: {
                  apiKey: "test-key-123",
                  baseUrl: "/api/mock-llm",
                  enabled: true,
                  models: [modelo],
                  useProxy: false,
                },
              },
              version: 1,
              ...extra,
            },
            version: 0,
          })
        );
        // el histórico de uso vive en su propio almacén: se limpia para que
        // una ejecución anterior no cuente como gasto de esta
        localStorage.removeItem("prism-usage-v1");
      } catch {
        /* marco sin acceso */
      }
    },
    { modelo, extra }
  );
}

async function enviar(page: Page, texto: string) {
  await expect(page.getByRole("button", { name: "Detener generación" })).toHaveCount(0, {
    timeout: 60_000,
  });
  // 350 ms: la guarda anti doble clic de `send()`
  await page.waitForTimeout(400);
  const input = page.locator("textarea").first();
  await expect(input).toBeVisible({ timeout: 30_000 });
  await input.fill(texto);
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(input).toHaveValue("", { timeout: 30_000 });
}

async function abrirPanel(page: Page) {
  // en móvil la barra lateral vive detrás del botón de conversaciones
  const menu = page.getByRole("button", { name: /^Abrir conversaciones/ });
  if (await menu.isVisible().catch(() => false)) await menu.click();
  await page.getByRole("button", { name: "Panel", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Panel del sistema", { timeout: 20_000 });
}

test("el panel dice qué modelo de pago gastó y en qué tipo de encargo", async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page, MODELO_PAGO);
  await page.goto("/");
  // «página web» es lo que clasifica el encargo: el desglose por tarea es el
  // dato nuevo, y sin él el panel solo sabría decir «3 llamadas»
  await enviar(page, "hazme una página web con un hero");

  await abrirPanel(page);
  const dialogo = page.getByRole("dialog");
  await expect(dialogo).toContainText("En qué se te va");
  await expect(dialogo).toContainText(MODELO_PAGO);
  await expect(dialogo).toContainText("página web");
  await expect(dialogo).toContainText("1 llamada");

  // …y el modelo va PEGADO al encargo, no en otra lista aparte: es el cruce
  // con el que se decide «esto lo muevo al gratis».
  const bloque = dialogo
    .locator("li")
    .filter({ hasText: "página web" })
    .filter({ has: page.locator("li", { hasText: MODELO_PAGO }) })
    .first();
  await expect(bloque).toBeVisible();
});

test("un modelo que no está en el catálogo NO recibe un precio inventado", async ({ page }) => {
  test.setTimeout(120_000);
  // «mock-paid-pro» no existe en ningún catálogo de precios del mundo. Antes
  // esta prueba decía «nunca hay importes»; ahora los hay, pero solo cuando
  // salen de tokens reales por un precio con fuente. Sin catálogo, hueco.
  await seed(page, MODELO_PAGO);
  await page.goto("/");
  await enviar(page, "hazme una página web con un hero");
  await abrirPanel(page);

  const dialogo = page.getByRole("dialog");
  await expect(dialogo).toContainText("en el catálogo de precios");
  const texto = (await dialogo.innerText()).replace(/\s+/g, " ");
  // ni un importe para este modelo: ni redondeado a cero, ni «aproximado»
  expect(texto, "sin importes inventados").not.toMatch(/\d+,\d+ \$/);
  // y los tokens estimados siguen marcados como aproximados
  expect(texto).toContain("≈");
});

test("un modelo GRATIS no aparece como gasto de pago", async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page, MODELO_GRATIS);
  await page.goto("/");
  await enviar(page, "hazme una página web con un hero");
  await abrirPanel(page);

  const dialogo = page.getByRole("dialog");
  await expect(dialogo).toContainText("No has usado ningún modelo de pago");
  await expect(dialogo).toContainText("modelo gratis");
});

test("«Cuota» ya no está fuera: vive dentro del Panel", async ({ page }) => {
  await seed(page, MODELO_PAGO);
  await page.goto("/");
  const menu = page.getByRole("button", { name: /^Abrir conversaciones/ });
  if (await menu.isVisible().catch(() => false)) await menu.click();
  // el icono suelto se fue…
  await expect(page.getByRole("button", { name: "Cuota", exact: true })).toHaveCount(0);
  // …y la pestaña sigue estando donde ahora vive
  await page.getByRole("button", { name: "Panel", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Cuota" })).toBeVisible({ timeout: 20_000 });
});

test("en móvil, el pie del panel NO se pinta encima de la tabla", async ({ page }) => {
  test.setTimeout(120_000);
  // El fallo real: dos scrolls anidados dejaban el área desplazable sin límite
  // y «Total histórico» acababa sobre las filas.
  await page.setViewportSize({ width: 360, height: 740 });
  await seed(page, MODELO_PAGO);
  await page.goto("/");
  await enviar(page, "hazme una página web con un hero");
  await abrirPanel(page);
  await page.getByRole("tab", { name: "Uso" }).click();

  const pie = page.getByText("Total histórico:");
  await expect(pie).toBeVisible();
  const viewport = page.locator('[data-slot="scroll-area-viewport"]').first();
  const cajaPie = await pie.boundingBox();
  const cajaScroll = await viewport.boundingBox();
  expect(cajaPie && cajaScroll).toBeTruthy();
  // el área que se desplaza tiene que TERMINAR antes de donde empieza el pie
  expect(cajaScroll!.y + cajaScroll!.height).toBeLessThanOrEqual(cajaPie!.y + 1);
});

test("en móvil, el pie del mensaje no se parte letra a letra", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 360, height: 740 });
  // una skill activa hace que viaje contexto y salga el chip «ctx …», que es
  // lo que reventaba la fila
  await seed(page, MODELO_PAGO, {
    skills: [
      {
        id: "s-larga",
        name: "Skill de prueba con nombre largo",
        description: "para que el chip de contexto tenga texto",
        icon: "🧪",
        instructions: "Responde siempre en español.",
        enabled: true,
      },
    ],
  });
  await page.goto("/");
  await enviar(page, "hazme una página web con un hero");

  const chip = page.getByRole("button", { name: /^ctx / });
  await expect(chip).toBeVisible({ timeout: 60_000 });
  const caja = await chip.boundingBox();
  expect(caja).toBeTruthy();
  // una sola línea: antes se partía en vertical y medía cientos de píxeles,
  // encima de los botones de la respuesta
  expect(caja!.height).toBeLessThan(32);
  expect(caja!.width).toBeLessThanOrEqual(360);
});
