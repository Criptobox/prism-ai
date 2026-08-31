import { expect, test } from "./fixtures";
import * as XLSX from "xlsx";

/** Prism AI — El Excel se lee en un hilo aparte, y se sigue leyendo bien.
 *
 * `xlsx` arrastra dos vulnerabilidades altas sin arreglo en npm —contaminación
 * de prototipos y ReDoS— que se disparan al leer un archivo preparado. Como
 * Prism guarda las claves en el dispositivo, ensuciar el `Object.prototype`
 * del hilo principal iría contra la promesa del producto, así que el parseo
 * se hace en un Worker que se destruye al terminar.
 *
 * Mover un parser de hilo es justo el cambio que puede romper la función sin
 * que nadie se entere. Por eso esta prueba adjunta un .xlsx DE VERDAD y
 * comprueba que sus celdas llegan al modelo.
 */

function libroDePrueba(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ["Producto", "Unidades"],
    ["Auriculares", 49],
    ["Teclado", 17],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Ventas");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

test("un .xlsx adjunto se lee en el worker y sus celdas viajan al modelo", async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("prism-preview-demo", "1");
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
              ahorro: false,
              stream: false,
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
      /* frame sin acceso */
    }
  });

  const cuerpos: string[] = [];
  await page.route("**/api/mock-llm/**", async (route) => {
    if (route.request().method() === "POST") cuerpos.push(route.request().postData() ?? "");
    await route.continue();
  });

  await page.goto("/");
  await expect(page.locator("textarea").first()).toBeVisible({ timeout: 30_000 });

  await page.locator('input[type="file"]').setInputFiles({
    name: "ventas.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: libroDePrueba(),
  });

  // el aviso confirma que se leyó en local
  await expect(page.getByText("«ventas.xlsx» leído en tu dispositivo")).toBeVisible({
    timeout: 30_000,
  });

  await page.locator("textarea").first().fill("¿cuántos teclados?");
  await page.keyboard.press("Enter");

  // Lo que de verdad importa: las celdas llegaron al modelo, no solo el chip.
  await expect.poll(() => cuerpos.length, { timeout: 30_000 }).toBeGreaterThan(0);
  const enviado = cuerpos.join("\n");
  expect(enviado).toContain("Auriculares");
  expect(enviado).toContain("Teclado");
  expect(enviado).toContain("ventas.xlsx");
});
