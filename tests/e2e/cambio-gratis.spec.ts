import { expect, test } from "./fixtures";

/** Prism AI — Tarea 1 del plan V6: avisar cuando un modelo deja de ser gratis.
 *
 * `isFreeModel` es una heurística estática: nada vigilaba el cambio. Ahora el
 * radar guarda una FOTO de lo que era gratis la última vez que miraste y, al
 * volver, compara. Este E2E entra con una foto preparada y comprueba que la
 * mala noticia (quién dejó de ser gratis) sale arriba, con el nombre del
 * modelo, y distinta de «desapareció del catálogo».
 */

const HACE_UNA_SEMANA = Date.now() - 7 * 86_400_000;

/** Foto preparada: en su día eran gratis mock-mini-free (sigue siéndolo),
 * mock-paid-pro (hoy el catálogo lo true pero ya no pasa la heurística) y
 * mock-fantasma-free (ya ni está en el catálogo del mock). */
async function seedConFoto(page: import("@playwright/test").Page) {
  await page.addInitScript((fecha) => {
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
            settings: { defaultModelKey: null, accessCode: "", agentModes: [], ahorro: false },
            providers: {
              custom: {
                apiKey: "test-key-123",
                baseUrl: "/api/mock-llm",
                enabled: true,
                models: ["mock-mini-free"],
                useProxy: false,
              },
            },
            fotoGratis: {
              fecha,
              gratisPorProveedor: {
                custom: ["mock-mini-free", "mock-paid-pro", "mock-fantasma-free"],
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
  }, HACE_UNA_SEMANA);
}

/** Igual que el anterior pero SIN foto: la primera vez no hay aviso. */
async function seedSinFoto(page: import("@playwright/test").Page) {
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
            settings: { defaultModelKey: null, accessCode: "", agentModes: [], ahorro: false },
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
      /* frame sin acceso */
    }
  });
}

test("el radar avisa de los modelos que dejaron de ser gratis desde la última foto", async ({
  page,
}) => {
  await seedConFoto(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("textarea").first()).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Radar" }).click();
  const dialogo = page.getByRole("dialog");

  // la sección de cambios existe y dice la fecha de la foto que se tiene
  const seccion = dialogo.locator('section[aria-label="Cambios desde la última foto"]');
  await expect(seccion).toBeVisible({ timeout: 20_000 });

  // la mala noticia sale con el nombre del modelo
  const filaMala = seccion.locator("li", { hasText: "mock-paid-pro" });
  await expect(filaMala).toBeVisible();
  await expect(filaMala.getByText("ya no es gratis")).toBeVisible();

  // y desaparecer NO es lo mismo que dejar de ser gratis: el fantasma tiene
  // su propia fila con su propia frase
  const filaFuera = seccion.locator("li", { hasText: "mock-fantasma-free" });
  await expect(filaFuera).toBeVisible();
  await expect(filaFuera.getByText("desapareció del catálogo")).toBeVisible();

  // el que sigue gratis no aparece en la lista de bajas
  await expect(seccion.locator("li", { hasText: "mock-mini-free" })).toHaveCount(0);

  // la fecha que se enseña es la de la foto guardada, no una antigüedad inventada.
  // Va en el resumen bajo el título (no en el h3): ahí es donde están también
  // los totales SIN recortar a los que apunta la nota de recorte.
  await expect(seccion.locator("h3")).toContainText("Cambios desde la última foto");
  await expect(seccion).toContainText(/Cambios desde la foto del \d{1,2}\/\d{1,2}\/\d{4}/);

  // y el resumen cuenta los totales, no lo que quepa en la lista
  await expect(seccion).toContainText("1 modelo dejó de ser gratis");
  await expect(seccion).toContainText("1 desapareció del catálogo");
});

test("la primera vez no hay aviso: se guarda la foto y ya", async ({ page }) => {
  await seedSinFoto(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("textarea").first()).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Radar" }).click();
  const dialogo = page.getByRole("dialog");

  // sin foto anterior no se enseña ni la sección ni un «0 modelos dejaron de ser gratis»
  await expect(dialogo.getByText("Nuevo para ti")).toBeVisible({ timeout: 20_000 });
  await expect(dialogo.locator('section[aria-label="Cambios desde la última foto"]')).toHaveCount(0);
  await expect(dialogo.getByText(/dejaron? de ser gratis/)).toHaveCount(0);

  // y la foto de hoy queda guardada para la próxima visita
  const guardada = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem("prism-ai-v1");
      if (!raw) return null;
      return (JSON.parse(raw) as { state?: { fotoGratis?: unknown } }).state?.fotoGratis ?? null;
    } catch {
      return null;
    }
  });
  expect(guardada, "la foto persiste en el store tras la primera visita").not.toBeNull();
  const foto = guardada as { fecha: number; gratisPorProveedor: Record<string, string[]> };
  expect(foto.fecha).toBeGreaterThan(0);
  // del catálogo del mock se quedan solo los gratis (mock-paid-pro no entra)
  expect(foto.gratisPorProveedor.custom).toContain("mock-mini-free");
  expect(foto.gratisPorProveedor.custom).not.toContain("mock-paid-pro");
});
