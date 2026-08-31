import { expect, test } from "./fixtures";

/** Prism AI — El catálogo de skills.
 *
 * Instalar desde URL ya funcionaba, y con la puerta de permisos delante. Lo
 * que faltaba no era el mecanismo: era el índice, porque había que conocer la
 * URL de memoria.
 *
 * Lo que se comprueba aquí es lo que hace que un catálogo abierto no sea un
 * agujero: elegir una skill **no la instala**. La baja por el mismo camino que
 * una URL pegada a mano, enseña sus permisos, y solo entonces se instala.
 */

async function seed(page: import("@playwright/test").Page) {
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
            providers: {},
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

test("elegir del catálogo enseña los permisos ANTES de instalar, y luego instala", async ({
  page,
}) => {
  await seed(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("textarea").first()).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Skills" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByRole("button", { name: "Catálogo" }).click();

  // el índice se lee y se listan las skills
  await expect(dialogo.getByText("Revisor de accesibilidad")).toBeVisible({ timeout: 20_000 });
  await expect(dialogo.getByText("Descifrador de errores")).toBeVisible();

  // la búsqueda filtra de verdad
  await dialogo.getByLabel("Buscar en el catálogo").fill("errores");
  await expect(dialogo.getByText("Revisor de accesibilidad")).toHaveCount(0);
  await expect(dialogo.getByText("Descifrador de errores")).toBeVisible();

  // elegirla NO la instala: primero se ven los permisos
  await dialogo.getByRole("button", { name: "Ver e instalar" }).first().click();
  const instalar = dialogo.getByRole("button", { name: /^Instalar/ });
  await expect(instalar).toBeVisible({ timeout: 20_000 });

  // y ahora sí
  await instalar.click();
  await expect(dialogo.getByRole("switch", { name: /Activar Descifrador de errores/ })).toBeVisible({
    timeout: 15_000,
  });
});

test("lo ya instalado no se ofrece dos veces", async ({ page }) => {
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
            skills: [
              {
                id: "ya",
                name: "Revisor de accesibilidad",
                description: "",
                icon: "♿",
                instructions: "revisa el contraste",
                enabled: false,
              },
            ],
            settings: { defaultModelKey: null, accessCode: "", agentModes: [], ahorro: false },
            providers: {},
            version: 1,
          },
          version: 0,
        })
      );
    } catch {
      /* frame sin acceso */
    }
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("textarea").first()).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Skills" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByRole("button", { name: "Catálogo" }).click();
  await dialogo.getByLabel("Buscar en el catálogo").fill("accesibilidad");

  await expect(dialogo.getByRole("button", { name: "Ya la tienes" })).toBeDisabled();
});
