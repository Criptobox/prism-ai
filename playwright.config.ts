import { defineConfig } from "@playwright/test";

/** Prism AI — E2E con Playwright.
 * Se ejecuta con `npm run test:e2e` (abre Next dev solo, reutiliza si ya corre).
 * En GitHub Actions el job de E2E es MANUAL (workflow_dispatch) para mantener
 * el CI de cada push rápido y verde.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
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
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
