import { expect, test } from "./fixtures";

/** Prism AI — Una imagen mandada una vez no viaja en todas las peticiones.
 *
 * El fallo, reportado con captura: escribías «Hola», sin adjuntar nada, y
 * OpenRouter contestaba «404: No endpoints found that support image input».
 * La imagen de un mensaje anterior seguía pegada al historial y el historial
 * se reenvía entero en cada turno, así que el modelo de texto recibía la foto.
 *
 * No basta con mirar la pantalla: hay que leer lo que VIAJA. Este test
 * intercepta la petición y mira el cuerpo.
 */

const IMAGEN =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("tras mandar una imagen, el siguiente mensaje de texto viaja sin ella", async ({ page }) => {
  await page.addInitScript((img: string) => {
    if (window.top !== window.self) return;
    try {
      localStorage.setItem(
        "prism-ai-v1",
        JSON.stringify({
          state: {
            // conversación ya empezada: la primera pregunta llevaba imagen
            sessions: [
              {
                id: "s1",
                title: "con imagen",
                createdAt: Date.now(),
                updatedAt: Date.now(),
                modelKey: "custom::mock-mini-free",
                messages: [
                  {
                    id: "m1",
                    role: "user",
                    content: "mira esta captura",
                    createdAt: Date.now(),
                    attachments: [
                      {
                        id: "a1",
                        name: "captura.png",
                        mediaType: "image/png",
                        dataUrl: img,
                        size: 70,
                      },
                    ],
                  },
                  { id: "m2", role: "assistant", content: "Veo la captura.", createdAt: Date.now() },
                ],
              },
            ],
            activeSessionId: "s1",
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
      /* marco sin acceso a localStorage */
    }
  }, IMAGEN);

  const cuerpos: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/api/mock-llm/")) {
      cuerpos.push(r.postData() ?? "");
    }
  });

  await page.goto("/");
  const compositor = page.locator("textarea").first();
  await expect(compositor).toBeVisible({ timeout: 30_000 });

  await compositor.fill("Hola");
  await page.keyboard.press("Enter");

  await expect.poll(() => cuerpos.filter((c) => c.includes("Hola")).length, { timeout: 30_000 })
    .toBeGreaterThan(0);

  const enviado = cuerpos.filter((c) => c.includes("Hola"))[0];
  // lo que importa: NADA de imagen viaja en un turno que no la lleva
  expect(enviado, "sin image_url").not.toContain("image_url");
  expect(enviado, "sin base64 de la imagen").not.toContain("iVBORw0KGgo");
  // y el modelo sigue sabiendo que hubo una, por la nota
  expect(enviado, "queda la nota del adjunto").toContain("captura.png");
});
