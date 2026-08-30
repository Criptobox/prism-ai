import {  expect, test, type Page  } from "./fixtures";

/** Prism AI — E2E v3.1.0: Mapa del proyecto edición Obsidian (grafo, backlinks,
 * notas de memoria e historial). Se siembra una sesión con projectMap completo. */

const MAP = {
  name: "Panel CRM",
  description: "CRM ligero en una página",
  files: [
    {
      name: "Panel CRM",
      kind: "html",
      summary: "portada con listado",
      links: ["styles.css", "app.js", "Acerca de"],
      features: ["Clientes", "Botón «Guardar»"],
      tech: ["localStorage"],
    },
    { name: "Acerca de", kind: "html", summary: "info del proyecto", links: ["styles.css"], features: [], tech: [] },
    { name: "styles.css", kind: "css", summary: "hoja de estilos del proyecto", features: [], tech: [] },
    { name: "app.js", kind: "js", summary: "lógica del proyecto", features: [], tech: ["localStorage"] },
    { name: "logo.svg", kind: "img", summary: "logotipo sin usar", features: [], tech: [] },
  ],
  features: ["Clientes", "Botón «Guardar»", "Tech: localStorage"],
  notes: ["el tema principal es azul", "las sesiones van en localStorage"],
  history: [
    {
      at: Date.now() - 90_000,
      label: "+2 archivos · +1 funcionalidad",
      name: "Panel CRM",
      description: "versión antigua",
      files: [
        { name: "portada antigua", kind: "html", summary: "primera versión" },
        { name: "styles.css", kind: "css", summary: "hoja de estilos del proyecto" },
      ],
      features: ["Lista básica"],
      notes: [],
    },
  ],
  updatedAt: Date.now(),
};

async function seedApp(page: Page) {
  await page.addInitScript((map) => {
    const seed = {
      state: {
        sessions: [
          {
            id: "s-map-1",
            title: "Sesión del mapa",
            createdAt: Date.now() - 600_000,
            updatedAt: Date.now() - 60_000,
            messages: [
              { id: "m1", role: "user", content: "créame un panel CRM", createdAt: Date.now() - 600_000 },
              {
                id: "m2",
                role: "assistant",
                content:
                  "Aquí lo tienes:\n\n```html\n<!doctype html><html><head><title>Panel CRM</title></head><body><h1>Panel CRM</h1></body></html>\n```",
                createdAt: Date.now() - 120_000,
              },
            ],
            projectMap: map,
          },
        ],
        activeSessionId: "s-map-1",
        onboardingDone: true,
        favorites: [],
        radarSeenIds: [],
        settings: {
          defaultModelKey: "custom::mock-mini-free",
          systemPrompt: "Eres Prism AI (test).",
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
          compression: "off",
          outputStyle: "normal",
          piiShield: true,
        },
        providers: {
          custom: {
            apiKey: "test-key-123",
            baseUrl: "/api/mock-llm",
            enabled: true,
            models: ["mock-mini-free", "mock-big-free"],
            useProxy: false,
          },
        },
        version: 1,
      },
      version: 0,
    };
    localStorage.setItem("prism-ai-v1", JSON.stringify(seed));
  }, MAP);
}

test.describe("Prism AI — Mapa del proyecto (edición Obsidian)", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page);
  });

  test("grafo: nodos, relaciones, filtros y panel de detalles", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Panel CRM").first()).toBeVisible({ timeout: 30_000 });

    // abrir la pestaña del mapa (el preview se auto-abre con el HTML sembrado)
    await page.getByRole("button", { name: "Mapa del proyecto" }).first().click();

    // grafo por defecto: 10 nodos (5 archivos + 2 features + 1 tech + 2 notas) · 8 relaciones
    await expect(page.getByTestId("graph-stats")).toHaveText(/10 nodos · 8 relaciones/);

    // seleccionar un archivo → panel de detalles con backlinks
    await page.waitForTimeout(1_200);
    await page.locator('[data-node="Panel CRM"]').click({ force: true });
    const details = page.getByTestId("graph-details");
    await expect(details).toBeVisible();
    await expect(details).toContainText("archivo · html");
    await expect(details).toContainText("6 conexiones");
    await expect(details).toContainText("Enlaza a");

    // navegar por el grafo: clic en un destino del panel de detalles
    await details.getByRole("button", { name: "Acerca de", exact: true }).click();
    await expect(details).toContainText("Referenciado por");

    // filtrar las notas fuera del grafo (−2 nodos, las notas no tienen aristas)
    await page.getByRole("button", { name: /Notas · 2/ }).click();
    await expect(page.getByTestId("graph-stats")).toHaveText(/8 nodos · 8 relaciones/);
  });

  test("lista: backlinks, huérfanos, notas de memoria e historial", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Panel CRM").first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Mapa del proyecto" }).first().click();

    // pasar a la vista lista
    await page.getByRole("button", { name: "Vista lista" }).click();
    await expect(page.getByText("Archivos del proyecto (5)")).toBeVisible();

    // backlinks por archivo
    await expect(page.getByText(/← Panel CRM/).first()).toBeVisible();
    // huérfano detectado (logo.svg sin conexiones)
    await expect(page.getByText("huérfano", { exact: true })).toBeVisible();

    // añadir una nota de memoria
    await page.getByPlaceholder("Añadir nota de memoria…").fill("exportar a PDF en la v2");
    await page.getByRole("button", { name: "Añadir" }).click();
    await expect(page.getByText("exportar a PDF en la v2")).toBeVisible();

    // quitarla
    await page.getByRole("button", { name: "Quitar nota 3" }).click();
    await expect(page.getByText("exportar a PDF en la v2")).toHaveCount(0);

    // historial y restauración
    await page.getByRole("button", { name: /Historial del mapa \(1\)/ }).click();
    await expect(page.getByText("+2 archivos · +1 funcionalidad")).toBeVisible();
    await page.getByRole("button", { name: "Restaurar" }).click();
    await expect(page.getByText("Archivos del proyecto (2)")).toBeVisible();
    // exact: la ficha del proyecto nombra el mismo archivo como «Entrada:» y
    // «Huérfana:», así que sin acotar esto casa con tres sitios. Lo que se
    // comprueba aquí es la FILA del archivo en la lista, que es el texto solo.
    await expect(page.getByText("portada antigua", { exact: true })).toBeVisible();
  });
});
