import { expect, test, type Page } from "./fixtures";

/** Prism AI — Permisos del agente: se ven, se apagan y se cumplen.
 *
 * El catálogo llevaba versiones diciendo «dale permiso en
 * `tool-permissions.ts`» y ese archivo no existía. Y la propuesta de v3.36
 * pintaba un panel de permisos por herramienta con interruptor, apoyándose en
 * `skill-permissions.ts`, que analiza el texto en prosa de una skill antes de
 * instalarla — otra cosa.
 *
 * Aquí se prueba lo único que convierte un permiso en un permiso: que
 * apagarlo **cambia lo que el agente puede hacer de verdad**. El modelo
 * simulado `mock-lee-url` pide `read_url` siempre; con «Salir a internet»
 * apagado, la llamada tiene que quedarse en el rechazo.
 */

const MODEL_ID = "mock-lee-url";

async function seed(page: Page) {
  await page.addInitScript((model: string) => {
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
              defaultModelKey: `custom::${model}`,
              accessCode: "",
              agentModes: [],
              agentMode: true,
              agentMaxLoops: 3,
              ahorro: false,
              stream: false,
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
        })
      );
    } catch {
      /* frame sin acceso */
    }
  }, MODEL_ID);
}

async function abrirPermisos(page: Page) {
  await page.getByRole("button", { name: "Ajustes" }).first().click();
  await page.getByRole("tab", { name: /chat/i }).click();
  await expect(page.getByText("Permisos del agente")).toBeVisible();
}

test("el panel dice qué cubre cada permiso, sacado del catálogo real", async ({ page }) => {
  await seed(page);
  await page.goto("/");
  await expect(page.locator("textarea").first()).toBeVisible({ timeout: 30_000 });
  await abrirPermisos(page);

  // Los cuatro efectos, con su explicación
  for (const label of ["Leer el proyecto", "Escribir en el proyecto", "Ejecutar código", "Salir a internet"]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  // Y qué herramientas cubre cada uno, por su nombre
  await expect(page.getByText(/3 herramientas: fetch_api, read_url, search_web/)).toBeVisible();
});

test("apagar «Salir a internet» avisa de lo que el agente pierde", async ({ page }) => {
  await seed(page);
  await page.goto("/");
  await expect(page.locator("textarea").first()).toBeVisible({ timeout: 30_000 });
  await abrirPermisos(page);

  // sin nada apagado no hay aviso
  await expect(page.getByText(/el agente se queda sin/i)).toHaveCount(0);

  await page.getByRole("switch", { name: "Salir a internet" }).click();
  const aviso = page.getByText(/el agente se queda sin/i);
  await expect(aviso).toBeVisible();
  await expect(aviso).toContainText("3 herramientas");
  await expect(aviso).toContainText("read_url");
});

test("con el permiso apagado, la herramienta NO se ejecuta y el modelo sabe por qué", async ({ page }) => {
  await seed(page);
  await page.goto("/");
  await expect(page.locator("textarea").first()).toBeVisible({ timeout: 30_000 });

  // ——— Se apaga «Salir a internet» y se cierra Ajustes
  await abrirPermisos(page);
  await page.getByRole("switch", { name: "Salir a internet" }).click();
  await page.keyboard.press("Escape");

  // ——— El catálogo que viaja al modelo ya no incluye las de red (1.ª capa)
  const cuerpos: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/api/mock-llm/")) {
      cuerpos.push(r.postData() ?? "");
    }
  });

  const input = page.locator("textarea").first();
  await input.fill("léeme esa página");
  await page.getByRole("button", { name: "Enviar mensaje" }).click();

  await expect.poll(() => cuerpos.length, { timeout: 60_000 }).toBeGreaterThanOrEqual(2);
  // TODAS las peticiones que lleven catálogo, incluida la del probe: el probe
  // también manda la lista de herramientas al proveedor, y describirle ahí lo
  // que el usuario apagó sería mandar fuera una capacidad que decidió no usar.
  const catalogos = cuerpos
    .map((c) => JSON.parse(c) as { tools?: Array<{ function?: { name: string } }> })
    .filter((b) => Array.isArray(b.tools))
    .map((b) => (b.tools ?? []).map((t) => t.function?.name));
  expect(catalogos.length, "alguna petición tiene que llevar catálogo").toBeGreaterThan(0);
  for (const nombres of catalogos) {
    expect(nombres, "read_url ni se le ofrece, tampoco en el probe").not.toContain("read_url");
    expect(nombres, "lo permitido sigue ahí").toContain("list_files");
  }

  // ——— Y si aun así la pide, se rechaza antes de salir a la red (2.ª capa).
  //     `mock-lee-url` pide `read_url` pase lo que pase, así que este es el
  //     caso real: el modelo llama a algo que no se le ofreció.
  await expect(page.locator("main")).toContainText("Salir a internet", { timeout: 60_000 });
  await expect(page.locator("main")).toContainText("read_url");
});
