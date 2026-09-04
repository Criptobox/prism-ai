import { expect, test, type Page } from "./fixtures";

/** Prism AI — La caché del prompt en el camino de Anthropic.
 *
 * Lo que se comprueba es **lo que sale de la app**, leyendo el cuerpo real de
 * la petición: que el prompt de sistema viaja como bloque con corte, que el
 * historial lleva sus cortes, y que la compresión se apaga sola —porque
 * reescribir el historial rompería la caché—. Y de vuelta, que el panel enseña
 * la cuenta del PROVEEDOR y no una estimación nuestra.
 */

async function seed(page: Page, over: Record<string, unknown> = {}) {
  await page.addInitScript((over: Record<string, unknown>) => {
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
              defaultModelKey: "anthropic::claude-opus-5",
              accessCode: "",
              agentModes: [],
              agentMode: false,
              ahorro: false,
              stream: false,
              piiShield: false,
              onlyFree: false,
              systemPrompt: "Eres Prism AI. Responde en español.",
              ...over,
            },
            providers: {
              anthropic: {
                apiKey: "test-key-123",
                baseUrl: "/api/mock-llm",
                enabled: true,
                models: ["claude-opus-5"],
                useProxy: false,
              },
            },
            version: 1,
          },
          version: 0,
        })
      );
      localStorage.removeItem("prism-usage-v1");
    } catch {
      /* marco sin acceso */
    }
  }, over);
}

async function enviar(page: Page, texto: string) {
  await expect(page.getByRole("button", { name: "Detener generación" })).toHaveCount(0, {
    timeout: 60_000,
  });
  await page.waitForTimeout(400); // guarda anti doble clic de send()
  const input = page.locator("textarea").first();
  await expect(input).toBeVisible({ timeout: 30_000 });
  await input.fill(texto);
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(input).toHaveValue("", { timeout: 30_000 });
}

/** Los cuerpos de las peticiones que salen hacia el proveedor. */
function espiarCuerpos(page: Page): Record<string, unknown>[] {
  const cuerpos: Record<string, unknown>[] = [];
  page.on("request", (r) => {
    if (r.method() !== "POST" || !r.url().includes("/api/mock-llm/")) return;
    try {
      cuerpos.push(JSON.parse(r.postData() ?? "{}"));
    } catch {
      /* cuerpo no JSON: no es de los nuestros */
    }
  });
  return cuerpos;
}

async function abrirPanel(page: Page) {
  const menu = page.getByRole("button", { name: /^Abrir conversaciones/ });
  if (await menu.isVisible().catch(() => false)) await menu.click();
  await page.getByRole("button", { name: "Panel", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Panel del sistema", { timeout: 20_000 });
}

test("el prompt de sistema sale como bloque con corte de caché", async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page);
  const cuerpos = espiarCuerpos(page);
  await page.goto("/");
  await enviar(page, "hola");

  await expect.poll(() => cuerpos.length, { timeout: 60_000 }).toBe(1);
  const body = cuerpos[0] as { system?: unknown };
  // no una cadena suelta: una lista de bloques, y el último marcado
  expect(Array.isArray(body.system), "el sistema viaja como bloques").toBe(true);
  const bloques = body.system as Record<string, unknown>[];
  expect(bloques[bloques.length - 1]).toMatchObject({
    type: "text",
    cache_control: { type: "ephemeral" },
  });
});

test("el historial lleva sus cortes, y nunca más de los que admite la API", async ({ page }) => {
  test.setTimeout(180_000);
  await seed(page);
  const cuerpos = espiarCuerpos(page);
  await page.goto("/");
  await enviar(page, "primera");
  await expect.poll(() => cuerpos.length, { timeout: 60_000 }).toBe(1);
  await enviar(page, "segunda");
  await expect.poll(() => cuerpos.length, { timeout: 60_000 }).toBe(2);

  const body = cuerpos[1] as { messages?: { content?: unknown }[]; system?: unknown };
  const marcados = (body.messages ?? []).filter((m) =>
    JSON.stringify(m.content ?? "").includes("cache_control")
  );
  expect(marcados.length, "el historial lleva cortes").toBeGreaterThan(0);
  // el tope de la API es 4 en total, contando el del sistema
  const total = (JSON.stringify(body).match(/"cache_control"/g) ?? []).length;
  expect(total, "sin pasarse del máximo de la API").toBeLessThanOrEqual(4);
});

test("con Anthropic la compresión se apaga sola: el historial viaja intacto", async ({ page }) => {
  test.setTimeout(180_000);
  // «standard» reescribe los mensajes viejos del asistente. Con caché eso es
  // un mal negocio, así que la app lo apaga — y aquí se comprueba en el cuerpo
  // que sale, no en la pantalla.
  await seed(page, { compression: "standard" });
  const cuerpos = espiarCuerpos(page);
  await page.goto("/");
  // Más de 120 caracteres A PROPÓSITO: por debajo de ese umbral la compresión
  // ni entra, y la prueba pasaría en verde con el arreglo puesto o quitado.
  await enviar(
    page,
    "primera pregunta larga con     espacios     de     sobra que hay que dejar " +
      "intactos porque comprimirlos rompería la caché del prompt y eso sale mucho " +
      "más caro que lo que se ahorra"
  );
  await expect.poll(() => cuerpos.length, { timeout: 60_000 }).toBe(1);
  await enviar(page, "segunda");
  await expect.poll(() => cuerpos.length, { timeout: 60_000 }).toBe(2);

  const body = cuerpos[1] as { messages?: { role: string; content: unknown }[] };
  const texto = JSON.stringify(body.messages ?? []);
  // la respuesta del mock viaja tal cual: si se hubiera comprimido, los
  // dobles espacios y los saltos habrían desaparecido
  expect(texto).toContain("espacios     de     sobra");
  expect(texto, "ni un ⟪repetido⟫ del deduplicador").not.toContain("⟪repetido⟫");
});

test("el panel enseña la cuenta del proveedor, no nuestra estimación", async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page);
  await page.goto("/");
  await enviar(page, "hola");
  await abrirPanel(page);

  const dialogo = page.getByRole("dialog");
  await expect(dialogo).toContainText("La cuenta del proveedor");
  // el mock devuelve 880 de caché contra 120 de entrada nueva → 88 %
  await expect(dialogo).toContainText("88%");
  await expect(dialogo).toContainText("del prompt servido desde la caché");
  // Desde la v3.50 SÍ hay importes, pero solo con las dos mitades: los tokens
  // de arriba (los dice el proveedor) por un precio con fuente. Lo que no
  // puede pasar nunca es un importe suelto, sin decir de dónde sale.
  const texto = (await dialogo.innerText()).replace(/\s+/g, " ");
  const hayImporte = /\d+,\d+ \$/.test(texto);
  expect(hayImporte, "con tokens y catálogo, hay importe").toBe(true);
  expect(texto, "y nunca sin su fuente").toContain("LiteLLM");
  expect(texto).toContain("instantánea del");
});
