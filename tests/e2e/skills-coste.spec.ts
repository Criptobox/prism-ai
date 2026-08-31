import { expect, test } from "./fixtures";

/** Prism AI — El precio de una skill, al lado del interruptor que lo cobra.
 *
 * Una skill activa mete su texto en el prompt de CADA mensaje. Hasta la
 * v3.19 eso no se veía en ninguna parte: podías tener cinco activas
 * comiéndose el contexto sin enterarte. El desglose completo vive en
 * Ajustes → Chat; aquí se enseña la parte que se decide en esta pantalla.
 */

test("cada skill enseña lo que añade, y el total de las activas", async ({ page }) => {
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
                id: "skill-a",
                name: "Primera",
                description: "una",
                icon: "🧩",
                // 21 car. de cabecera («### Skill activa: Primera\n») + 100
                instructions: "x".repeat(100),
                enabled: true,
              },
              {
                id: "skill-b",
                name: "Segunda",
                description: "otra",
                icon: "🧪",
                instructions: "y".repeat(50),
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

  // «### Skill activa: Primera\n» son 27 caracteres + 100 de instrucciones
  const costeA = "### Skill activa: Primera\n".length + 100;
  const costeB = "### Skill activa: Segunda\n".length + 50;
  await expect(dialogo.getByText(`+${costeA}`, { exact: true })).toBeVisible();
  await expect(dialogo.getByText(`+${costeB}`, { exact: true })).toBeVisible();

  // el total cuenta SOLO la activa
  await expect(dialogo.getByText(`+${costeA} car./mensaje`)).toBeVisible();

  // y al activar la segunda, el total sube por las dos
  await dialogo.getByRole("switch", { name: "Activar Segunda" }).click();
  await expect(dialogo.getByText(`+${costeA + costeB} car./mensaje`)).toBeVisible();
});
