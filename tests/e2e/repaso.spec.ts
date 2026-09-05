import { expect, test } from "./fixtures";

/** Prism AI — Modo Repaso: tarjetas de estudio con repetición espaciada.
 *
 * Dos caminos que tienen que funcionar de verdad:
 *
 * 1. ESTUDIAR: con tarjetas vencidas en la biblioteca, el diálogo muestra la
 *    cola, se voltea la tarjeta, se califica, y «otra vez» la devuelve al
 *    final de la cola en vez de dejarla fuera.
 * 2. GUARDAR: cuando una respuesta del modelo trae un bloque ```prism-repaso,
 *    el mensaje ofrece «Guardar repaso», y las tarjetas entran sin pisar a
 *    las que ya existían (duplicados fuera).
 *
 * Se siembra el store propio (`prism-repaso-v1`) como se siembra el principal
 * en el resto de los specs: con las tarjetas ya dentro, nada depende de un
 * modelo en vivo.
 */

const HOY = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
})();

const AYER = (() => {
  const d = new Date(Date.now() - 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
})();

function seedRepaso(tarjetas: unknown[]) {
  return JSON.stringify({ state: { tarjetas }, version: 0 });
}

test("estudia lo vencido: voltea, califica, y «otra vez» vuelve a la cola", async ({ page }) => {
  await page.addInitScript(
    ({ hoy, ayer }: { hoy: string; ayer: string }) => {
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
        // dos vencidas (una de ayer, otra de hoy) y una que aún no toca
        localStorage.setItem(
          "prism-repaso-v1",
          JSON.stringify({
            state: {
              tarjetas: [
                {
                  id: "card-ssrf",
                  frente: "¿Qué es el SSRF?",
                  dorso: "Forjar peticiones desde el servidor hacia la red interna",
                  repeticiones: 2,
                  facilidad: 2.5,
                  intervaloDias: 6,
                  vencimiento: ayer,
                  creada: 1,
                },
                {
                  id: "card-pii",
                  frente: "¿Qué protege el escudo PII?",
                  dorso: "Correos, teléfonos, tarjetas, IBAN y DNI, antes de salir del navegador",
                  repeticiones: 0,
                  facilidad: 2.5,
                  intervaloDias: 0,
                  vencimiento: hoy,
                  creada: 2,
                },
                {
                  id: "card-futura",
                  frente: "Tarjeta que aún no toca",
                  dorso: "No debe salir hoy",
                  repeticiones: 1,
                  facilidad: 2.5,
                  intervaloDias: 6,
                  vencimiento: "2999-01-01",
                  creada: 3,
                },
              ],
            },
            version: 0,
          })
        );
      } catch {
        /* frame sin acceso */
      }
    },
    { hoy: HOY, ayer: AYER }
  );

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("textarea").first()).toBeVisible({ timeout: 30_000 });

  // La barra lateral trae la puerta con la insignia de vencidas
  await page.getByRole("button", { name: /Repaso/ }).click();
  const dialogo = page.getByRole("dialog");

  // Cola de 2: la futura no entra
  await expect(dialogo.getByText(/1\s*\/\s*2/)).toBeVisible();
  await expect(dialogo.getByText("¿Qué es el SSRF?")).toBeVisible();

  await dialogo.getByRole("button", { name: "Mostrar respuesta" }).click();
  await expect(dialogo.getByText(/Forjar peticiones/)).toBeVisible();

  // Bien → mañana; sale de la cola
  await dialogo.getByRole("button", { name: /^Bien/ }).click();

  await expect(dialogo.getByText("¿Qué protege el escudo PII?")).toBeVisible();
  await dialogo.getByRole("button", { name: "Mostrar respuesta" }).click();
  await dialogo.getByRole("button", { name: /^Otra vez/ }).click();

  // «Otra vez» NO la saca: reaparece al final de la cola (3/3)
  await expect(dialogo.getByText(/3\s*\/\s*3/)).toBeVisible();
  await expect(dialogo.getByText("¿Qué protege el escudo PII?")).toBeVisible();
  await dialogo.getByRole("button", { name: "Mostrar respuesta" }).click();
  await dialogo.getByRole("button", { name: /^Bien/ }).click();

  await expect(dialogo.getByText(/Día completado/i)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("guarda el bloque prism-repaso desde el mensaje, sin duplicar", async ({ page }) => {
  const bloque = [
    "Te las resumo en tarjetas:",
    "```prism-repaso",
    '{ "tarjetas": [',
    '  { "frente": "¿Qué hace proxy-budget?", "dorso": "Pone techo a las llamadas de relé del proxy" },',
    '  { "frente": "¿Capital de Perú?", "dorso": "Lima" }',
    "] }",
    "```",
  ].join("\n");

  await page.addInitScript(
    (contenido: string) => {
      try {
        localStorage.setItem("prism-preview-demo", "1");
        const ahora = Date.now();
        localStorage.setItem(
          "prism-ai-v1",
          JSON.stringify({
            state: {
              sessions: [
                {
                  id: "sesion-repaso",
                  title: "Conversación con tarjetas",
                  createdAt: ahora,
                  updatedAt: ahora,
                  messages: [
                    {
                      id: "m1",
                      role: "user",
                      content: "Hazme tarjetas de esta charla",
                      createdAt: ahora,
                    },
                    { id: "m2", role: "assistant", content: contenido, createdAt: ahora + 1 },
                  ],
                },
              ],
              activeSessionId: "sesion-repaso",
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
        // «¿Capital de Perú?» ya existe: es el duplicado que NO debe entrar
        localStorage.setItem(
          "prism-repaso-v1",
          JSON.stringify({
            state: {
              tarjetas: [
                {
                  id: "card-vieja",
                  frente: "¿Capital de Perú?",
                  dorso: "Lima",
                  repeticiones: 1,
                  facilidad: 2.5,
                  intervaloDias: 1,
                  vencimiento: "2999-01-01",
                  creada: 1,
                },
              ],
            },
            version: 0,
          })
        );
      } catch {
        /* frame sin acceso */
      }
    },
    bloque
  );

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("textarea").first()).toBeVisible({ timeout: 30_000 });

  // Los botones de acción del mensaje aparecen al pasar el ratón (escritorio)
  const mensaje = page.getByText("Te las resumo en tarjetas:").first();
  await mensaje.hover({ force: true });
  await page.getByRole("button", { name: "Guardar repaso" }).first().click();

  // 2 propuestas, 1 duplicada: entra una sola
  await expect(page.getByText(/1 tarjeta guardada/)).toBeVisible({ timeout: 10_000 });

  // Y está en la biblioteca junto a la vieja, que conserva su progreso
  await page.getByRole("button", { name: /Repaso/ }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByRole("tab", { name: /Biblioteca/i }).click();
  await expect(dialogo.getByText("¿Qué hace proxy-budget?")).toBeVisible();
  await expect(dialogo.getByText("¿Capital de Perú?")).toBeVisible();
});
