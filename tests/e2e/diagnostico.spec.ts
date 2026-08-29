import { expect, test } from "@playwright/test";

/** Prism AI — el diagnóstico se puede pegar en cualquier sitio.
 *
 * El test unitario prueba que la función no deja salir una clave. Este prueba
 * lo otro: que la clave que el usuario tiene DE VERDAD guardada tampoco sale,
 * recorriendo el camino entero —store, panel, portapapeles— con una clave
 * metida a propósito por los dos huecos por los que podría escaparse: el campo
 * de la clave y la URL propia del proveedor.
 */
const CLAVE = "sk-secreta-de-verdad-999";

test("copia versión y proveedores, nunca la clave", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(
    ({ clave }) => {
      if (window.top !== window.self) return;
      localStorage.setItem(
        "prism-ai-v1",
        JSON.stringify({
          state: {
            sessions: [],
            activeSessionId: null,
            onboardingDone: true,
            favorites: [],
            radarSeenIds: [],
            settings: { defaultModelKey: "custom::mock-mini-free", accessCode: "" },
            providers: {
              custom: {
                apiKey: clave,
                baseUrl: `/api/mock-llm?api_key=${clave}`,
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
      localStorage.setItem("prism-preview-demo", "1");
    },
    { clave: CLAVE }
  );

  await page.goto("/");
  await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Ajustes" }).click();
  await page.getByRole("tab", { name: /datos/i }).click();

  await page.getByRole("button", { name: "Ver qué se copia" }).click();
  const informe = page.locator("pre").filter({ hasText: "Diagnóstico de Prism AI" });
  await expect(informe).toBeVisible();

  const texto = (await informe.textContent()) ?? "";
  expect(texto, "no puede llevar la clave").not.toContain(CLAVE);
  expect(texto, "ni un trozo de ella").not.toContain("sk-secreta");
  // pero sí lo que sirve para depurar
  expect(texto).toMatch(/v\d+\.\d+\.\d+/);
  expect(texto).toContain("Personalizado");
  expect(texto).toContain(`clave: sí (${CLAVE.length} caracteres)`);
  // la URL propia entra limpia de la query donde iba metida la clave
  expect(texto).toContain("/api/mock-llm");

  // y lo que llega al portapapeles es exactamente eso
  await page.getByRole("button", { name: "Copiar diagnóstico" }).click();
  const portapapeles = await page.evaluate(() => navigator.clipboard.readText());
  expect(portapapeles).not.toContain(CLAVE);
  expect(portapapeles).toContain("Diagnóstico de Prism AI");
});
