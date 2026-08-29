import { expect, test } from "@playwright/test";

/** El camino por defecto de Prism: el navegador NO habla con el proveedor, habla
 * con /api/proxy y es el servidor quien sale a internet.
 *
 * Ese camino no lo cubría ningún E2E —todos siembran `useProxy: false` para
 * apuntar al mock interno— y por ahí se coló el fallo que en el móvil aparecía
 * como «Failed to fetch» en 0,4 s: el fetch salía contra el proveedor con la
 * cabecera `x-target-url`, que ningún proveedor autoriza en CORS, y el
 * navegador lo cortaba en el preflight.
 *
 * Aquí el proxy se intercepta (el escudo de red bloquea el bucle local a
 * propósito, así que no puede haber un proveedor de mentira de verdad), pero lo
 * que se comprueba es lo que importa: a dónde sale el navegador.
 */
async function seedProxyProvider(page: import("@playwright/test").Page) {
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
        },
        providers: {
          custom: {
            apiKey: "test-key-123",
            baseUrl: "https://api.proveedor-de-prueba.invalid/v1",
            enabled: true,
            models: ["mock-mini-free"],
            // sin useProxy: el valor por defecto, que es el que usa la gente
          },
        },
        version: 1,
      },
      version: 0,
    };
    localStorage.setItem("prism-ai-v1", JSON.stringify(seed));
  });
}

test("el chat sale por /api/proxy y nunca directo al proveedor", async ({ page }) => {
  await seedProxyProvider(page);

  const salidas: string[] = [];
  page.on("request", (r) => {
    const u = r.url();
    if (u.includes("proveedor-de-prueba") || u.includes("/api/proxy")) salidas.push(u);
  });

  await page.route("**/api/proxy*", async (route) => {
    // el proxy tiene que recibir a dónde ir; si no, no habría a quién preguntar
    expect(route.request().headers()["x-target-url"]).toBe(
      "https://api.proveedor-de-prueba.invalid/v1/chat/completions"
    );
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body:
        'data: {"choices":[{"delta":{"content":"Respuesta por el proxy"}}]}\n\n' +
        "data: [DONE]\n\n",
    });
  });

  await page.goto("/");
  const input = page.getByPlaceholder("Escribe tu mensaje…");
  await expect(input).toBeVisible({ timeout: 30_000 });
  await input.fill("Hola");
  await input.press("Enter");

  await expect(page.getByText("Respuesta por el proxy")).toBeVisible({ timeout: 20_000 });

  expect(salidas.some((u) => u.includes("/api/proxy"))).toBe(true);
  expect(salidas.filter((u) => u.includes("proveedor-de-prueba"))).toEqual([]);
});
