import { expect, test } from "./fixtures";

/** Prism AI — El failover CONTINÚA el trabajo, no lo reinicia.
 *
 * `attemptFailover` hacía `deleteMessage` y el modelo de repuesto empezaba de
 * cero: cambiaba de modelo, sí, pero los minutos que llevaba escritos el
 * anterior se tiraban. Con modelos gratis lentos eso son minutos perdidos en
 * cada salto, y era la queja original.
 *
 * Montaje: dos proveedores. `mock-corta-y-cae` escribe media web y se cae a
 * mitad del stream. El repuesto es `mock-empalma-free`, que devuelve el resto SOLO
 * si recibe la orden de continuar; si no, devuelve una página distinta que
 * dice «Empezada de cero». Así el test distingue las dos cosas de verdad.
 */

async function seed(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const seed = {
      state: {
        sessions: [],
        activeSessionId: null,
        onboardingDone: true,
        favorites: [],
        radarSeenIds: [],
        settings: {
          defaultModelKey: "custom::mock-corta-y-cae",
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
          ahorro: false,
        },
        providers: {
          custom: {
            apiKey: "test-key-123",
            baseUrl: "/api/mock-llm",
            enabled: true,
            models: ["mock-corta-y-cae"],
            useProxy: false,
          },
          // el repuesto vive en OTRO proveedor: el failover salta de proveedor
          openrouter: {
            apiKey: "test-key-123",
            baseUrl: "/api/mock-llm",
            enabled: true,
            models: ["mock-empalma-free"],
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
  });
}

test("al caerse un modelo, el repuesto sigue desde donde se quedó", async ({ page }) => {
  await seed(page);

  const cuerpos: { messages?: { role: string; content: unknown }[]; model?: string }[] = [];
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
  await input.fill("Hazme una página");
  await page.getByRole("button", { name: "Enviar mensaje" }).click();

  // 1. La página se termina, y el <h1> solo existe en el trozo que el
  //    repuesto entrega CUANDO se le pide empalmar.
  const marco = page.frameLocator('iframe[title="Vista previa de la página generada"]');
  await expect(marco.locator("h1")).toHaveText("Rescatada", { timeout: 45_000 });

  // 2. Y no empezó de cero: esa es la otra respuesta posible del repuesto.
  await expect(marco.locator("h1")).not.toHaveText("Empezada de cero");

  // 3. La orden de continuar viajó de verdad, y al modelo de repuesto.
  const empalme = cuerpos.filter((c) =>
    c.messages?.some(
      (m) =>
        typeof m.content === "string" &&
        m.content.includes("Tu respuesta anterior se cortó por longitud")
    )
  );
  expect(empalme.length, "se pidió el empalme").toBeGreaterThan(0);
  expect(empalme[0].model, "y se le pidió al modelo de repuesto").toBe("mock-empalma-free");

  // 4. Lo escrito por el modelo caído viaja dentro, para que pueda empalmar.
  const conParcial = empalme[0].messages?.some(
    (m) => m.role === "assistant" && typeof m.content === "string" && m.content.includes('<div class="ca')
  );
  expect(conParcial, "el trabajo a medias no se tiró").toBe(true);
});
