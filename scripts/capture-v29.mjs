import { chromium } from "@playwright/test";

/** Capturas de evidencia v2.9: escudo PII, visor cURL y panel de Uso con sparkline. */
const BASE = "http://localhost:3000";

const seed = `(() => {
  const app = {
    state: {
      sessions: [], activeSessionId: null, onboardingDone: true, favorites: [], radarSeenIds: [],
      settings: {
        defaultModelKey: "custom::mock-mini-free", systemPrompt: "Eres Prism AI.", temperature: 0.7,
        maxTokens: null, stream: true, contextWindow: 10, sendKeyOnProxy: true, onlyFree: false,
        agentMode: false, agentMaxLoops: 3, accent: "violeta", accentCustom: "#8b5cf6",
        autoSpeak: false, accessCode: "", compression: "standard", outputStyle: "normal", piiShield: true,
      },
      providers: { custom: { apiKey: "test-key-123", baseUrl: "/api/mock-llm", enabled: true, models: ["mock-mini-free", "mock-big-free"], useProxy: false } },
      version: 1,
    },
    version: 0,
  };
  const usage = {
    state: {
      byModel: {
        "custom::mock-mini-free": { requests: 14, ok: 13, fail: 1, totalMs: 16800, ms: [900, 1200, 1500, 2100], charsIn: 42000, charsOut: 9000, savedChars: 11800, lastUsed: Date.now() },
      },
      days: Object.fromEntries([0,1,2,3,4,5,6].map((i) => [new Date(Date.now()-i*86400000).toISOString().slice(0,10), [5,8,3,9,14,6,11][i]])),
    }, version: 0,
  };
  localStorage.setItem("prism-ai-v1", JSON.stringify(app));
  localStorage.setItem("prism-usage-v1", JSON.stringify(usage));
})()`;

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1380, height: 860 } });
  await page.addInitScript(seed);
  await page.goto(BASE);
  const input = page.getByPlaceholder("Escribe tu mensaje…");
  await input.waitFor({ timeout: 30_000 });

  // 1) Escudo PII: envía un correo y captura toast + chip
  await input.fill("Mi correo es usuario.oculto@ejemplo.com, revisa el caso");
  await input.press("Enter");
  await page.getByText(/Escudo PII: 1 dato enmascarado/).waitFor({ timeout: 20_000 });
  await page.getByText(/🛡 1/).waitFor({ timeout: 20_000 });
  await page.screenshot({ path: "download/evidencia-escudo-pii.png" });

  // 2) Panel de Uso: sparkline + peticiones recientes
  await page.getByRole("button", { name: /uso/i }).first().click();
  await page.getByText("Peticiones recientes").waitFor({ timeout: 10_000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: "download/evidencia-uso-v29.png" });

  // 3) Visor de cURL
  await page.getByRole("dialog").getByRole("button", { name: /copiar curl/i }).first().click();
  await page.getByText("cURL de la petición").waitFor({ timeout: 10_000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: "download/evidencia-copiar-curl.png" });

  await browser.close();
  console.log("OK capturas v2.9");
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
