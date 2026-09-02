import { expect, test } from "./fixtures";
import { writeZip } from "../../src/lib/prism/zip";

/** Prism AI — Subir un ZIP (o un archivo de código) al chat y que se lea.
 *
 * Hasta ahora el compositor aceptaba imágenes, PDF, txt/md y hojas de cálculo.
 * Un `.js` o un `.zip` no encajaban en ningún filtro y se ignoraban **en
 * silencio**: soltabas el archivo y no pasaba nada, ni te decían por qué.
 *
 * Se comprueba lo que VIAJA al modelo, no lo que se ve en pantalla.
 */

const texto = (s: string) => new TextEncoder().encode(s);

function zipDePrueba(): Buffer {
  return Buffer.from(
    writeZip([
      { path: "proyecto/index.html", data: texto("<h1>MARCA-INDEX</h1>") },
      { path: "proyecto/app.js", data: texto("function roto( { return MARCA-JS }") },
      { path: "proyecto/README.md", data: texto("MARCA-README") },
      // ruido: no debe viajar, pero sí contarse
      { path: "proyecto/node_modules/x/i.js", data: texto("MARCA-RUIDO") },
      // binario: solo se nombra
      { path: "proyecto/logo.png", data: new Uint8Array([1, 2, 3, 4]) },
    ])
  );
}

async function abrir(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    if (window.top !== window.self) return;
    try {
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
              piiShield: false,
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
            version: 1,
          },
          version: 0,
        })
      );
    } catch {
      /* marco sin acceso a localStorage */
    }
  });
  await page.goto("/");
  await expect(page.locator("textarea").first()).toBeVisible({ timeout: 30_000 });
}

test("un ZIP se abre entero y su contenido llega al modelo", async ({ page }) => {
  await abrir(page);
  const cuerpos: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/api/mock-llm/")) {
      cuerpos.push(r.postData() ?? "");
    }
  });

  await page.locator('input[type="file"]').first().setInputFiles({
    name: "proyecto.zip",
    mimeType: "application/zip",
    buffer: zipDePrueba(),
  });

  // el aviso dice qué se leyó
  await expect(page.getByText(/abierto en tu dispositivo/).first()).toBeVisible({ timeout: 20_000 });

  await page.locator("textarea").first().fill("repara esto");
  await page.keyboard.press("Enter");
  await expect.poll(() => cuerpos.filter((c) => c.includes("repara esto")).length, {
    timeout: 30_000,
  }).toBeGreaterThan(0);

  const enviado = cuerpos.filter((c) => c.includes("repara esto"))[0];
  // el contenido de los tres archivos de texto viaja
  expect(enviado, "el index").toContain("MARCA-INDEX");
  expect(enviado, "el js").toContain("MARCA-JS");
  expect(enviado, "el readme").toContain("MARCA-README");
  // el índice completo también, para que sepa la forma del proyecto
  expect(enviado, "índice").toContain("proyecto/logo.png");
  // el ruido NO viaja, pero se dice que se omitió
  expect(enviado, "sin node_modules").not.toContain("MARCA-RUIDO");
  expect(enviado, "lo dice").toContain("Lo que NO viaja en este mensaje");
});

test("un archivo de código suelto también se lee, y lo que no se puede leer se dice", async ({
  page,
}) => {
  await abrir(page);
  const cuerpos: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/api/mock-llm/")) {
      cuerpos.push(r.postData() ?? "");
    }
  });

  const input = page.locator('input[type="file"]').first();
  await input.setInputFiles({
    name: "roto.js",
    mimeType: "text/javascript",
    buffer: Buffer.from("function suma(a, b { return a + b }  // MARCA-CODIGO"),
  });
  await expect(page.getByText(/roto\.js/).first()).toBeVisible({ timeout: 20_000 });

  await page.locator("textarea").first().fill("qué falla");
  await page.keyboard.press("Enter");
  await expect.poll(() => cuerpos.filter((c) => c.includes("qué falla")).length, {
    timeout: 30_000,
  }).toBeGreaterThan(0);
  expect(cuerpos.filter((c) => c.includes("qué falla"))[0]).toContain("MARCA-CODIGO");
});
