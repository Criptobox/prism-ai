import { chromium } from "@playwright/test";

/** Capturas de evidencia v2.8: Auto+cooldown en picker, panel de Uso y Ajustes. */
const BASE = "http://localhost:3000";

const seed = `(() => {
  const app = {
    state: {
      sessions: [], activeSessionId: null, onboardingDone: true, favorites: [], radarSeenIds: [],
      settings: {
        defaultModelKey: "custom::mock-mini-free", systemPrompt: "Eres Prism AI.", temperature: 0.7,
        maxTokens: null, stream: true, contextWindow: 10, sendKeyOnProxy: true, onlyFree: false,
        agentMode: false, agentMaxLoops: 3, accent: "violeta", accentCustom: "#8b5cf6",
        autoSpeak: false, accessCode: "", compression: "standard", outputStyle: "conciso",
      },
      providers: { custom: { apiKey: "k", baseUrl: "/api/mock-llm", enabled: true, models: ["mock-mini-free", "mock-big-free"], useProxy: false } },
      version: 1,
    },
    version: 0,
  };
  const health = {
    state: {
      entries: { "custom::mock-big-free": { until: Date.now() + 90_000, consecutive: 1, lastStatus: 429, reason: "límite de peticiones" } },
      lastGood: { key: "custom::mock-mini-free", at: Date.now() - 1000 },
    }, version: 0,
  };
  const usage = {
    state: {
      byModel: {
        "custom::mock-mini-free": { requests: 14, ok: 13, fail: 1, totalMs: 16800, ms: [900, 1200, 1500, 2100], charsIn: 42000, charsOut: 9000, savedChars: 11800, lastUsed: Date.now() },
        "gemini::gemini-2.5-flash": { requests: 6, ok: 6, fail: 0, totalMs: 7400, ms: [1100, 1300], charsIn: 15000, charsOut: 4200, savedChars: 0, lastUsed: Date.now() - 3600_000 },
      },
      days: Object.fromEntries([0,1,2,3,4].map(i => [new Date(Date.now()-i*86400000).toISOString().slice(0,10), [5,8,3,9,14][i]])),
    }, version: 0,
  };
  localStorage.setItem("prism-ai-v1", JSON.stringify(app));
  localStorage.setItem("prism-health-v1", JSON.stringify(health));
  localStorage.setItem("prism-usage-v1", JSON.stringify(usage));
})()`;

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1380, height: 860 } });
  await page.addInitScript(seed);
  await page.goto(BASE);
  await page.getByPlaceholder("Escribe tu mensaje…").waitFor({ timeout: 30_000 });

  // 1) Picker con Auto + badge cooldown + ✓ ok (LKGP)
  await page.getByRole("combobox").first().click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: "download/evidencia-auto-cooldown.png" });
  await page.keyboard.press("Escape");

  // 2) Panel de Uso con métricas
  await page.getByRole("button", { name: /uso/i }).first().click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: "download/evidencia-uso.png" });
  await page.keyboard.press("Escape");

  // 3) Ajustes → Chat con los nuevos controles (compresión + estilo)
  await page.getByRole("button", { name: "Ajustes" }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole("tab", { name: "Chat" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "download/evidencia-ajustes-compresion.png" });

  await browser.close();
  console.log("OK capturas");
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
