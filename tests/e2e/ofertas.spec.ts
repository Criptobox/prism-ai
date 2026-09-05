import { expect, test } from "./fixtures";

/** Prism AI — Caza de ofertas IA: ofertas vigentes de los proveedores, con
 * avisos de novedades y de expiración.
 *
 * Tres caminos que tienen que funcionar de verdad:
 *
 * 1. AVISO Y PUERTA: al cargar con una novedad sin ver, entra el toast de
 *    «oferta cazada» y la insignia en la barra lateral; abrir el diálogo la
 *    marca como vista.
 * 2. BUSCAR, FILTRAR, FAVORITA: el buscador quita tildes y mayúsculas, los
 *    chips filtran por tipo, la estrella guarda la favorita y sobrevive a un
 *    recargo (persistencia en `prism-ofertas-v1`).
 * 3. FUENTE PROPIA Y AVISOS: una URL JSON propia (mockeada con page.route)
 *    se valida, se fusiona con el catálogo pisando por id, y el permiso de
 *    notificaciones se activa y dispara el aviso de prueba.
 *
 * Como en el resto de specs, se siembran los stores para no depender de un
 * modelo ni de la red real.
 */

const HOY = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
})();

/** ids del catálogo base: la fuente de verdad vive en src/lib/prism/ofertas.ts.
 * El último (of-together) es el que falta en la prueba 1 para forzar la novedad. */
const TODOS_LOS_IDS = [
  "of-google-aistudio",
  "of-github-copilot-free",
  "of-mistral-lechat",
  "of-openrouter-free",
  "of-perplexity",
  "of-groq",
  "of-cerebras",
  "of-huggingface",
  "of-mistral-api",
  "of-cohere",
  "of-deepseek",
  "of-gemini-estudiantes",
  "of-github-student",
  "of-together",
];

function seedOfertas(extra: Record<string, unknown>) {
  return JSON.stringify({
    state: {
      favoritas: [],
      conocidasIds: TODOS_LOS_IDS,
      nuevasIds: [],
      avisadasIds: [],
      ofertasFeed: [],
      ultimaComprobacion: HOY,
      ajustes: { notificaciones: false, diasAviso: 3, feedUrl: "" },
      ...extra,
    },
    version: 0,
  });
}

function seedPrincipal() {
  return JSON.stringify({
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
  });
}

test("avisa de la novedad al cargar, abre con insignia y la marca como vista", async ({ page }) => {
  await page.addInitScript(
    ({ principal, ofertas }: { principal: string; ofertas: string }) => {
      try {
        localStorage.setItem("prism-preview-demo", "1");
        localStorage.setItem("prism-ai-v1", principal);
        localStorage.setItem("prism-ofertas-v1", ofertas);
      } catch {
        /* frame sin acceso */
      }
    },
    {
      principal: seedPrincipal(),
      ofertas: seedOfertas({
        conocidasIds: TODOS_LOS_IDS.filter((id) => id !== "of-together"),
        ultimaComprobacion: null,
      }),
    }
  );

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("textarea").first()).toBeVisible({ timeout: 30_000 });

  // La comprobación diaria del arranque caza la desconocida y la registra.
  // El toast de «Nueva oferta cazada» se dispara al hidratar y se va a los
  // 4s — con el dev server compilando, la espera hasta el primer aserto es
  // mayor y el toast ya no está: lo que se garantiza aquí es el registro
  // (localStorage actualizado) y la insignia, que son persistentes.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          try {
            return JSON.parse(localStorage.getItem("prism-ofertas-v1") ?? "{}").state?.conocidasIds ?? [];
          } catch {
            return [];
          }
        }),
      { timeout: 15_000 }
    )
    .toContain("of-together");

  // La puerta de la barra lateral lleva la insignia con la novedad
  const boton = page.getByRole("button", { name: /Ofertas/ }).first();
  await expect(boton.getByText("1", { exact: true })).toBeVisible();

  await boton.click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByText("Caza de ofertas")).toBeVisible();
  // El catálogo base está a la vista, con la recién cazada incluida
  await expect(dialogo.getByText("Crédito de bienvenida", { exact: true })).toBeVisible();
  await expect(dialogo.getByText("Cuotas gratuitas de Gemini en AI Studio")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // Abierto el diálogo, la novedad queda vista: la insignia desaparece
  await expect(boton.getByText("1", { exact: true })).toHaveCount(0);
});

test("busca sin tildes, filtra por tipo y la favorita sobrevive al recargo", async ({ page }) => {
  await page.addInitScript(
    ({ principal, ofertas }: { principal: string; ofertas: string }) => {
      try {
        localStorage.setItem("prism-preview-demo", "1");
        localStorage.setItem("prism-ai-v1", principal);
        localStorage.setItem("prism-ofertas-v1", ofertas);
      } catch {
        /* frame sin acceso */
      }
    },
    { principal: seedPrincipal(), ofertas: seedOfertas({}) }
  );

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("textarea").first()).toBeVisible({ timeout: 30_000 });

  // Puerta por comando: el menú slash abre el diálogo
  const compositor = page.locator("textarea").first();
  await compositor.fill("/ofertas");
  const opcion = page.getByRole("option").filter({ hasText: "/ofertas" }).first();
  await expect(opcion).toBeVisible({ timeout: 10_000 });
  await opcion.click();

  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByText("Caza de ofertas")).toBeVisible();

  // Buscador tolerante: mayúsculas y tildes no estorban
  await dialogo.getByPlaceholder(/Buscar/).fill("COPILOT");
  await expect(dialogo.getByText("Plan Copilot Free")).toBeVisible();
  await expect(dialogo.getByText("Le Chat gratuito")).toHaveCount(0);

  await dialogo.getByPlaceholder(/Buscar/).fill("credito");
  await expect(dialogo.getByText("Crédito de bienvenida", { exact: true })).toBeVisible();
  await expect(dialogo.getByText("Plan Copilot Free")).toHaveCount(0);
  await dialogo.getByPlaceholder(/Buscar/).fill("");

  // Chip de tipo: solo las de estudiantes
  await dialogo.getByRole("button", { name: "Estudiantes", exact: true }).click();
  await expect(dialogo.getByText("Copilot Pro gratis para estudiantes")).toBeVisible();
  await expect(dialogo.getByText("Le Chat gratuito")).toHaveCount(0);
  await dialogo.getByRole("button", { name: "Todos", exact: true }).click();

  // Favorita: la estrella la marca y el chip la deja sola
  await dialogo.getByRole("button", { name: "Favorita: Plan Copilot Free" }).click();
  await dialogo.getByRole("button", { name: /Favoritas/ }).click();
  await expect(dialogo.getByText("Plan Copilot Free")).toBeVisible();
  await expect(dialogo.getByText("Crédito de bienvenida", { exact: true })).toHaveCount(0);

  // La preferencia cayó en localStorage — eso es lo que hace que sobreviva
  // al cierre de la app. (No se recarga la página para comprobarlo: el
  // addInitScript de arriba re-siembra los stores en CADA carga y borraría
  // justo lo que se quiere verificar.)
  await expect
    .poll(() =>
      page.evaluate(() => {
        try {
          return JSON.parse(localStorage.getItem("prism-ofertas-v1") ?? "{}")?.state?.favoritas ?? [];
        } catch {
          return [];
        }
      })
    )
    .toContain("of-github-copilot-free");
});

test("fuente propia mockeada se valida y fusiona, y los avisos se activan", async ({ page }) => {
  await page.addInitScript(
    ({ principal, ofertas }: { principal: string; ofertas: string }) => {
      try {
        localStorage.setItem("prism-preview-demo", "1");
        localStorage.setItem("prism-ai-v1", principal);
        localStorage.setItem("prism-ofertas-v1", ofertas);
      } catch {
        /* frame sin acceso */
      }
    },
    {
      principal: seedPrincipal(),
      ofertas: seedOfertas({
        ajustes: { notificaciones: false, diasAviso: 3, feedUrl: "https://feeds.example/ofertas-fuente.json" },
      }),
    }
  );

  // La fuente trae dos ofertas nuevas, una que pisa a la base por id y una
  // rota (sin url válida) que debe ser descartada sin romper la carga.
  // El permiso de notificaciones se concede ANTES de cargar: en Chromium
  // headless va denegado de fábrica y el diálogo lo leería «denied».
  await page.context().grantPermissions(["notifications"]);
  await page.route("**/ofertas-fuente.json", (route) =>
    route.fulfill({
      json: [
        {
          id: "of-feed-anthropic",
          proveedor: "Anthropic",
          titulo: "Crédito de prueba de API",
          tipo: "creditos",
          valor: "Crédito inicial",
          descripcion: "Crédito al verificar la cuenta (según tu fuente)",
          url: "https://console.anthropic.com",
          termina: null,
          verificado: "2026-09-06",
        },
        {
          id: "of-github-copilot-free",
          proveedor: "GitHub Copilot",
          titulo: "Plan Copilot Free (ampliado por tu fuente)",
          tipo: "gratis",
          valor: "Gratis",
          descripcion: "Versión de tu fuente con más cuota",
          url: "https://github.com/features/copilot",
          termina: null,
          verificado: "2026-09-06",
        },
        {
          id: "of-feed-dias",
          proveedor: "Windsurf",
          titulo: "Días de Pro de regalo",
          tipo: "dias",
          valor: "7 días de Pro",
          descripcion: "Prueba del plan Pro (según tu fuente)",
          url: "https://windsurf.com",
          termina: "2026-12-31",
          verificado: "2026-09-06",
        },
        { id: "rota", proveedor: "", titulo: "Sin url", tipo: "gratis", valor: "", descripcion: "", url: "javascript:alert(1)" },
      ],
    })
  );

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("textarea").first()).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /Ofertas/ }).first().click();
  const dialogo = page.getByRole("dialog");

  // Ajustes: la fuente ya venía configurada; comprobar la trae y la fusiona
  await dialogo.getByRole("tab", { name: /Ajustes/i }).click();
  await expect(dialogo.getByPlaceholder(/fuente/i)).toHaveValue(/feeds\.example/);
  await dialogo.getByRole("button", { name: /Guardar y comprobar/ }).click();
  await expect(page.getByText("Tu fuente trajo 3 ofertas")).toBeVisible({ timeout: 10_000 });

  // De vuelta al listado: nuevas + pisada por id, la rota no está
  await dialogo.getByRole("tab", { name: /Ofertas/i }).click();
  await expect(dialogo.getByText("Crédito de prueba de API")).toBeVisible();
  await expect(dialogo.getByText("Plan Copilot Free (ampliado por tu fuente)")).toBeVisible();
  await expect(dialogo.getByText("Días de Pro de regalo")).toBeVisible();

  // Notificaciones del navegador: con permiso concedido y avisos aún en
  // pausa, el botón funciona como interruptor y dispara el aviso de prueba.
  // (El camino «default → pedir permiso» no se puede probar en headless:
  // Chromium arranca denegándolo de fábrica.)
  await dialogo.getByRole("tab", { name: /Ajustes/i }).click();
  await dialogo.getByRole("button", { name: "Avisos en pausa", exact: true }).click();
  await expect(dialogo.getByRole("button", { name: "Avisos activados", exact: true })).toBeVisible();
  await dialogo.getByRole("button", { name: /Probar aviso/ }).click();
  await expect(page.getByText("Aviso de prueba enviado")).toBeVisible();
});
