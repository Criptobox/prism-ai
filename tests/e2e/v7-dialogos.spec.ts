import { expect, test, type Page } from "./fixtures";

/** Prism AI — Los cuatro diálogos del plan V7 se abren y se usan.
 *
 * Snippets, Plantillas, Wrapped y Presentación llegaron con unitarios de su
 * lógica pura y con CERO tests que abrieran la pantalla. La regla del
 * repositorio existe por algo concreto: un `VersionLine` que no llamaba nadie
 * estuvo semanas dentro creyéndose entregado. Aquí cada uno se abre por su
 * comando y se comprueba un dato de dentro, no que el componente exista.
 */

/** Deja la app lista: sin guía inicial y con un modelo del mock conectado. */
async function seed(page: Page, extra: Record<string, unknown> = {}) {
  await page.addInitScript((ex) => {
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
              accessCode: "",
              agentModes: [],
              agentMode: false,
              ahorro: false,
              stream: false,
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
            ...(ex as Record<string, unknown>),
            version: 1,
          },
          version: 0,
        })
      );
    } catch {
      /* marco sin acceso a localStorage */
    }
  }, extra);
}

/** Escribe un comando slash y lo elige del menú. */
async function lanzarComando(page: Page, cmd: string) {
  const compositor = page.locator("textarea").first();
  await expect(compositor).toBeVisible({ timeout: 30_000 });
  await compositor.fill(cmd);
  const opcion = page.getByRole("option").filter({ hasText: cmd }).first();
  await expect(opcion).toBeVisible({ timeout: 10_000 });
  await opcion.click();
}

test("«/snip» abre los snippets y el elegido cae en el compositor sin enviarse", async ({
  page,
}) => {
  await seed(page);
  await page.goto("/");
  await lanzarComando(page, "/snip");

  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByText("Función JS con JSDoc")).toBeVisible({ timeout: 10_000 });

  await dialogo.getByText("Función JS con JSDoc").click();

  // el snippet queda EN el compositor: la promesa del diálogo es «sin enviar nada»
  const compositor = page.locator("textarea").first();
  await expect(compositor).toHaveValue(/@returns/, { timeout: 10_000 });
  // y no se ha mandado ningún mensaje
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("«/plantillas» enseña el catálogo con el número de archivos que trae el ZIP", async ({
  page,
}) => {
  await seed(page);
  await page.goto("/");
  await lanzarComando(page, "/plantillas");

  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByText("Plantillas del Sandbox")).toBeVisible({ timeout: 10_000 });

  // el dato que se pinta es el real del ZIP (5 y 8), no una estimación:
  // el unitario lo ata al archivo, esto comprueba que llega a la pantalla
  await expect(dialogo.getByText("Web de una página")).toBeVisible();
  await expect(dialogo.getByText(/Demos · 5 archivos/)).toBeVisible();
  await expect(dialogo.getByText(/Demos · 8 archivos/)).toBeVisible();

  // el buscador del catálogo filtra de verdad
  await dialogo.getByPlaceholder(/Buscar/).fill("modular");
  await expect(dialogo.getByText("Web modular (varios archivos)")).toBeVisible();
  await expect(dialogo.getByText("Web de una página")).toHaveCount(0);
});

test("«/wrapped» resume lo medido, y dice «peor p95» porque es lo que sabe", async ({ page }) => {
  // uso sembrado a mano: dos modelos con latencias distintas
  await seed(page);
  await page.addInitScript(() => {
    const hoy = new Date().toISOString().slice(0, 10);
    try {
      localStorage.setItem(
        "prism-usage-v1",
        JSON.stringify({
          state: {
            byModel: {
              "custom::mock-mini-free": {
                requests: 8,
                ok: 8,
                fail: 0,
                totalMs: 8000,
                ms: [1000],
                charsIn: 1000,
                charsOut: 4000,
                savedChars: 200,
                // la ventana del informe filtra por `lastUsed`
                lastUsed: Date.now(),
              },
            },
            days: { [hoy]: 8 },
          },
          version: 0,
        })
      );
    } catch {
      /* ignore */
    }
  });
  await page.goto("/");
  await lanzarComando(page, "/wrapped");

  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByText("Tu Wrapped de la semana")).toBeVisible({ timeout: 10_000 });
  await expect(dialogo.getByText("medido en tu navegador")).toBeVisible();

  // las 8 peticiones sembradas salen tal cual (el subtítulo del recuadro es
  // único; «Peticiones» a secas sale dos veces en el diálogo)
  await expect(dialogo.getByText("8 OK · 0 fallos")).toBeVisible();

  // y la latencia se etiqueta «peor p95»: el p95 global NO se puede sacar de
  // agregados por modelo, y llamarlo «p95» sería dar por medido lo que no está
  await expect(dialogo.getByText(/peor p95/)).toBeVisible();
});

test("«/presentar» sin página que presentar lo dice, y con una abre las diapositivas", async ({
  page,
}) => {
  // mock-enlace-roto devuelve una página completa: sirve de material a presentar
  await seed(page, {
    settings: {
      defaultModelKey: "custom::mock-enlace-roto",
      accessCode: "",
      agentModes: [],
      agentMode: false,
      ahorro: false,
      stream: false,
    },
    providers: {
      custom: {
        apiKey: "test-key-123",
        baseUrl: "/api/mock-llm",
        enabled: true,
        models: ["mock-enlace-roto"],
        useProxy: false,
      },
    },
  });
  await page.goto("/");

  // 1. sin vista previa no hay nada que presentar, y se dice en vez de abrir vacío
  await lanzarComando(page, "/presentar");
  await expect(page.getByText("Nada que presentar todavía").first()).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // 2. se genera una página y ahora sí
  const compositor = page.locator("textarea").first();
  await compositor.fill("hazme un catálogo");
  await page.keyboard.press("Enter");
  const marco = page.frameLocator('iframe[title="Vista previa de la página generada"]');
  await expect(marco.locator("h1").first()).toBeVisible({ timeout: 45_000 });

  await lanzarComando(page, "/presentar");
  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByText(/^\d+ \/ \d+$/)).toBeVisible({ timeout: 10_000 });
});
