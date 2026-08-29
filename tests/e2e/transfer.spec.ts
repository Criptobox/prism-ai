import { expect, test } from "@playwright/test";

/** Llevarte las claves a otro dispositivo sin cuenta y sin servidor.
 *
 * Se recorre entero en el navegador: generar el código con una frase, comprobar
 * que la clave NO se puede leer en él, y aplicarlo en un perfil distinto —otro
 * contexto, otro localStorage: eso es «el otro dispositivo»— verificando además
 * que no se lleva por delante lo que ya había allí.
 */
const CLAVE = "sk-clave-que-no-debe-verse";

async function sembrar(page: import("@playwright/test").Page, over: Record<string, unknown> = {}) {
  await page.addInitScript(
    ({ clave, over }) => {
      const base = {
        sessions: [],
        activeSessionId: null,
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
            apiKey: clave,
            baseUrl: "/api/mock-llm",
            enabled: true,
            models: ["mock-mini-free"],
            useProxy: false,
          },
        },
        version: 1,
      };
      localStorage.setItem(
        "prism-ai-v1",
        JSON.stringify({ state: { ...base, ...over }, version: 0 })
      );
    },
    { clave: CLAVE, over }
  );
}

/** El panel, acotado: la pestaña «Datos» tiene su propio «Importar» para el
 *  backup en JSON, y sin acotar la búsqueda casaría con los dos. */
async function abrirDatos(page: import("@playwright/test").Page) {
  await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Ajustes").click();
  await page.getByRole("tab", { name: /datos/i }).click();
  return page.getByRole("region", { name: "Pasar a otro dispositivo" });
}

test("las claves viajan cifradas a otro dispositivo", async ({ browser }) => {
  const FRASE = "cafe-con-leche-2026";

  /* --- dispositivo 1: genera el código --- */
  const ctx1 = await browser.newContext();
  const p1 = await ctx1.newPage();
  await sembrar(p1);
  await p1.goto("/");
  const panel1 = await abrirDatos(p1);

  await panel1.getByLabel("Frase (la misma en los dos dispositivos)").fill(FRASE);
  await panel1.getByRole("button", { name: "Generar código" }).click();

  const caja = panel1.getByLabel("Código de transferencia");
  await expect(caja).toBeVisible();
  const codigo = await caja.inputValue();

  expect(codigo.startsWith("PRISM1.")).toBe(true);
  // lo que importa de todo esto: la clave no está a la vista
  expect(codigo).not.toContain(CLAVE);
  await ctx1.close();

  /* --- dispositivo 2: perfil distinto, con cosas propias --- */
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await sembrar(p2, {
    providers: {
      custom: { apiKey: "", baseUrl: "", enabled: false, models: [], useProxy: true },
    },
    sessions: [
      {
        id: "mia",
        title: "Ya estaba aquí",
        createdAt: 1,
        updatedAt: 99,
        messages: [{ id: "m1", role: "user", content: "hola", createdAt: 1 }],
      },
    ],
    activeSessionId: "mia",
  });
  await p2.goto("/");
  const panel2 = await abrirDatos(p2);

  await panel2.getByRole("button", { name: "Recibir aquí" }).click();
  await panel2.getByLabel("Frase (la misma en los dos dispositivos)").fill(FRASE);
  await panel2.getByLabel("Código recibido").fill(codigo);
  await panel2.getByRole("button", { name: "Importar" }).click();

  await expect(p2.getByText("Datos importados")).toBeVisible({ timeout: 15_000 });

  const estado = await p2.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("prism-ai-v1") || "{}");
    return {
      clave: raw.state?.providers?.custom?.apiKey ?? "",
      titulos: (raw.state?.sessions ?? []).map((s: { title: string }) => s.title),
    };
  });

  expect(estado.clave).toBe(CLAVE); // la clave llegó
  expect(estado.titulos).toContain("Ya estaba aquí"); // y no borró lo de aquí
  await ctx2.close();
});

test("con la frase equivocada no se abre, y lo dice", async ({ browser }) => {
  const ctx1 = await browser.newContext();
  const p1 = await ctx1.newPage();
  await sembrar(p1);
  await p1.goto("/");
  const panel1 = await abrirDatos(p1);
  await panel1.getByLabel("Frase (la misma en los dos dispositivos)").fill("frase-correcta-larga");
  await panel1.getByRole("button", { name: "Generar código" }).click();
  const codigo = await panel1.getByLabel("Código de transferencia").inputValue();
  await ctx1.close();

  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await sembrar(p2);
  await p2.goto("/");
  const panel2 = await abrirDatos(p2);
  await panel2.getByRole("button", { name: "Recibir aquí" }).click();
  await panel2.getByLabel("Frase (la misma en los dos dispositivos)").fill("frase-equivocada-larga");
  await panel2.getByLabel("Código recibido").fill(codigo);
  await panel2.getByRole("button", { name: "Importar" }).click();

  await expect(p2.getByText(/frase no coincide/i)).toBeVisible({ timeout: 15_000 });
  await ctx2.close();
});
