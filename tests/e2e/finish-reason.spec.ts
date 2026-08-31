import { expect, test } from "./fixtures";

/** Prism AI — El corte que el texto no delata, pero el proveedor sí.
 *
 * La detección de la v3.18.0 va por la FORMA del texto: una cerca ``` sin
 * pareja, un `<html>` sin cerrar. Funciona con código, pero es un indicio.
 * Cuando el modelo se queda sin sitio a mitad de una frase normal, sin bloque
 * de código de por medio, la forma no ve absolutamente nada.
 *
 * Los tres protocolos mandan `finish_reason`/`stop_reason`/`finishReason`
 * diciendo por qué pararon, y Prism no lo leía en ningún sitio.
 *
 * `mock-prosa-cortada` devuelve prosa cortada a media palabra con
 * `finish_reason: "length"`, y el resto solo si se le pide continuar.
 */

test("una respuesta cortada a media frase se completa gracias al finish_reason", async ({
  page,
}) => {
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
              defaultModelKey: "custom::mock-prosa-cortada",
              accessCode: "",
              agentModes: [],
              agentMode: false,
              ahorro: false,
              stream: false,
            },
            providers: {
              custom: {
                apiKey: "test-key-123",
                baseUrl: "/api/mock-llm",
                enabled: true,
                models: ["mock-prosa-cortada"],
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

  await page.goto("/");
  const input = page.locator("textarea").first();
  await expect(input).toBeVisible({ timeout: 30_000 });
  await input.fill("cuéntame una historia");
  await page.keyboard.press("Enter");

  // El final solo existe si se pidió la continuación, y esa petición solo
  // sale si se leyó el finish_reason: en el texto no hay ninguna pista.
  await expect(
    page.getByText("y este es el final que solo llega si se pidió continuar.")
  ).toBeVisible({ timeout: 45_000 });
});
