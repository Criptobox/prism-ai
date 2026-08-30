import { expect, test } from "./fixtures";

/** Prism AI — Tools con detección de capacidad (PLAN-V4 punto 2).
 *
 * Antes (v3.13): el agente era prompt + parser XML. No llamaba funciones.
 * Ahora (v3.14): si el modelo soporta `tools`, se le pasa el catálogo y
 * el agente puede llamar `read_file`/`write_file`/`list_files`/`run_project`/
 * `get_quota`. Si no soporta tools, se cae al camino XML (que sigue
 * funcionando igual).
 *
 * Esta prueba siembra un proveedor custom apuntando al mock-llm con el
 * modelo `mock-tools`, activa el modo agente, envía un mensaje y verifica
 * que:
 *   1. La primera petición al mock lleva `tools` en el body (el agente
 *      las pasó porque el modelo las soporta).
 *   2. La primera petición devolvió `tool_calls` y el agente las
 *      ejecutó localmente (la segunda petición trae `role: "tool"` con
 *      el resultado).
 *   3. La respuesta final del agente menciona que ejecutó la herramienta.
 */

const PROVIDER_KEY = "test-key-123";
const MODEL_ID = "mock-tools";

async function seedAgent(page: import("@playwright/test").Page) {
  // Pasamos los valores dentro de un objeto: `addInitScript` solo acepta
  // un argumento (si necesitas varios, van en un objeto). El callback se
  // serializa y pierde el closure del test, así que las constantes hay
  // que inyectarlas explícitamente.
  await page.addInitScript(
    ({ model, key }: { model: string; key: string }) => {
      const seed = {
        state: {
          sessions: [],
          activeSessionId: null,
          onboardingDone: true,
          favorites: [],
          radarSeenIds: [],
          settings: {
            defaultModelKey: `custom::${model}`,
            systemPrompt: "Eres Prism AI (test).",
            temperature: 0.7,
            maxTokens: null,
            stream: false, // no-streaming: más fácil de inspeccionar el body
            contextWindow: 10,
            sendKeyOnProxy: true,
            onlyFree: false,
            agentMode: true, // ← activo para que se pase el catálogo de tools
            agentMaxLoops: 3,
            accent: "violeta",
            accentCustom: "#8b5cf6",
            autoSpeak: false,
            accessCode: "",
          },
          providers: {
            custom: {
              apiKey: key,
              baseUrl: "/api/mock-llm",
              enabled: true,
              models: [model],
              useProxy: false,
            },
          },
          version: 1,
        },
        version: 0,
      };
      try {
        localStorage.setItem("prism-ai-v1", JSON.stringify(seed));
        localStorage.setItem("prism-preview-demo", "1");
      } catch {
        /* frame sin acceso */
      }
    },
    { model: MODEL_ID, key: PROVIDER_KEY }
  );
}

test.describe("Tools del agente (PLAN-V4 punto 2)", () => {
  test.beforeEach(async ({ page }) => {
    await seedAgent(page);
  });

  test("el agente pasa el catálogo de tools al modelo que los soporta", async ({ page }) => {
    // Capturamos todas las peticiones POST al mock-llm. Usamos
    // `page.on('request')` (no `page.route`) para no interferir con el
    // cuerpo de la petición. El handler es síncrono: el `postData()` es
    // síncrono en Playwright y no hace falta await.
    const cuerpos: { messages: { role: string }[]; tools?: unknown; model?: string }[] = [];
    page.on("request", (r) => {
      if (r.method() !== "POST") return;
      if (!r.url().includes("/api/mock-llm/")) return;
      const raw = r.postData();
      if (!raw) return;
      try {
        cuerpos.push(JSON.parse(raw));
      } catch {
        /* ignore */
      }
    });

    await page.goto("/");
    // El placeholder del input cambia cuando el modo agente está activo:
    // pasa a "Agente activo: planear → ejecutar → revisar en bucles…".
    // Usamos el textarea, que es único en la página.
    const input = page.locator("textarea").first();
    await expect(input).toBeVisible({ timeout: 30_000 });
    await input.fill("Lista los archivos del proyecto");
    // Click en el botón Enviar: en algunos navegadores/headless, el Enter
    // no dispara el handler por el flag `isComposing` del textarea.
    await page.getByRole("button", { name: "Enviar mensaje" }).click();

    // Esperamos a que salga la primera petición (la que lleva `tools`).
    // El probe de tools hace una petición aparte antes del streamChat,
    // así que la primera petición capturada es la del probe. La segunda
    // es la del streamChat (con tools). La tercera reinyecta el
    // resultado del tool (role: "tool").
    await expect.poll(() => cuerpos.length, { timeout: 60_000 }).toBeGreaterThanOrEqual(1);

    // 1. La primera petición de CHAT (no del probe) lleva `tools` y es
    //    al modelo mock-tools. La del probe también lleva tools pero
    //    con un mensaje "hi"; la del chat lleva el mensaje del usuario.
    // Buscamos la primera petición que tenga el mensaje del usuario.
    const primera = cuerpos.find((c) =>
      c.messages?.some((m) => m.role === "user" && typeof (m as unknown as { content: unknown }).content === "string" && ((m as unknown as { content: string }).content).includes("Lista los archivos"))
    ) ?? cuerpos[0];
    expect(primera.model).toBe(MODEL_ID);
    expect(primera.tools, "el body lleva el catálogo de tools").toBeDefined();
    // El catálogo se traduce a OpenAI (type: "function", function: {name, ...}).
    const tools = primera.tools as { type: string; function: { name: string } }[];
    const names = tools.map((t) => t.function.name).sort();
    expect(names).toEqual(["get_quota", "list_files", "read_file", "run_project", "write_file"]);

    // Esperamos a la tercera petición (la que reinyecta el resultado del tool).
    // Puede tardar porque hay 3 round-trips: probe + chat + reinyección.
    await expect.poll(() => cuerpos.length, { timeout: 60_000 }).toBeGreaterThanOrEqual(3);

    // 2. La tercera petición trae un mensaje `role: "tool"` con el
    //    resultado de ejecutar `list_files` localmente.
    const tercera = cuerpos[2];
    const toolMsg = tercera.messages.find((m) => m.role === "tool");
    expect(toolMsg, "la tercera petición trae el resultado del tool").toBeDefined();
  });

  test("el agente muestra la respuesta final tras ejecutar el tool", async ({ page }) => {
    await page.goto("/");
    const input = page.locator("textarea").first();
    await expect(input).toBeVisible({ timeout: 30_000 });
    await input.fill("Lista los archivos del proyecto");
    await page.getByRole("button", { name: "Enviar mensaje" }).click();

    // La respuesta final del mock-llm cuando el último mensaje es
    // role: "tool" es: "He ejecutado la herramienta que pediste. ... la
    // iteración con tools funcionó correctamente."
    await expect(
      page.getByText(/iteración con tools funcionó correctamente/i).first()
    ).toBeVisible({ timeout: 30_000 });
  });

  test("con el modo agente apagado, NO se pasa el catálogo de tools", async ({ page }) => {
    // Re-sembramos con agentMode: false. El addInitScript se ejecuta
    // DESPUÉS del beforeEach, pisando el seed anterior. Los valores
    // se pasan como argumento (el callback se serializa y pierde el
    // closure del test).
    await page.addInitScript(
      ({ model, key }: { model: string; key: string }) => {
        const seed = {
          state: {
            sessions: [],
            activeSessionId: null,
            onboardingDone: true,
            favorites: [],
            radarSeenIds: [],
            settings: {
              defaultModelKey: `custom::${model}`,
              systemPrompt: "x",
              temperature: 0.7,
              maxTokens: null,
              stream: false,
              contextWindow: 10,
              sendKeyOnProxy: true,
              onlyFree: false,
              agentMode: false, // ← apagado
              agentMaxLoops: 3,
              accent: "violeta",
              accentCustom: "#8b5cf6",
              autoSpeak: false,
              accessCode: "",
            },
            providers: {
              custom: {
                apiKey: key,
                baseUrl: "/api/mock-llm",
                enabled: true,
                models: [model],
                useProxy: false,
              },
            },
            version: 1,
          },
          version: 0,
        };
        try {
          localStorage.setItem("prism-ai-v1", JSON.stringify(seed));
          localStorage.setItem("prism-preview-demo", "1");
        } catch {
          /* frame sin acceso */
        }
      },
      { model: MODEL_ID, key: PROVIDER_KEY }
    );

    const cuerpos: { tools?: unknown }[] = [];
    page.on("request", (r) => {
      if (r.method() !== "POST") return;
      if (!r.url().includes("/api/mock-llm/")) return;
      const raw = r.postData();
      if (!raw) return;
      try {
        cuerpos.push(JSON.parse(raw));
      } catch {
        /* ignore */
      }
    });

    await page.goto("/");
    const input = page.locator("textarea").first();
    await expect(input).toBeVisible({ timeout: 30_000 });
    await input.fill("hola");
    await page.getByRole("button", { name: "Enviar mensaje" }).click();

    await expect.poll(() => cuerpos.length, { timeout: 60_000 }).toBeGreaterThanOrEqual(1);
    // Sin modo agente, ninguna petición lleva `tools` (ni el probe,
    // porque el probe solo se llama si agentMode está activo).
    for (let i = 0; i < cuerpos.length; i++) {
      expect(cuerpos[i].tools, `petición ${i} no debería llevar tools`).toBeUndefined();
    }
  });
});
