import { expect, test } from "@playwright/test";

/** En una pantalla táctil no existe «pasar el ratón por encima».
 *
 * Varios controles de la app se pintaban con `opacity-0 group-hover:opacity-100`,
 * así que en el móvil eran invisibles: no había forma de borrar una conversación
 * —que es lo que se reportó—, ni de copiar o regenerar un mensaje, ni de quitar
 * un modelo de la lista.
 *
 * Este archivo emula un móvil de verdad (`isMobile`, que hace que `(hover: none)`
 * coincida) en lugar de solo estrechar la ventana, que no cambia el puntero.
 */
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const CONV = [
  { id: "s-uno", titulo: "Conversación uno" },
  { id: "s-dos", titulo: "Conversación dos" },
];

async function seedConversaciones(page: import("@playwright/test").Page) {
  await page.addInitScript((convs) => {
    const seed = {
      state: {
        sessions: convs.map((c, i) => ({
          id: c.id,
          title: c.titulo,
          createdAt: 1000 + i,
          updatedAt: 1000 + i,
          messages: [
            { id: `${c.id}-u`, role: "user", content: "hola", createdAt: 1 },
            { id: `${c.id}-a`, role: "assistant", content: "qué tal", createdAt: 2 },
          ],
        })),
        activeSessionId: convs[0].id,
        onboardingDone: true,
        favorites: [],
        radarSeenIds: [],
        settings: {
          defaultModelKey: "custom::mock-mini-free",
          systemPrompt: "x",
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
            apiKey: "k",
            baseUrl: "/api/mock-llm",
            enabled: true,
            models: ["mock-mini-free"],
            useProxy: false,
          },
        },
        version: 1,
      },
      version: 0,
    };
    // solo la primera vez: `addInitScript` corre también al recargar, y volver a
    // sembrar resucitaría lo borrado y haría pasar el test por el motivo malo
    if (!localStorage.getItem("prism-ai-v1")) {
      localStorage.setItem("prism-ai-v1", JSON.stringify(seed));
    }
  }, CONV);
}

test.beforeEach(async ({ page }) => {
  await seedConversaciones(page);
});

test("se puede borrar una conversación desde el móvil", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Abrir conversaciones").click();

  // hay dos barras laterales en el DOM (la fija de escritorio, oculta a este
  // ancho, y la del panel deslizante); se mira solo la que el móvil ve
  const lista = page.getByRole("dialog").getByRole("listitem");
  const fila = lista.filter({ hasText: "Conversación dos" });
  await expect(fila).toBeVisible();

  // el punto del fallo: el botón de opciones tiene que VERSE, no solo existir
  const opciones = fila.getByLabel("Opciones de conversación");
  await expect(opciones).toBeVisible();
  console.log("DEPURA", JSON.stringify(await opciones.evaluate((el) => ({
    clases: el.className,
    opacity: getComputedStyle(el).opacity,
    hoverNone: matchMedia("(hover: none)").matches,
    reglas: [...document.styleSheets].flatMap((sh) => { try { return [...sh.cssRules].map((r) => r.cssText); } catch { return []; } }).filter((t) => t.includes("touch-actions")),
  }))));
  await expect(opciones).toHaveCSS("opacity", "1");

  await opciones.click();
  await page.getByRole("menuitem", { name: "Eliminar" }).click();

  await expect(lista.filter({ hasText: "Conversación dos" })).toHaveCount(0);
  await expect(lista.filter({ hasText: "Conversación uno" })).toHaveCount(1);
  // y el borrado persiste: no vuelve al recargar
  await page.reload();
  await page.getByLabel("Abrir conversaciones").click();
  await expect(page.getByRole("dialog").getByRole("listitem")).toHaveCount(1);
});

test("las acciones de un mensaje se ven sin pasar el ratón", async ({ page }) => {
  await page.goto("/");
  const copiar = page.getByLabel("Copiar").first();
  await expect(copiar).toBeVisible({ timeout: 30_000 });
  await expect(copiar).toHaveCSS("opacity", "1");
});
