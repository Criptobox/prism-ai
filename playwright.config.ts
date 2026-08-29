import { defineConfig } from "@playwright/test";

/** Prism AI — E2E con Playwright.
 * Se ejecuta con `npm run test:e2e` (abre Next dev solo, reutiliza si ya corre).
 * En GitHub Actions corren en cada push y en cada pull request, en su propio
 * job, con el navegador cacheado por versión de Playwright.
 */
/** Permite apuntar a un Chromium ya instalado en la máquina (contenedores, CI
 * con caché de navegadores). Si no se define, Playwright usa el suyo. */
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  /* En CI se añade el reporter «github»: publica cada fallo como anotación del
     workflow, con archivo, línea y motivo. Sin él, un E2E rojo solo deja
     «exit code 1» y hay que descargar el log entero para saber qué pasó. */
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
      },
    },
  ],
});
