import { expect, test } from "./fixtures";

/** Prism AI — Adjuntos en IndexedDB (v3.14).
 *
 * Antes, los adjuntos vivían como `dataUrl` base64 enteros dentro del store
 * de zustand, y el store entero vivía en localStorage (~5 MB de techo). Un
 * PDF o un par de imágenes bastaban para llenarlo, y cuando `persist` no
 * podía escribir, **no se guardaba nada** — ni conversaciones, ni claves,
 * ni ajustes — y fallaba en silencio.
 *
 * Desde la v3.14, los binarios viven en IndexedDB (`prism-attachments`) y
 * el store solo guarda la ficha con `blobId`. Esta prueba siembra una
 * sesión con un adjunto en el formato viejo (`dataUrl` dentro del store,
 * como venía siendo antes de la v3.14), recarga la página y verifica que:
 *
 *   1. La miniatura sigue visible (el binario se recuperó desde IDB).
 *   2. Tras la migración, el `dataUrl` ya no vive en el store serializado
 *      — el peso de `localStorage` bajó.
 *   3. El binario está en IndexedDB, bajo la misma clave `id`.
 *
 * Si se quita el código de migración (`migrateLegacyAttachments` en
 * `attachment-blob.ts`) o el `partialize` que stripa el `dataUrl`, esta
 * prueba se pone roja: el peso no baja y/o la miniatura no aparece.
 */

const ATTACHMENT_ID = "att-legacy-1";
// PNG rojo 1×1 en base64 — pequeño, pero suficiente para demostrar la
// migración. Si hiciéramos la imagen más grande, llenaríamos localStorage
// y no podríamos sembrar la sesión en el `addInitScript`.
const RED_PIXEL_DATAURL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8DwnwAFAlEDjcCMYgAAAABJRU5ErkJggg==";

async function seedLegacyAttachment(page: import("@playwright/test").Page) {
  await page.addInitScript(
    ({ id, dataUrl }) => {
      // Sembramos el store como estaba ANTES de la v3.14: el adjunto
      // lleva el `dataUrl` entero dentro del store, sin `blobId`.
      const session = {
        id: "sess-legacy",
        title: "Sesión con adjunto viejo",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: "mira esta imagen",
            createdAt: Date.now(),
            attachments: [
              {
                id,
                name: "pixel.png",
                mediaType: "image/png",
                dataUrl,
                size: 100,
              },
            ],
          },
          {
            id: "msg-2",
            role: "assistant",
            content: "Veo un pixel rojo.",
            createdAt: Date.now(),
          },
        ],
      };
      const state = {
        sessions: [session],
        activeSessionId: "sess-legacy",
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
            // La key la valida el mock-llm: pide "test-key-123".
            apiKey: "test-key-123",
            baseUrl: "/api/mock-llm",
            enabled: true,
            models: ["mock-mini-free"],
            useProxy: false,
          },
        },
        version: 1,
      };
      try {
        localStorage.setItem(
          "prism-ai-v1",
          JSON.stringify({ state, version: 0 })
        );
        localStorage.setItem("prism-preview-demo", "1");
      } catch {
        /* frame sin acceso */
      }
    },
    { id: ATTACHMENT_ID, dataUrl: RED_PIXEL_DATAURL }
  );
}

test.describe("Adjuntos migrados a IndexedDB (v3.14)", () => {
  test.beforeEach(async ({ page }) => {
    await seedLegacyAttachment(page);
  });

  test("la miniatura del adjunto se ve tras recargar la página", async ({ page }) => {
    await page.goto("/");
    // Primera carga: la migración debería correr en mount y mover el
    // `dataUrl` a IndexedDB. La miniatura se pinta desde IDB.
    // (La misma frase aparece también como título en la barra lateral:
    // usamos `.first()` para apuntar al cuerpo del mensaje.)
    await expect(page.getByText("mira esta imagen").first()).toBeVisible({ timeout: 30_000 });

    // Recargamos la página: el store ya no tiene `dataUrl` (solo `blobId`).
    // La miniatura debe seguir viéndose porque se resuelve desde IDB.
    await page.reload();
    await expect(page.getByText("mira esta imagen").first()).toBeVisible({ timeout: 30_000 });

    // La miniatura del adjunto es un <a><img></a> con title = "pixel.png".
    // Verificamos que la imagen está realmente cargada (tiene naturalWidth > 0).
    const img = page.locator('img[alt="pixel.png"]').first();
    await expect(img).toBeVisible();
    const loaded = await img.evaluate((el) => (el as HTMLImageElement).naturalWidth > 0);
    expect(loaded, "la miniatura del adjunto tiene que pintar pixels, no un hueco vacío").toBe(true);
  });

  test("tras la primera carga, el dataUrl ya no vive en localStorage", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("mira esta imagen").first()).toBeVisible({ timeout: 30_000 });

    // Damos un instante para que `migrateLegacyAttachments` corra (es
    // fire-and-forget en un useEffect) y `setState` persista.
    await page.waitForFunction(
      () => {
        try {
          const raw = localStorage.getItem("prism-ai-v1");
          if (!raw) return false;
          const parsed = JSON.parse(raw);
          const sessions = parsed?.state?.sessions ?? [];
          const att = sessions[0]?.messages?.[0]?.attachments?.[0];
          if (!att) return false;
          // Tras la migración: no hay `dataUrl`, sí hay `blobId`.
          return att.dataUrl === undefined && typeof att.blobId === "string";
        } catch {
          return false;
        }
      },
      { timeout: 15_000 }
    );

    // Verificamos también que el binario está en IndexedDB.
    const inIdb = await page.evaluate(
      ({ id }) =>
        new Promise<boolean>((resolve) => {
          try {
            const req = indexedDB.open("prism-attachments", 1);
            req.onupgradeneeded = () => {
              const db = req.result;
              if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs");
            };
            req.onsuccess = () => {
              const db = req.result;
              const tx = db.transaction("blobs", "readonly");
              const store = tx.objectStore("blobs");
              const get = store.get(id);
              get.onsuccess = () => resolve(typeof get.result === "string");
              get.onerror = () => resolve(false);
            };
            req.onerror = () => resolve(false);
          } catch {
            resolve(false);
          }
        }),
      { id: ATTACHMENT_ID }
    );
    expect(inIdb, "el binario del adjunto tiene que vivir en IndexedDB tras la migración").toBe(true);
  });

  test("regenerar la respuesta tras recarga sigue enviando el adjunto al modelo", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("mira esta imagen").first()).toBeVisible({ timeout: 30_000 });
    // Recargamos para forzar el camino "el store solo tiene blobId".
    await page.reload();
    await expect(page.getByText("mira esta imagen").first()).toBeVisible({ timeout: 30_000 });

    // Pulsamos «Regenerar» en la última respuesta del asistente.
    const regenBtn = page.getByRole("button", { name: "Regenerar" }).first();
    await expect(regenBtn).toBeVisible();
    await regenBtn.click();

    // El mock-llm responde "He recibido tu imagen" cuando el body lleva
    // `image_url`. Si el adjunto se hubiera perdido al migrar a IDB,
    // el mock-llm respondería "¡Hola! Soy Prism AI funcionando...".
    // Verificamos que la respuesta menciona la imagen — es la prueba
    // de que el `dataUrl` se resolvió desde IDB y viajó al modelo.
    await expect(
      page.getByText(/He recibido tu.*imagen.*correctamente/i).first()
    ).toBeVisible({ timeout: 30_000 });
  });
});
