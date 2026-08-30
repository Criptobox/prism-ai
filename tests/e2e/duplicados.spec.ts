import { expect, test, type Page } from "@playwright/test";

/** Prism AI — cada control de la aplicación, en un solo sitio.
 *
 * En el escritorio la barra lateral está siempre a la vista, y su pie ya lleva
 * Ajustes, instalar, tema y Arena. La cabecera repetía los cuatro: la misma
 * fila de iconos dos veces en la misma pantalla, y dos de ellos con el mismo
 * dibujo de flecha hacia abajo queriendo decir cosas distintas (exportar la
 * conversación / instalar la app).
 *
 * Aquí se cuenta. La cabecera se queda con lo que es de la conversación
 * abierta; lo de la aplicación vive en el pie de la barra lateral.
 */
async function seed(page: Page) {
  await page.addInitScript(() => {
    if (window.top !== window.self) return;
    try {
      if (localStorage.getItem("prism-ai-v1")) return;
      localStorage.setItem(
        "prism-ai-v1",
        JSON.stringify({
          state: {
            sessions: [],
            activeSessionId: null,
            onboardingDone: true,
            favorites: [],
            radarSeenIds: [],
            settings: { defaultModelKey: "custom::mock-mini-free", accessCode: "" },
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
      localStorage.setItem("prism-preview-demo", "1");
    } catch {}
  });
}

/** Solo cuenta lo que se ve: lo oculto con `display:none` no está en el árbol
 *  de accesibilidad, que es exactamente el criterio que nos interesa. */
const CHROME = [
  { nombre: "Ajustes", re: /^Ajustes$/ },
  { nombre: "instalar", re: /instalar Prism AI/i },
];

test("en el escritorio no hay dos veces el mismo control", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);
  await page.goto("/");
  await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible({ timeout: 30_000 });

  for (const c of CHROME) {
    const n = await page.getByRole("button", { name: c.re }).count();
    expect(n, `botones de ${c.nombre} visibles`).toBe(1);
  }

  // y el único que queda está en la barra lateral, no en la cabecera
  const cabecera = page.locator("header").first();
  for (const c of CHROME) {
    expect(await cabecera.getByRole("button", { name: c.re }).count(), `${c.nombre} en la cabecera`).toBe(0);
  }
  expect(await cabecera.getByRole("button", { name: /Arena/i }).count(), "Arena en la cabecera").toBe(0);
});

/** El tema tuvo dos mandos a la vez: el icono que rotaba entre claro y oscuro,
 *  y —un palmo más abajo— la tira de Claro/Oscuro/Sistema. Los dos en el mismo
 *  pie, haciendo lo mismo. Se quedó la tira, que dice cuál está puesto y llega
 *  a cualquiera de los tres de un clic. */
test("el tema se cambia desde un solo sitio", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);
  await page.goto("/");
  await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible({ timeout: 30_000 });

  // son «radio» dentro de un «radiogroup», que es lo correcto para elegir
  // una de tres: el lector de pantalla anuncia cuál está marcada
  const tira = page.locator("aside").getByRole("radiogroup", { name: "Tema de la aplicación" });
  await expect(tira).toHaveCount(1);
  for (const t of ["Claro", "Oscuro", "Sistema"]) {
    await expect(tira.getByRole("radio", { name: t })).toHaveCount(1);
  }
  // y ni rastro del icono que hacía lo mismo
  expect(
    await page.getByRole("button", { name: /^(Cambiar tema|Tema: )/ }).count(),
    "el mando viejo del tema"
  ).toBe(0);
});

test("en el móvil Ajustes sigue estando en la cabecera", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await seed(page);
  await page.goto("/");
  await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible({ timeout: 30_000 });

  // con la barra lateral escondida detrás del menú, la cabecera es el único
  // camino a Ajustes: quitarlo aquí dejaría las claves sin puerta
  const cabecera = page.locator("header").first();
  await expect(cabecera.getByRole("button", { name: "Ajustes" })).toBeVisible();
  expect(await page.getByRole("button", { name: "Ajustes" }).count()).toBe(1);
});

/** El radar ya no avisa con nada flotante, ni en el escritorio ni en el móvil.
 *  Su única señal es la insignia numérica: en pantalla grande sobre el botón
 *  del pie de la barra lateral, y en el móvil sobre el botón del menú, que es
 *  lo único visible con la barra escondida. */
const AVISO = /Radar de gratis/;

test("el radar no interrumpe: solo la insignia, en el escritorio", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);
  await page.goto("/");
  await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible({ timeout: 30_000 });

  await expect(page.getByRole("button", { name: /Radar/ })).toBeVisible();
  await page.waitForTimeout(5_000);
  await expect(page.getByText(AVISO)).toHaveCount(0);
});

test("en el móvil la insignia va sobre el botón del menú, con su número", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await seed(page);
  await page.goto("/");
  await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible({ timeout: 30_000 });

  // sin barra lateral a la vista, el número tiene que estar en el menú
  const menu = page.getByRole("button", { name: /Abrir conversaciones/ });
  await expect(menu).toBeVisible();
  await expect(menu, "el botón dice cuántas novedades hay").toHaveAccessibleName(
    /\d+ novedades en el Radar/
  );
  // y nada flotante, tampoco aquí
  await page.waitForTimeout(5_000);
  await expect(page.getByText(AVISO)).toHaveCount(0);
});
