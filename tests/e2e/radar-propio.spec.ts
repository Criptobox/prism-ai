import { expect, test } from "./fixtures";

/** Prism AI — El radar deja de poner siempre lo mismo, y te lleva a por la clave.
 *
 * Dos quejas del usuario, las dos ciertas:
 *
 *  1. «Siempre pone lo mismo». Era literal: el radar es en su mayor parte un
 *     catálogo escrito a mano, y solo la lista `:free` de OpenRouter venía de
 *     la red. Ahora también pregunta a TUS proveedores qué tienen, con tu
 *     clave — eso cambia por semanas y es distinto para cada persona.
 *  2. «Si hay un sitio con API gratis debe mandar directo a donde se
 *     consigue». El consejo de OpenRouter era texto plano, sin enlace.
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
            settings: { defaultModelKey: null, accessCode: "", agentModes: [], ahorro: false },
            providers: {
              // conectado y con clave: el radar puede preguntarle. Solo tiene
              // añadido uno de los que ofrece el mock.
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
      /* frame sin acceso */
    }
  });
}

test("el radar enseña lo gratis que TUS claves pueden usar y aún no tienes", async ({ page }) => {
  await seed(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("textarea").first()).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Radar" }).click();
  const dialogo = page.getByRole("dialog");

  await expect(dialogo.getByText("Nuevo para ti")).toBeVisible({ timeout: 20_000 });

  // El mock ofrece varios modelos gratis; el que YA tiene añadido no debe
  // salir —el radar es para descubrir— y los otros sí.
  const lista = dialogo.locator("li", { hasText: "mock-" });
  await expect(dialogo.getByText("mock-big-free", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(
    dialogo.getByText("mock-mini-free", { exact: true }),
    "el que ya tienes no se ofrece otra vez"
  ).toHaveCount(0);
  expect(await lista.count()).toBeGreaterThan(0);
});

test("cuando falta la clave, el radar manda directo a donde se consigue", async ({ page }) => {
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
            settings: { defaultModelKey: null, accessCode: "", agentModes: [], ahorro: false },
            providers: {},
            version: 1,
          },
          version: 0,
        })
      );
    } catch {
      /* frame sin acceso */
    }
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("textarea").first()).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Radar" }).click();
  const dialogo = page.getByRole("dialog");

  // Sin clave, activar una oferta tiene que ofrecer IR A POR ELLA, no solo
  // abrir Ajustes: abrir Ajustes te deja igual de bloqueado.
  const activar = dialogo.getByRole("button", { name: /^Activar / }).first();
  await expect(activar).toBeVisible({ timeout: 20_000 });
  await activar.click();

  // el aviso trae el botón; sonner lo renderiza varias veces (móvil/escritorio)
  const aviso = page.locator("[data-sonner-toast]").first();
  await expect(aviso).toBeVisible({ timeout: 15_000 });
  await expect(
    aviso.getByRole("button", { name: "Conseguir clave" }),
    "el botón principal lleva a por la clave, no a Ajustes"
  ).toBeVisible();
  // y Ajustes queda como acción secundaria, que es donde la pegarás después
  await expect(aviso.getByRole("button", { name: "Ajustes" })).toBeVisible();
});

test("las ofertas dicen cuándo se comprobaron, en vez de decirse vigentes para siempre", async ({
  page,
}) => {
  await seed(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("textarea").first()).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Radar" }).click();
  const dialogo = page.getByRole("dialog");

  // El radar es un catálogo escrito a mano: no cambia solo, y presentarlo como
  // actual para siempre es afirmar algo que no se sabe. Cada entrada dice
  // cuándo se miró — «verificado hace N días» o «sin verificar desde…».
  await expect(
    dialogo.getByText(/verificado (hoy|ayer|hace \d+ días)|sin verificar desde/).first()
  ).toBeVisible({ timeout: 20_000 });
});
