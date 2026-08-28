import { chromium } from "@playwright/test";

/** Evidencias v3.1.0 — Mapa del proyecto edición Obsidian */
const MAP = {
  name: "Panel CRM",
  description: "CRM ligero en una página",
  files: [
    {
      name: "Panel CRM",
      kind: "html",
      summary: "portada con listado y navegación",
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

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

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

await page.goto("http://localhost:3000/");
await page.waitForSelector("text=Panel CRM", { timeout: 30_000 });

// ——— captura 1: grafo con nodo seleccionado y panel de detalles ———
await page.getByRole("button", { name: "Mapa del proyecto" }).first().click();
await page.waitForSelector('[data-testid="graph-stats"]');
await page.waitForTimeout(2_500); // dejar que la física asiente
await page.locator('[data-node="Panel CRM"]').click({ force: true });
await page.waitForSelector('[data-testid="graph-details"]');
await page.waitForTimeout(600);
await page.screenshot({ path: "download/evidencia-grafo-obsidian.png" });
console.log("OK evidencia-grafo-obsidian.png");

// ——— captura 2: vista lista con backlinks, notas e historial ———
await page.getByRole("button", { name: "Vista lista" }).click();
await page.getByRole("button", { name: /Historial del mapa \(1\)/ }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: "download/evidencia-lista-obsidian.png" });
console.log("OK evidencia-lista-obsidian.png");

await browser.close();
