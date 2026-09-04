import { expect, test, type Page } from "./fixtures";
import { TOPE_MINIMO } from "../../src/lib/prism/gasto";

/** Prism AI — El techo de gasto y el veto de proveedores.
 *
 * Con claves gratis, pasarse cuesta un 429. Con una de pago cuesta dinero, y
 * el orquestador multiplica: seis llamadas por encargo. Diez encargos son
 * sesenta llamadas y antes de esto nadie te paraba.
 *
 * Los dos se comprueban donde importa: **en lo que llega al proveedor**, no en
 * lo que dice la pantalla. `streamChat` es el embudo por el que pasan todas
 * las llamadas —chat, failover, panel, ejecutores— y ahí es donde se cortan.
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
              // «mock-paid-pro» no lleva «-free»: cuenta como modelo de pago,
              // que es lo único que el techo mira
              defaultModelKey: "custom::mock-paid-pro",
              accessCode: "",
              agentModes: [],
              agentMode: false,
              ahorro: false,
              stream: false,
              piiShield: false,
              onlyFree: false,
              ...over,
            },
            providers: {
              custom: {
                apiKey: "test-key-123",
                baseUrl: "/api/mock-llm",
                enabled: true,
                models: ["mock-paid-pro"],
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
  }, over);
}

async function enviar(page: Page, texto: string) {
  // Dos esperas, por dos motivos distintos:
  //  · que la anterior haya TERMINADO —escribir mientras se genera deja el
  //    texto puesto y el clic sin efecto;
  //  · los 350 ms de la guarda anti doble clic de `send()`. Con el mock
  //    respondiendo en 0,1 s, dos envíos seguidos caen dentro de esa ventana
  //    y el segundo se descarta en silencio: la prueba fallaría por la
  //    guarda, no por el techo.
  await expect(page.getByRole("button", { name: "Detener generación" })).toHaveCount(0, {
    timeout: 60_000,
  });
  await page.waitForTimeout(400);
  const input = page.locator("textarea").first();
  await expect(input).toBeVisible({ timeout: 30_000 });
  await input.fill(texto);
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(input).toHaveValue("", { timeout: 30_000 });
}

/** Deja el contador de pago justo en el techo, contando lo que sale de verdad.
 *
 * El techo se pide al mínimo que la app admite: `normalizarTope` sube
 * cualquier valor menor, así que un «tope: 1» en el seed no probaría el techo
 * sino el saneado —y pasaría verde con el techo roto. */
async function agotarTecho(page: Page, peticiones: string[]) {
  for (let i = 1; i <= TOPE_MINIMO; i++) {
    await enviar(page, `pregunta ${i}`);
    await expect.poll(() => peticiones.length, { timeout: 60_000 }).toBe(i);
  }
}

function espiarPeticiones(page: Page): string[] {
  const peticiones: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/api/mock-llm/")) peticiones.push(r.url());
  });
  return peticiones;
}

test("agotado el techo, la siguiente llamada de pago no sale de la app", async ({ page }) => {
  test.setTimeout(180_000);
  // Lo que se mira es lo que llega al proveedor, no el mensaje de la pantalla.
  await seed(page, { topeLlamadasPago: TOPE_MINIMO });
  const peticiones = espiarPeticiones(page);
  await page.goto("/");

  await agotarTecho(page, peticiones);

  await enviar(page, "una de más");
  await expect(page.locator("main")).toContainText(
    `techo de ${TOPE_MINIMO} llamadas de pago`,
    { timeout: 60_000 }
  );
  // y no hubo una petición más: se cortó ANTES de salir
  expect(peticiones.length, "la de más no debe haber salido").toBe(TOPE_MINIMO);
});

test("el mensaje dice que el límite es TUYO, no del proveedor", async ({ page }) => {
  test.setTimeout(180_000);
  // Sin eso, el usuario culpa a su proveedor y se pone a cambiar de clave.
  await seed(page, { topeLlamadasPago: TOPE_MINIMO });
  const peticiones = espiarPeticiones(page);
  await page.goto("/");
  await agotarTecho(page, peticiones);
  await enviar(page, "una de más");
  const main = page.locator("main");
  await expect(main).toContainText("límite TUYO", { timeout: 60_000 });
  await expect(main).toContainText("Ajustes");
  await expect(main, "sin inventar un importe").not.toContainText("$");
});

test("un modelo GRATIS no se ve frenado por el techo", async ({ page }) => {
  // Un techo que corta también lo gratis molesta sin proteger nada.
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
              defaultModelKey: "custom::mock-mini-free",
              accessCode: "",
              agentModes: [],
              agentMode: false,
              ahorro: false,
              stream: false,
              piiShield: false,
              // techo a 1, y aun así lo gratis pasa
              topeLlamadasPago: 1,
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
      /* marco sin acceso */
    }
  });
  const peticiones: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/api/mock-llm/")) peticiones.push(r.url());
  });
  await page.goto("/");
  await enviar(page, "una");
  await expect.poll(() => peticiones.length, { timeout: 60_000 }).toBe(1);
  await enviar(page, "dos");
  await expect.poll(() => peticiones.length, { timeout: 60_000 }).toBe(2);
  await expect(page.locator("main")).not.toContainText("techo de");
});

test("un proveedor vetado no recibe NADA, aunque tenga clave y esté encendido", async ({ page }) => {
  await seed(page, { proveedoresVetados: ["custom"] });
  const peticiones: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/api/mock-llm/")) peticiones.push(r.url());
  });
  await page.goto("/");
  await enviar(page, "hola");

  await expect(page.locator("main")).toContainText("está vetado", { timeout: 60_000 });
  await expect(page.locator("main")).toContainText("tú decidiste");
  expect(peticiones.length, "ni una petición").toBe(0);
});
