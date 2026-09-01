import {  expect, test, type Page  } from "./fixtures";

/** Prism AI — E2E v3.0.0: Sandbox (ZIP → ejecutar) y Repo Studio directo (GitHub API). */

async function seedApp(page: Page) {
  await page.addInitScript(() => {
    const seed = {
      state: {
        sessions: [],
        activeSessionId: null,
        onboardingDone: true,
        favorites: [],
        radarSeenIds: [],
        settings: {
          defaultModelKey: "custom::mock-mini-free",
          systemPrompt: "Eres Prism AI (test).",
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
          compression: "off",
          outputStyle: "normal",
          piiShield: true,
        },
        providers: {
          custom: {
            apiKey: "test-key-123",
            baseUrl: "/api/mock-llm",
            enabled: true,
            models: ["mock-mini-free", "mock-big-free"],
            useProxy: false,
          },
        },
        version: 1,
      },
      version: 0,
    };
    if (window.top !== window.self) return; // no en el iframe aislado del Sandbox
    try {
      localStorage.setItem("prism-ai-v1", JSON.stringify(seed));
    } catch {
      /* frame sin acceso a localStorage */
    }
  });
}

test.describe("Prism AI — Sandbox (navegar, ejecutar, revisar)", () => {
  test.beforeEach(async ({ page }) => {
    await seedApp(page);
  });

  /** Carga la demo y deja el Sandbox EN EL EDITOR, que es donde estos tests
   *  trabajan (árbol, diff, revisión).
   *
   *  Desde la v3.34 cargar un proyecto con HTML de entrada abre directo la
   *  vista previa —es lo que se pidió— y esa vista ocupa el ancho entero, sin
   *  árbol. Así que el árbol ya no está al aterrizar: hay que volver al
   *  editor. Que la demo aterrice en «Vista» lo comprueba su propio test más
   *  abajo, no este ayudante. */
  /** Va a una pestaña del Sandbox y se asegura de que se queda.
   *
   *  El diálogo se redibuja mientras el proyecto arranca y se ejecuta, y un
   *  clic que caiga en ese hueco se va con el nodo que lo recibió: no falla,
   *  simplemente no hace nada. Se insiste hasta que la pestaña queda
   *  seleccionada de verdad. */
  async function irAPestana(page: Page, nombre: string | RegExp) {
    const pestana = page.getByRole("tab", { name: nombre });
    await expect(async () => {
      await pestana.click();
      await expect(pestana).toHaveAttribute("aria-selected", "true", { timeout: 3_000 });
    }).toPass({ timeout: 20_000 });
  }

  async function abrirDemo(page: Page) {
    await page.goto("/");
    await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Sandbox", exact: false }).first().click();
    await expect(page.getByText("Suelta un ZIP aquí")).toBeVisible();
    await page.getByRole("button", { name: "Probar con una demo" }).click();
    // Cargar la demo dispara el auto-arranque (v3.34): el Sandbox ejecuta el
    // proyecto y se pone en VISTA COMPLETA, que es una capa `fixed inset-0`
    // por encima de todo. Mientras esa capa está puesta, los clics sobre el
    // Sandbox de debajo se los come ella. Estos tests trabajan en el editor,
    // así que lo primero es salir de la vista completa.
    const volver = page.getByRole("button", { name: "Volver al Sandbox" });
    await expect(volver).toBeVisible({ timeout: 20_000 });
    await volver.click();
    await expect(volver).toBeHidden();

    // Y se deja pasar la instantánea del auto-arranque. `run()` programa un
    // `setTimeout(finalizarSnapshot, 3000)`: tres segundos después de correr,
    // el Sandbox actualiza estado y se redibuja. Un clic que caiga justo ahí
    // se va con el nodo viejo —no falla, no hace nada—, y es de donde salían
    // los fallos sueltos de este spec. Se espera a que pase.
    await page.waitForTimeout(3_500);

    // Y ya sin capa encima ni instantánea pendiente, al editor. Se insiste
    // igual: el árbol es la única señal fiable de estar de verdad en él.
    const editor = page.getByRole("tab", { name: "Editor" });
    const indexHtml = page.getByRole("button", { name: /^index\.html/ });
    await expect(async () => {
      await editor.click();
      await expect(indexHtml).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 30_000 });
    // el árbol se abre por la carpeta raíz del ZIP
    await expect(indexHtml).toBeVisible();
  }

  test("al cargar un proyecto con index.html aterriza en la vista previa, no en el editor", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Sandbox", exact: false }).first().click();
    await page.getByRole("button", { name: "Probar con una demo" }).click();

    // la pestaña activa es «Vista» sin que nadie la haya pulsado…
    const vista = page.getByRole("tab", { name: "Vista" });
    await expect(vista).toHaveAttribute("aria-selected", "true", { timeout: 15_000 });
    // …y la página de la demo está corriendo dentro del iframe
    const marco = page.locator("iframe").first();
    await expect(marco).toBeVisible();
    await expect(
      marco.contentFrame().getByRole("button", { name: /Pulsado \d+ veces/ })
    ).toBeVisible({ timeout: 15_000 });
  });

  test("navega el árbol de carpetas del proyecto", async ({ page }) => {
    await abrirDemo(page);

    // la carpeta raíz del ZIP viene desplegada y las de dentro, plegadas
    const carpetaCss = page.getByRole("button", { name: /^css/ });
    await expect(carpetaCss).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("button", { name: /^style\.css/ })).toBeHidden();

    await carpetaCss.click();
    await expect(carpetaCss).toHaveAttribute("aria-expanded", "true");
    const estilo = page.getByRole("button", { name: /^style\.css/ });
    await expect(estilo).toBeVisible();

    // al elegirlo se abre en el editor, con su ruta completa
    await estilo.click();
    await expect(page.getByLabel("Contenido de demo-web/css/style.css")).toBeVisible();

    // el buscador despliega el árbol y filtra
    await page.getByLabel("Buscar archivos del proyecto").fill("app.js");
    await expect(page.getByRole("button", { name: /^app\.js/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^style\.css/ })).toBeHidden();
  });

  test("ejecuta el proyecto y recoge sus logs en la consola", async ({ page }) => {
    await abrirDemo(page);

    await page.getByRole("button", { name: "Ejecutar" }).click();
    const frame = page.frameLocator('iframe[title="Vista previa del Sandbox"]');
    await expect(frame.locator("h1")).toContainText("Funciona", { timeout: 15_000 });
    // El botón del proyecto responde → el JS inlineado funciona. Se insiste
    // porque «Ejecutar» vuelve a montar el marco (sube `runKey`) y un clic
    // que caiga en ese hueco se va con el documento anterior: el contador se
    // queda en 0 sin que nada falle.
    await expect(async () => {
      await frame.locator("#btn").click();
      await expect(frame.locator("#btn")).toContainText("Pulsado 1 vez", { timeout: 3_000 });
    }).toPass({ timeout: 20_000 });

    // la consola integrada recoge lo que imprime el proyecto
    await irAPestana(page, /Consola/);
    await expect(page.getByText("Demo del Sandbox lista")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("click 1")).toBeVisible();
  });

  test("revisa el proyecto y salta al problema que encuentra", async ({ page }) => {
    await abrirDemo(page);

    // se introduce a propósito un fallo que solo se ve al revisar
    await page.getByRole("button", { name: /^index\.html/ }).click();
    const ta = page.getByLabel("Contenido de demo-web/index.html");
    await ta.fill(
      [
        "<!doctype html>",
        '<html lang="es"><head>',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        "<title>Demo</title>",
        '<link rel="stylesheet" href="css/no-existe.css">',
        "</head><body></body></html>",
      ].join("\n")
    );

    await page.getByRole("button", { name: "Revisar" }).click();
    await expect(page.getByText(/problemas? que conviene arreglar/)).toBeVisible();

    // el enlace roto aparece con su archivo y su línea
    const roto = page.getByRole("button", { name: /no-existe\.css/ }).first();
    await expect(roto).toBeVisible();
    await expect(page.getByText("demo-web/index.html:6")).toBeVisible();

    // al pulsarlo se vuelve al editor con esa línea seleccionada
    await roto.click();
    await expect(page.getByLabel("Contenido de demo-web/index.html")).toBeVisible();

    // corregido el enlace, la revisión se rehace sola y da el visto bueno
    await page.getByLabel("Contenido de demo-web/index.html").fill(
      [
        "<!doctype html>",
        '<html lang="es"><head>',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        "<title>Demo</title>",
        '<link rel="stylesheet" href="css/style.css">',
        "</head><body></body></html>",
      ].join("\n")
    );
    await irAPestana(page, /Revisión/);
    await expect(page.getByText("Listo para subir a GitHub")).toBeVisible({ timeout: 10_000 });
  });

  test("avisa de una clave de API antes de subir a GitHub", async ({ page }) => {
    await abrirDemo(page);

    // mismo motivo que arriba: el clic puede perderse con el nodo viejo
    await expect(async () => {
      await page.getByRole("button", { name: "Archivo nuevo" }).click();
      await expect(page.getByLabel("Ruta del archivo nuevo")).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 20_000 });
    await page.getByLabel("Ruta del archivo nuevo").fill("demo-web/config.js");
    await page.getByRole("button", { name: "Crear", exact: true }).click();
    await page
      .getByLabel("Contenido de demo-web/config.js")
      .fill('const AWS = "AKIAIOSFODNN7EXAMPLE";');

    await page.getByRole("button", { name: "Revisar" }).click();
    await expect(page.getByText(/clave de acceso de AWS/)).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Credenciales/ })).toBeVisible();
  });

  test("el Sandbox ejecuta un proyecto con módulos ES anidados", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Sandbox", exact: false }).first().click();
    // cargar el ZIP de módulos por el input de archivo
    const res = await page.request.get("/demo-modulos.zip");
    const buf = await res.body();
    await page
      .getByRole("dialog")
      .locator('input[type="file"]')
      .setInputFiles({ name: "demo-modulos.zip", mimeType: "application/zip", buffer: buf });
    // el ZIP entra con su estructura (el árbol vive en el editor: cargar un
    // proyecto con HTML de entrada aterriza en «Vista» desde la v3.34, así
    // que se espera a ese aterrizaje antes de volver al editor)
    await expect(page.getByRole("tab", { name: "Vista" })).toHaveAttribute(
      "aria-selected",
      "true",
      { timeout: 15_000 }
    );
    await page.getByRole("tab", { name: "Editor" }).click();
    await expect(page.getByRole("button", { name: /^index\.html/ })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Ejecutar" }).click();
    const frame = page.frameLocator('iframe[title="Vista previa del Sandbox"]');
    // el saludo viene de un módulo que a su vez importa una constante de otra carpeta
    await expect(frame.locator("#titulo")).toContainText("Funcionan los módulos ES — Prism Sandbox", { timeout: 15_000 });
    // y la suma viene de mat/index.js → mat/ops.js
    await expect(frame.locator("#suma")).toContainText("2 + 3 = 5");
    await irAPestana(page, /Consola/);
    await expect(page.getByText("app.js con módulos ES cargado")).toBeVisible();
    await expect(page.getByText("sumando en Prism Sandbox")).toBeVisible();
  });

  test("del Sandbox a GitHub: la revisión bloquea la subida de una credencial", async ({
    page,
  }) => {
    await abrirDemo(page);

    // se cuela una clave de AWS en un archivo nuevo
    // mismo motivo que arriba: el clic puede perderse con el nodo viejo
    await expect(async () => {
      await page.getByRole("button", { name: "Archivo nuevo" }).click();
      await expect(page.getByLabel("Ruta del archivo nuevo")).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 20_000 });
    await page.getByLabel("Ruta del archivo nuevo").fill("demo-web/config.js");
    await page.getByRole("button", { name: "Crear", exact: true }).click();
    await page
      .getByLabel("Contenido de demo-web/config.js")
      .fill('const AWS = "AKIAIOSFODNN7EXAMPLE";');

    // «Subir» lleva el proyecto al diálogo de GitHub, que vuelve a revisarlo
    await page.getByRole("button", { name: "Subir", exact: true }).click();
    await expect(page.getByText("Paso 4 · Revisión antes de subir")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/clave de acceso de AWS/)).toBeVisible();

    // el botón de subir queda cerrado mientras el hallazgo esté sin asumir
    const subir = page.getByRole("button", { name: /Ver los problemas antes de subir/ });
    await expect(subir).toBeVisible();
    // pulsarlo no sube nada: lleva a los hallazgos, que es lo que pide su texto
    await subir.click();
    await expect(page.getByText(/problema.*antes de subir/).first()).toBeInViewport();
    await expect(page.getByText(/clave de acceso de AWS/)).toBeInViewport();

    // asumirlo a mano lo reabre: la decisión es tuya, pero explícita
    await page.getByRole("switch", { name: /Subir de todas formas/ }).click();
    await expect(page.getByRole("button", { name: /Subir .* archivos a GitHub/ })).toBeEnabled();

    // …pero el permiso vale solo para lo que se vio: una credencial NUEVA
    // vuelve a cerrar la puerta, no se hereda el «sí, ya sé» anterior
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Sandbox", exact: false }).first().click();
    await page
      .getByLabel("Contenido de demo-web/config.js")
      .fill(
        'const AWS = "AKIAIOSFODNN7EXAMPLE";\nconst GH = "ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789";'
      );
    await page.getByRole("button", { name: "Subir", exact: true }).click();
    await expect(page.getByText(/token de GitHub/)).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("button", { name: /Ver los problemas antes de subir/ })
    ).toBeVisible();
  });

  test("la pestaña Cambios enseña el diff real, no un contador", async ({ page }) => {
    await abrirDemo(page);

    // sin tocar nada, no hay cambios
    await irAPestana(page, /Cambios/);
    await expect(page.getByText(/No has cambiado nada todavía/)).toBeVisible();

    // se edita una línea concreta del HTML
    await page.getByRole("button", { name: /^index\.html/ }).click();
    const ta = page.getByLabel("Contenido de demo-web/index.html");
    await ta.fill(
      [
        "<!doctype html>",
        '<html lang="es">',
        "<head>",
        '  <meta charset="utf-8">',
        "  <title>Titulo editado</title>",
        "</head>",
        "<body></body>",
        "</html>",
      ].join("\n")
    );

    await irAPestana(page, /Cambios/);
    await expect(page.getByText(/1 archivo con cambios/)).toBeVisible();
    // la línea nueva sale como añadida y la vieja como quitada
    await expect(page.getByText("Titulo editado", { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/Demo Sandbox Prism/).first()).toBeVisible();

    // un archivo nuevo aparece marcado como tal
    await page.getByRole("button", { name: "Archivo nuevo" }).click();
    await page.getByLabel("Ruta del archivo nuevo").fill("demo-web/nuevo.js");
    await page.getByRole("button", { name: "Crear", exact: true }).click();
    await page.getByLabel("Contenido de demo-web/nuevo.js").fill("export const x = 1;");
    await irAPestana(page, /Cambios/);
    await expect(page.getByText("nuevo", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/2 archivos con cambios/)).toBeVisible();

    // y borrar uno del proyecto también cuenta como cambio
    await page.getByRole("button", { name: /^README\.md/ }).click();
    await page.getByRole("button", { name: /Quitar/ }).click();
    await irAPestana(page, /Cambios/);
    await expect(page.getByText("borrado", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/3 archivos con cambios/)).toBeVisible();
  });

  test("edita un archivo y exporta el ZIP modificado", async ({ page }) => {
    await abrirDemo(page);

    await page.getByRole("button", { name: /^index\.html/ }).click();
    const ta = page.getByLabel("Contenido de demo-web/index.html");
    await expect(ta).toBeVisible();
    await ta.fill("<!doctype html><html><head><title>Editado</title></head><body><h1>Editado E2E</h1></body></html>");
    await expect(page.getByText("sin guardar")).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /ZIP/ }).first().click(),
    ]);
    expect(download.suggestedFilename()).toBe("demo-web-editado.zip");
  });
});

test.describe("Prism AI — Repo Studio directo (GitHub API)", () => {
  const OWNER = "e2e-user";
  const REPO = "demo-repo";
  const BASE = `https://api.github.com/repos/${OWNER}/${REPO}`;
  const HTML_VIEJO = "<h1>Hola</h1>";
  const HTML_NUEVO = "<h1>Hola editado desde Prism</h1>";

  let commitsPost: { message?: string }[] = [];

  test.beforeEach(async ({ page }) => {
    await seedApp(page);
    commitsPost = [];
    const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

    await page.route("**/api.github.com/**", async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const p = url.pathname;
      const m = req.method();

      // El alta por token pide /user (y la lista de repos al conectar).
      if (p === "/user" && m === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ login: OWNER, name: OWNER, avatar_url: "" }),
        });
      }
      if (p === "/user/repos" && m === "GET") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      }
      if (p === `/repos/${OWNER}/${REPO}` && m === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            default_branch: "main",
            private: false,
            permissions: { push: true },
            html_url: `https://github.com/${OWNER}/${REPO}`,
          }),
        });
      }
      if (p === `/repos/${OWNER}/${REPO}/git/trees/main` && m === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            sha: "tree0",
            tree: [
              { path: "index.html", type: "blob", size: HTML_VIEJO.length, sha: "f1" },
              { path: "node_modules/x.js", type: "blob", size: 1, sha: "f2" },
              { path: "README.md", type: "blob", size: 30, sha: "f3" },
            ],
          }),
        });
      }
      if (p === `/repos/${OWNER}/${REPO}/commits/main` && m === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ sha: "c1" }),
        });
      }
      if (p === `/repos/${OWNER}/${REPO}/contents/index.html` && m === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ content: b64(HTML_VIEJO), encoding: "base64", sha: "f1", size: HTML_VIEJO.length }),
        });
      }
      if (p === `/repos/${OWNER}/${REPO}/git/ref/heads/main` && m === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ object: { sha: "c1" } }),
        });
      }
      if (p === `/repos/${OWNER}/${REPO}/git/commits/c1` && m === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ tree: { sha: "tree0" } }),
        });
      }
      if (p === `/repos/${OWNER}/${REPO}/git/blobs` && m === "POST") {
        return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ sha: "blob1" }) });
      }
      if (p === `/repos/${OWNER}/${REPO}/git/trees` && m === "POST") {
        return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ sha: "tree1" }) });
      }
      if (p === `/repos/${OWNER}/${REPO}/git/commits` && m === "POST") {
        commitsPost.push(JSON.parse(req.postData() ?? "{}"));
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ sha: "c2", html_url: `https://github.com/${OWNER}/${REPO}/commit/c2` }),
        });
      }
      if (p === `/repos/${OWNER}/${REPO}/git/refs/heads/main` && m === "PATCH") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ object: { sha: "c2" } }) });
      }
      return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ message: "no fixture" }) });
    });
  });

  test("conecta sin descargar, edita y hace push en 1 commit", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Repos", exact: false }).first().click();
    // pestaña «Directo · sin descargar» activa por defecto
    await expect(page.getByText("Directo, sin descargar nada")).toBeVisible();

    // El acceso es OAuth de una pulsación; el token clásico vive detrás de
    // «Usar un token personal». En el test usamos esa vía avanzada.
    await page.getByText("Usar un token personal").click();
    await page.getByLabel("Token personal de GitHub").fill("e2e-token-falso");
    await page.getByRole("button", { name: "Guardar" }).click();

    await page.getByLabel("URL del repositorio de GitHub").fill(`${OWNER}/${REPO}`);

    // el botón pasó a llamarse «Abrir repo»
    await page.getByRole("button", { name: "Abrir repo" }).click();

    // exact: el toast de conexión también contiene el nombre del repo
    await expect(page.getByText(`${OWNER}/${REPO}`, { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("push permitido")).toBeVisible();

    // abrir y editar el archivo
    await page.getByText("index.html").first().click();
    const ta = page.getByLabel("Contenido de index.html");
    await expect(ta).toHaveValue(HTML_VIEJO, { timeout: 15_000 });
    await ta.fill(HTML_NUEVO);
    await page.getByRole("button", { name: "Guardar" }).click();

    // commit + push
    await page.getByLabel("Mensaje del commit").fill("Cambio desde Prism E2E");
    // el botón lleva la rama de destino: «Subir a main»
    await page.getByRole("button", { name: /Subir a main/ }).click();

    await expect(page.getByText("¡Push hecho — 1 solo commit!")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/se despliega solo/)).toBeVisible();

    // el POST de commit llevó el mensaje correcto y 1 solo commit
    expect(commitsPost).toHaveLength(1);
    expect(commitsPost[0].message).toBe("Cambio desde Prism E2E");
  });
});
