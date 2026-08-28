import { chromium } from "@playwright/test";

/** Capturas de evidencia v3.0: Sandbox ejecutando la demo y Repo Studio directo conectado. */
const BASE = "http://localhost:3000";

const seed = `(() => {
  const app = {
    state: {
      sessions: [], activeSessionId: null, onboardingDone: true, favorites: [], radarSeenIds: [],
      settings: {
        defaultModelKey: "custom::mock-mini-free", systemPrompt: "Eres Prism AI.", temperature: 0.7,
        maxTokens: null, stream: true, contextWindow: 10, sendKeyOnProxy: true, onlyFree: false,
        agentMode: false, agentMaxLoops: 3, accent: "violeta", accentCustom: "#8b5cf6",
        autoSpeak: false, accessCode: "", compression: "off", outputStyle: "normal", piiShield: true,
      },
      providers: { custom: { apiKey: "test-key-123", baseUrl: "/api/mock-llm", enabled: true, models: ["mock-mini-free", "mock-big-free"], useProxy: false } },
      version: 1,
    },
    version: 0,
  };
  localStorage.setItem("prism-ai-v1", JSON.stringify(app));
})()`;

const OWNER = "mi-usuario";
const REPO = "mi-pagina";

const mockGithub = async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const p = url.pathname;
  const m = req.method();
  const B = `https://api.github.com/repos/${OWNER}/${REPO}`;
  const json = (status, body) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const b64 = (s) => Buffer.from(s, "utf8").toString("base64");

  if (p === `/repos/${OWNER}/${REPO}`) return json(200, { default_branch: "main", private: false, permissions: { push: true }, html_url: `https://github.com/${OWNER}/${REPO}` });
  if (p === `/repos/${OWNER}/${REPO}/git/trees/main`) return json(200, {
    sha: "tree0",
    tree: [
      { path: "index.html", type: "blob", size: 640, sha: "f1" },
      { path: "css/style.css", type: "blob", size: 480, sha: "f2" },
      { path: "js/app.js", type: "blob", size: 320, sha: "f3" },
      { path: "README.md", type: "blob", size: 120, sha: "f4" },
    ],
  });
  if (p === `/repos/${OWNER}/${REPO}/commits/main`) return json(200, { sha: "c1" });
  if (p === `/repos/${OWNER}/${REPO}/contents/index.html`) return json(200, { content: b64("<!doctype html>\n<html lang=\"es\">\n<head>\n  <title>Mi página</title>\n</head>\n<body>\n  <h1>Hola desde mi repo</h1>\n</body>\n</html>"), encoding: "base64", sha: "f1", size: 640 });
  if (p === `/repos/${OWNER}/${REPO}/git/ref/heads/main`) return json(200, { object: { sha: "c1" } });
  if (p === `/repos/${OWNER}/${REPO}/git/commits/c1`) return json(200, { tree: { sha: "tree0" } });
  if (p === `/repos/${OWNER}/${REPO}/git/blobs`) return json(201, { sha: "blob1" });
  if (p === `/repos/${OWNER}/${REPO}/git/trees`) return json(201, { sha: "tree1" });
  if (p === `/repos/${OWNER}/${REPO}/git/commits`) return json(201, { sha: "c2", html_url: `https://github.com/${OWNER}/${REPO}/commit/c2` });
  if (p === `/repos/${OWNER}/${REPO}/git/refs/heads/main`) return json(200, { object: { sha: "c2" } });
  return json(404, { message: "no fixture" });
};

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1380, height: 860 } });
  await page.addInitScript(seed);
  await page.route("**/api.github.com/**", mockGithub);
  await page.goto(BASE);
  const input = page.getByPlaceholder("Escribe tu mensaje…");
  await input.waitFor({ timeout: 30_000 });

  // 1) SANDBOX: demo cargada + ejecutada + consola
  await page.getByRole("button", { name: "Sandbox", exact: false }).first().click();
  await page.getByRole("button", { name: "Probar con una demo" }).click();
  await page.getByText("demo-web/index.html").first().waitFor({ timeout: 15_000 });
  await page.getByRole("button", { name: "Ejecutar" }).click();
  const frame = page.frameLocator('iframe[title="Vista previa del Sandbox"]');
  await frame.locator("h1").waitFor({ timeout: 15_000 });
  await frame.locator("#btn").click();
  await frame.locator("#btn").click();
  await page.getByText("Demo del Sandbox lista").waitFor({ timeout: 10_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: "download/evidencia-sandbox.png" });

  // 2) REPO DIRECTO: conectado + archivo abierto editado + commit hecho
  await page.reload();
  await input.waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: "Repos", exact: false }).first().click();
  await page.getByLabel("URL del repositorio de GitHub").fill(`${OWNER}/${REPO}`);
  await page.getByLabel("Token de GitHub").fill("token-demo");
  await page.getByRole("button", { name: "Conectar" }).click();
  await page.getByText("push permitido").waitFor({ timeout: 15_000 });
  await page.getByRole("button", { name: /index\.html/ }).click();
  const ta = page.getByRole("textbox", { name: /Contenido de index\.html/ });
  await ta.waitFor({ timeout: 10_000 });
  await ta.fill('<!doctype html>\n<html lang="es">\n<head>\n  <title>Mi página</title>\n</head>\n<body>\n  <h1>¡Editado desde Prism, sin descargar nada!</h1>\n</body>\n</html>');
  await page.getByRole("button", { name: "Guardar" }).click();
  await page.getByText("1 archivo listos para el commit").waitFor({ timeout: 10_000 });
  await page.getByLabel("Mensaje del commit").fill("Cambio desde Prism AI");
  await page.getByRole("button", { name: "Commit y push" }).click();
  await page.getByText("¡Push hecho — 1 solo commit!").waitFor({ timeout: 15_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: "download/evidencia-repo-directo.png" });

  await browser.close();
  console.log("Capturas v3.0 listas");
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
