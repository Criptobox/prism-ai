import { expect, test } from "./fixtures";

/** Prism AI — La web larga que se quedaba a medias.
 *
 * Lo que reportó el usuario: «cuando es largo el código de una web se detienen
 * los modelos y lo dejan a medias». El modelo llega a su techo de tokens de
 * salida y el stream acaba DENTRO del bloque de código: la cerca ``` queda sin
 * cerrar y el documento sin `</html>`.
 *
 * Prism lo daba por respuesta completa. La vista previa recibía un documento
 * incompleto y no cargaba, y no había ni aviso ni forma de seguir.
 *
 * `mock-largo` reproduce el corte exacto y entrega el resto solo si se le pide
 * continuar. La prueba mira lo único que importa de verdad: que la página
 * **se ve entera en la vista previa**, que es lo que fallaba.
 */

const MODEL_ID = "mock-largo";

async function seed(page: import("@playwright/test").Page) {
  await page.addInitScript((model: string) => {
    const seed = {
      state: {
        sessions: [],
        activeSessionId: null,
        onboardingDone: true,
        favorites: [],
        radarSeenIds: [],
        settings: {
          defaultModelKey: `custom::${model}`,
          systemPrompt: "Eres Prism AI (test).",
          temperature: 0.7,
          maxTokens: null,
          stream: false,
          contextWindow: 10,
          sendKeyOnProxy: true,
          onlyFree: false,
          // apagado a propósito: el corte del modo agente ya lo cubre
          // agente-continua.spec.ts; esto es el camino normal
          agentMode: false,
          agentMaxLoops: 3,
          accent: "violeta",
          accentCustom: "#8b5cf6",
          autoSpeak: false,
          accessCode: "",
        },
        providers: {
          custom: {
            apiKey: "test-key-123",
            baseUrl: "/api/mock-llm",
            enabled: true,
            models: [model],
            useProxy: false,
          },
        },
        version: 1,
      },
      version: 0,
    };
    try {
      localStorage.setItem("prism-ai-v1", JSON.stringify(seed));
      localStorage.setItem("prism-preview-demo", "1");
    } catch {
      /* frame sin acceso */
    }
  }, MODEL_ID);
}

test("una web cortada por longitud se completa y la vista previa la pinta entera", async ({
  page,
}) => {
  await seed(page);

  const cuerpos: { messages?: { role: string; content: unknown }[] }[] = [];
  page.on("request", (r) => {
    if (r.method() !== "POST" || !r.url().includes("/api/mock-llm/")) return;
    const raw = r.postData();
    if (!raw) return;
    try {
      cuerpos.push(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  });

  await page.goto("/");
  const input = page.locator("textarea").first();
  await expect(input).toBeVisible({ timeout: 30_000 });
  await input.fill("Hazme una página larga");
  await page.getByRole("button", { name: "Enviar mensaje" }).click();

  // Lo que fallaba: la página no llegaba a cargar. El <h1> vive en el SEGUNDO
  // trozo, así que si no se hubiera cosido, esto no aparece.
  const marco = page.frameLocator('iframe[title="Vista previa de la página generada"]');
  await expect(marco.locator("h1")).toHaveText("Prism", { timeout: 45_000 });
  await expect(marco.locator("p")).toContainText("tras empalmar los dos trozos");

  // Y se cosió en la MISMA respuesta: un solo bloque de código, no dos
  // mensajes. Si se partiera en dos, la vista previa no tendría documento.
  const pidioSeguir = cuerpos.filter((c) =>
    c.messages?.some(
      (m) =>
        typeof m.content === "string" &&
        m.content.includes("Tu respuesta anterior se cortó por longitud")
    )
  );
  expect(pidioSeguir.length, "pidió la continuación").toBe(1);
});
