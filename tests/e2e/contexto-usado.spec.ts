import { expect, test, type Page } from "./fixtures";

/** Prism AI — «Auto Context»: se ve qué contexto viajó con tu mensaje.
 *
 * Idea de `PLAN-EVOLUCION.md` §12. Cada turno se manda mucho más que lo que
 * escribes —el mapa del proyecto, tus notas, las reglas «no tocar», las skills
 * activas, N mensajes de historial— y nada de eso se veía: escribías una
 * línea, recibías una respuesta rara, y no había forma de saber que el modelo
 * estaba leyendo doce archivos y tres decisiones viejas.
 *
 * Se enseña lo que SE USÓ, no lo que hay guardado: es la diferencia entre un
 * dato y una estimación.
 */

async function seed(page: Page, conProyecto: boolean) {
  await page.addInitScript(
    ({ conProyecto }: { conProyecto: boolean }) => {
      if (window.top !== window.self) return;
      try {
        localStorage.setItem(
          "prism-ai-v1",
          JSON.stringify({
            state: {
              sessions: [
                {
                  id: "s-ctx-1",
                  title: "Sesión",
                  createdAt: Date.now() - 600_000,
                  updatedAt: Date.now() - 60_000,
                  messages: [],
                  ...(conProyecto
                    ? {
                        projectMap: {
                          name: "Cafetería Prima",
                          description: "Landing",
                          files: [
                            { name: "index.html", kind: "html", summary: "portada", features: [], tech: [] },
                            { name: "estilos.css", kind: "css", summary: "estilos", features: [], tech: [] },
                          ],
                          features: ["hero"],
                          notes: ["la paleta es cálida", "el gradiente se descartó"],
                          updatedAt: Date.now(),
                        },
                        reglasNo: [
                          { id: "r1", patron: "Header.tsx", motivo: "aprobado", creadaEl: Date.now() },
                        ],
                      }
                    : {}),
                },
              ],
              activeSessionId: "s-ctx-1",
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
    },
    { conProyecto }
  );
}

async function enviar(page: Page, texto: string) {
  const input = page.locator("textarea").first();
  await expect(input).toBeVisible({ timeout: 30_000 });
  await input.fill(texto);
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
}

test("con proyecto, dice qué viajó y al pulsarlo NOMBRA los archivos", async ({ page }) => {
  await seed(page, true);
  await page.goto("/");
  await enviar(page, "mejora el hero");

  const chip = page.getByRole("button", { name: /^ctx / });
  await expect(chip).toBeVisible({ timeout: 60_000 });
  // el resumen: lo que de verdad entró en el prompt
  await expect(chip).toContainText("2 archivos");
  await expect(chip).toContainText("2 notas");
  await expect(chip).toContainText("1 regla");

  // y el desglose con los nombres: saber «2 archivos» no sirve de nada
  await expect(chip).toHaveAttribute("aria-expanded", "false");
  await chip.click();
  await expect(chip).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText(/index\.html, estilos\.css/)).toBeVisible();
  await expect(page.getByText(/1 regla\(s\) «no tocar»/)).toBeVisible();
});

test("sin nada del proyecto NO sale el chip: un aviso constante deja de leerse", async ({
  page,
}) => {
  // El otro lado: si saliera en todas las respuestas diciendo «0 archivos»,
  // la gente lo ignoraría en dos días y tampoco lo miraría cuando importa.
  await seed(page, false);
  await page.goto("/");
  await enviar(page, "hola qué tal");

  // la respuesta llega…
  await expect(page.locator("main").getByText(/Prism|respuesta|Hola/i).first()).toBeVisible({
    timeout: 60_000,
  });
  // …y no hay chip
  await expect(page.getByRole("button", { name: /^ctx / })).toHaveCount(0);
});
