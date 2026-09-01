import { expect, test } from "./fixtures";

/** Prism AI — Tarea 4 del plan V6: el razonamiento de Gemini sale separado.
 *
 * Las partes con `thought: true` de Gemini se pegaban al contenido: el
 * chain-of-thought aparecía MEZCLADO dentro de la respuesta. Ahora
 * razonamiento.ts lo traduce como los otros protocolos y el acordeón
 * «Razonamiento del modelo» lo enseña aparte.
 *
 * Se intercepta la respuesta en vivo (stream SSE real, con su pausa entre
 * trozos) en lugar de simular el estado después: lo que se prueba es la
 * traducción, no la maqueta.
 */

test("las partes thought de Gemini llegan al acordeón, no mezcladas en la respuesta", async ({
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
              defaultModelKey: "gemini::gemini-2.5-flash",
              systemPrompt: "",
              temperature: 0.7,
              maxTokens: null,
              stream: true,
              contextWindow: 10,
              sendKeyOnProxy: true,
              onlyFree: false,
              agentMode: false,
              agentMaxLoops: 3,
              accessCode: "",
            },
            providers: {
              gemini: {
                apiKey: "test-key-123",
                baseUrl: "/api/mock-llm",
                enabled: true,
                models: ["gemini-2.5-flash"],
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

  // SSE en vivo con razonamiento (thought:true) y contenido. El cierre llega
  // tras los datos completos (§1.8: nunca se corta el stream en el mismo tick
  // que el último trozo)
  await page.route("**/api/mock-llm/models/**", async (route) => {
    const sse = [
      { candidates: [{ content: { parts: [{ text: "razono en secreto sobre el problema", thought: true }] } }] },
      { candidates: [{ content: { parts: [{ text: "Esta es la respuesta visible." }] } }] },
    ]
      .map((obj) => `data: ${JSON.stringify(obj)}\n\n`)
      .join("");
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
      body: sse,
    });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const input = page.locator("textarea").first();
  await expect(input).toBeVisible({ timeout: 30_000 });

  await input.fill("Explícame los closures");
  await input.press("Enter");

  // la respuesta visible llega (y es SOLO la visible; .last() porque el
  // título de la conversación también previsualiza el texto en la barra lateral)
  const respuesta = page.getByText("Esta es la respuesta visible.").last();
  await expect(respuesta).toBeVisible({ timeout: 30_000 });

  // y el razonamiento, en el acordeón «Razonamiento del modelo», separado
  // (va plegado: se abre y entonces se ve el texto)
  const acordeon = page.locator("details").filter({ hasText: "Razonamiento del modelo" });
  await expect(acordeon).toBeVisible({ timeout: 10_000 });
  await acordeon.locator("summary").click();
  await expect(acordeon.getByText("razono en secreto sobre el problema")).toBeVisible();

  // mezclado estaría dos veces (contenido + razonamiento); separado, una:
  // solo dentro del acordeón (el título de la barra lateral no cuenta: no
  // está dentro de la burbuja del mensaje)
  const enLaBurbuja = page.locator("main").getByText("razono en secreto sobre el problema");
  expect(await enLaBurbuja.count()).toBe(1);
  await expect(enLaBurbuja).toBeVisible();
});
