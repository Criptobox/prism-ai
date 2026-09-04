import { expect, test, type Page } from "./fixtures";

/** Prism AI — Un director reparte, varios ejecutan, el director cierra.
 *
 * De `PLAN-EVOLUCION.md` §5. Se había descartado con el argumento de que los
 * modelos gratis fallan en cadenas largas. El argumento estaba incompleto:
 * falla si TODA la cadena es gratis. Con el director de pago y los ejecutores
 * gratis, el que razona y verifica es el bueno.
 *
 * Lo que se comprueba aquí es lo que hace usable la pieza con dinero de por
 * medio: que el número de llamadas se diga ANTES, que cada ejecutor reciba
 * SOLO su trozo, y que un encargo mínimo no gaste seis llamadas.
 */

async function seed(page: Page) {
  await page.addInitScript(() => {
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
              // el director es el modelo elegido: en la vida real, el bueno
              defaultModelKey: "custom::mock-director",
              accessCode: "",
              agentModes: [],
              agentMode: false,
              ahorro: false,
              stream: false,
              piiShield: false,
              onlyFree: false,
            },
            providers: {
              custom: {
                apiKey: "test-key-123",
                baseUrl: "/api/mock-llm",
                enabled: true,
                models: ["mock-director"],
                useProxy: false,
              },
              // Los ejecutores salen de OTROS proveedores, y gratis. Hacen
              // falta tres distintos: `pickPanel` coge como mucho uno por
              // proveedor, porque tres modelos de la misma casa comparten
              // sesgos y límite de peticiones.
              openrouter: {
                apiKey: "test-key-123",
                baseUrl: "/api/mock-llm",
                enabled: true,
                models: ["mock-obrero:free"],
                useProxy: false,
              },
              groq: {
                apiKey: "test-key-123",
                baseUrl: "/api/mock-llm",
                enabled: true,
                models: ["mock-obrero-free"],
                useProxy: false,
              },
              // aihubmix y no gemini: el mock-llm habla el protocolo de
              // OpenAI, y Gemini usa otro. Un ejecutor que no responde no es
              // lo que se prueba aquí.
              aihubmix: {
                apiKey: "test-key-123",
                baseUrl: "/api/mock-llm",
                enabled: true,
                models: ["mock-obrero-free"],
                useProxy: false,
              },
            },
            version: 1,
          },
          version: 0,
        })
      );
    } catch {
      /* marco sin acceso */
    }
  });
}

/** Un comando slash se ELIGE del menú, no se envía como mensaje. */
async function lanzarComando(page: Page, cmd: string) {
  const compositor = page.locator("textarea").first();
  await expect(compositor).toBeVisible({ timeout: 30_000 });
  await compositor.fill(cmd);
  const opcion = page.getByRole("option").filter({ hasText: cmd }).first();
  await expect(opcion).toBeVisible({ timeout: 10_000 });
  await opcion.click();
}

async function escribir(page: Page, texto: string) {
  const input = page.locator("textarea").first();
  await expect(input).toBeVisible({ timeout: 30_000 });
  await input.fill(texto);
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
}

test("el director reparte, cada ejecutor recibe SOLO su trozo, y el director cierra", async ({
  page,
}) => {
  await seed(page);
  const cuerpos: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/api/mock-llm/")) {
      cuerpos.push(r.postData() ?? "");
    }
  });
  await page.goto("/");

  await lanzarComando(page, "/orquesta");
  await expect(page.getByText("Modo director armado")).toBeVisible({ timeout: 20_000 });

  await escribir(page, "hazme una landing de cafetería con menú, precios y formulario de contacto");

  const main = page.locator("main");
  await expect(main).toContainText("VEREDICTO DEL DIRECTOR", { timeout: 90_000 });

  // el veredicto vio lo que entregó cada ejecutor, y cada uno hizo SU trozo
  await expect(main).toContainText("hecho:HTML");
  await expect(main).toContainText("hecho:CSS");
  await expect(main).toContainText("hecho:JS");

  // Compartimentación: el prompt de un ejecutor NO lleva la conversación ni
  // los trozos de los demás. Es lo que evita que tu historial acabe repartido
  // entre varios proveedores porque sí.
  const deEjecutores = cuerpos.filter((c) => c.includes("<tu-encargo"));
  expect(deEjecutores.length, "hubo llamadas a ejecutores").toBeGreaterThan(0);
  for (const c of deEjecutores) {
    expect(c, "un ejecutor no ve el encargo original completo").not.toContain("formulario de contacto");
    expect(c, "ni los trozos de los demás").not.toContain("<trozo");
  }
});

test("dice cuántas llamadas va a costar ANTES de arrancar", async ({ page }) => {
  // Con dinero de por medio, saberlo después no sirve de nada.
  await seed(page);
  await page.goto("/");
  await lanzarComando(page, "/orquesta");
  await expect(page.getByText("Modo director armado")).toBeVisible({ timeout: 20_000 });
  await escribir(page, "hazme una landing de cafetería con menú, precios y formulario de contacto");

  await expect(page.getByText(/llamadas en total/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/No hay más rondas/)).toBeVisible();
});

test("la respuesta enseña lo que costó el equipo", async ({ page }) => {
  await seed(page);
  await page.goto("/");
  await lanzarComando(page, "/orquesta");
  await expect(page.getByText("Modo director armado")).toBeVisible({ timeout: 20_000 });
  await escribir(page, "hazme una landing de cafetería con menú, precios y formulario de contacto");

  await expect(page.locator("main")).toContainText("VEREDICTO DEL DIRECTOR", { timeout: 90_000 });
  await expect(page.getByText(/equipo 3\/3 · 5 llamadas/)).toBeVisible();
});

test("un encargo mínimo NO gasta seis llamadas", async ({ page }) => {
  // Repartir «gracias» costaría dos llamadas del modelo que pagas para no
  // ganar nada.
  await seed(page);
  const cuerpos: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/api/mock-llm/")) {
      cuerpos.push(r.postData() ?? "");
    }
  });
  await page.goto("/");

  await lanzarComando(page, "/orquesta");
  await expect(page.getByText("Modo director armado")).toBeVisible({ timeout: 20_000 });
  await escribir(page, "gracias");

  await expect(page.getByText(/demasiado corto para repartirlo/)).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(() => cuerpos.filter((c) => c.includes("partir el encargo")).length, { timeout: 15_000 })
    .toBe(0);
});
