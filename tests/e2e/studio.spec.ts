import { expect, test, type Page } from "@playwright/test";

/** Prism AI — E2E v3.0.0: Sandbox (ZIP → ejecutar) y Repo Studio directo (GitHub API). */

async function seedApp(page: Page) {
  await page.addInitScript(() => {
    const seed = {
      state: {
        sessions: [],
        activeSessionId: null,
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
  });
}

test.describe("Prism AI — Sandbox (ZIP → ejecutar)", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page);
  });

  test("carga la demo, ejecuta y muestra la consola integrada", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible({ timeout: 30_000 });

    // abrir el Sandbox desde la barra lateral
    await page.getByRole("button", { name: "Sandbox", exact: false }).first().click();
    await expect(page.getByText("Suelta un ZIP aquí")).toBeVisible();

    // cargar demo
    await page.getByRole("button", { name: "Probar con una demo" }).click();
    await expect(page.getByText("demo-web/index.html").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("css/style.css").first()).toBeVisible();

    // ejecutar
    await page.getByRole("button", { name: "Ejecutar" }).click();
    const frame = page.frameLocator('iframe[title="Vista previa del Sandbox"]');
    await expect(frame.locator("h1")).toContainText("Funciona", { timeout: 15_000 });
    // el botón del proyecto dentro del iframe responde → el JS inlineado funciona
    await frame.locator("#btn").click();
    await expect(frame.locator("#btn")).toContainText("Pulsado 1 vez");

    // consola integrada con el log del puente
    await expect(page.getByText("Demo del Sandbox lista")).toBeVisible({ timeout: 10_000 });
  });

  test("edita un archivo y exporta el ZIP modificado", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Sandbox", exact: false }).first().click();
    await page.getByRole("button", { name: "Probar con una demo" }).click();
    await expect(page.getByText("demo-web/index.html").first()).toBeVisible({ timeout: 15_000 });

    // editar el HTML
    await page.getByRole("button", { name: /demo-web\/index\.html/ }).click();
    const ta = page.getByRole("textbox", { name: /Contenido de demo-web\/index/ });
    await expect(ta).toBeVisible();
    await ta.fill("<!doctype html><html><head><title>Editado</title></head><body><h1>Editado E2E</h1><script>console.log('x');</script></body></html>");
    await expect(page.getByText("sin guardar")).toBeVisible();

    // exportar
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /ZIP/ }).first().click(),
    ]);
    expect(download.suggestedFilename()).toBe("demo-web-editado.zip");
  });
});

test.describe("Prism AI — Repo Studio directo (GitHub API)", () => {
  const OWNER = "e2e-user";
  const REPO = "demo-repo";
  const BASE = `https://api.github.com/repos/${OWNER}/${REPO}`;
  const HTML_VIEJO = "<h1>Hola</h1>";
  const HTML_NUEVO = "<h1>Hola editado desde Prism</h1>";

  let commitsPost: { message?: string }[] = [];

  test.beforeEach(async ({ page }) => {
    await seedApp(page);
    commitsPost = [];
    const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

    await page.route("**/api.github.com/**", async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const p = url.pathname;
      const m = req.method();

      if (p === `/repos/${OWNER}/${REPO}` && m === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            default_branch: "main",
            private: false,
            permissions: { push: true },
            html_url: `https://github.com/${OWNER}/${REPO}`,
          }),
        });
      }
      if (p === `/repos/${OWNER}/${REPO}/git/trees/main` && m === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            sha: "tree0",
            tree: [
              { path: "index.html", type: "blob", size: HTML_VIEJO.length, sha: "f1" },
              { path: "node_modules/x.js", type: "blob", size: 1, sha: "f2" },
              { path: "README.md", type: "blob", size: 30, sha: "f3" },
            ],
          }),
        });
      }
      if (p === `/repos/${OWNER}/${REPO}/commits/main` && m === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ sha: "c1" }),
        });
      }
      if (p === `/repos/${OWNER}/${REPO}/contents/index.html` && m === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ content: b64(HTML_VIEJO), encoding: "base64", sha: "f1", size: HTML_VIEJO.length }),
        });
      }
      if (p === `/repos/${OWNER}/${REPO}/git/ref/heads/main` && m === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ object: { sha: "c1" } }),
        });
      }
      if (p === `/repos/${OWNER}/${REPO}/git/commits/c1` && m === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ tree: { sha: "tree0" } }),
        });
      }
      if (p === `/repos/${OWNER}/${REPO}/git/blobs` && m === "POST") {
        return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ sha: "blob1" }) });
      }
      if (p === `/repos/${OWNER}/${REPO}/git/trees` && m === "POST") {
        return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ sha: "tree1" }) });
      }
      if (p === `/repos/${OWNER}/${REPO}/git/commits` && m === "POST") {
        commitsPost.push(JSON.parse(req.postData() ?? "{}"));
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ sha: "c2", html_url: `https://github.com/${OWNER}/${REPO}/commit/c2` }),
        });
      }
      if (p === `/repos/${OWNER}/${REPO}/git/refs/heads/main` && m === "PATCH") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ object: { sha: "c2" } }) });
      }
      return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ message: "no fixture" }) });
    });
  });

  test("conecta sin descargar, edita y hace push en 1 commit", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Repos", exact: false }).first().click();
    // pestaña «Directo · sin descargar» activa por defecto
    await expect(page.getByText("Directo, sin descargar nada")).toBeVisible();

    await page.getByLabel("URL del repositorio de GitHub").fill(`${OWNER}/${REPO}`);
    await page.getByLabel("Token de GitHub").fill("e2e-token-falso");
    await page.getByRole("button", { name: "Conectar" }).click();

    await expect(page.getByText(`${OWNER}/${REPO}`)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("push permitido")).toBeVisible();

    // abrir y editar el archivo
    await page.getByText("index.html").first().click();
    const ta = page.getByLabel("Contenido de index.html");
    await expect(ta).toHaveValue(HTML_VIEJO, { timeout: 15_000 });
    await ta.fill(HTML_NUEVO);
    await page.getByRole("button", { name: "Guardar" }).click();

    // commit + push
    await page.getByLabel("Mensaje del commit").fill("Cambio desde Prism E2E");
    await page.getByRole("button", { name: "Commit y push" }).click();

    await expect(page.getByText("¡Push hecho — 1 solo commit!")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/se despliega solo/)).toBeVisible();

    // el POST de commit llevó el mensaje correcto y 1 solo commit
    expect(commitsPost).toHaveLength(1);
    expect(commitsPost[0].message).toBe("Cambio desde Prism E2E");
  });
});
