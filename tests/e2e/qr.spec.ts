import { expect, test, type Page } from "@playwright/test";
import jsQR from "jsqr";

/** Prism AI — el QR del traspaso se lee de verdad.
 *
 * La promesa era «pones una frase y sale un QR o un texto corto». El texto se
 * entregó antes; esto comprueba el QR, y no mirando si aparece un dibujo: se
 * rasteriza y se DESCODIFICA, y lo que sale tiene que ser exactamente el mismo
 * código que hay en el cuadro de texto. Un QR bonito que contenga otra cosa
 * pasaría cualquier prueba visual y fallaría en el momento que importa, con el
 * otro móvil delante.
 *
 * Se descodifica aquí en Node porque el Chromium de las pruebas no trae
 * BarcodeDetector (comprobado), así que el navegador solo pone los píxeles.
 */
const CLAVE = "sk-de-prueba-para-el-qr-1234567890";

async function seed(page: Page, sesiones: number) {
  await page.addInitScript(
    ({ clave, n }) => {
      if (window.top !== window.self) return;
      const sessions = Array.from({ length: n }, (_, i) => ({
        id: "s" + i,
        title: "Conversación " + i,
        createdAt: 1,
        updatedAt: 2,
        messages: Array.from({ length: 12 }, (_, j) => ({
          id: `m${i}-${j}`,
          role: j % 2 ? "assistant" : "user",
          content: "Un mensaje con la longitud que suele tener uno de verdad, más o menos así de largo.",
          createdAt: 1,
        })),
      }));
      localStorage.setItem(
        "prism-ai-v1",
        JSON.stringify({
          state: {
            sessions,
            activeSessionId: null,
            onboardingDone: true,
            favorites: [],
            radarSeenIds: [],
            settings: { defaultModelKey: "custom::mock-mini-free", accessCode: "" },
            providers: {
              custom: { apiKey: clave, baseUrl: "/api/mock-llm", enabled: true, models: ["mock-mini-free"], useProxy: false },
            },
            version: 1,
          },
          version: 0,
        })
      );
      localStorage.setItem("prism-preview-demo", "1");
    },
    { clave: CLAVE, n: sesiones }
  );
}

async function abrirTraspaso(page: Page) {
  await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Ajustes" }).click();
  await page.getByRole("tab", { name: /datos/i }).click();
  return page.getByRole("region", { name: "Pasar a otro dispositivo" });
}

/** Pinta el SVG del QR en un lienzo y devuelve los píxeles. */
async function pixelesDelQr(page: Page) {
  return page.evaluate(async () => {
    const cont = document.querySelector('[role="img"][aria-label="Código de traspaso en QR"]');
    const svg = cont?.querySelector("svg");
    if (!svg) return null;
    const texto = new XMLSerializer().serializeToString(svg);
    const url = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(texto)));
    const img = new Image();
    await new Promise((ok, err) => {
      img.onload = ok;
      img.onerror = err;
      img.src = url;
    });
    // Escala ENTERA y sin suavizado: a 420 px un QR denso salía con los
    // módulos emborronados y el descodificador no lo pillaba. Ocho píxeles por
    // módulo y bordes limpios es lo que ve una cámara decente de cerca.
    const vb = (svg.getAttribute("viewBox") ?? "0 0 33 33").split(" ");
    const modulos = Number(vb[2]) || 33;
    const lado = modulos * 8;
    const cv = document.createElement("canvas");
    cv.width = lado;
    cv.height = lado;
    const ctx = cv.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, lado, lado);
    ctx.drawImage(img, 0, 0, lado, lado);
    const d = ctx.getImageData(0, 0, lado, lado);
    return { data: Array.from(d.data), width: d.width, height: d.height };
  });
}

test("el QR contiene exactamente el código de traspaso", async ({ page }) => {
  await seed(page, 0);
  await page.goto("/");
  const panel = await abrirTraspaso(page);

  await panel.getByPlaceholder("Al menos 8 caracteres").fill("frase-de-prueba-2026");
  // sin conversaciones: es el caso para el que el QR existe
  await panel.getByText("Incluir también las conversaciones").click();
  await panel.getByRole("button", { name: "Generar código" }).click();

  const codigo = await panel.getByLabel("Código de transferencia").inputValue();
  expect(codigo.startsWith("PRISM1.")).toBe(true);

  const px = await pixelesDelQr(page);
  expect(px, "el QR tiene que estar pintado").not.toBeNull();

  const leido = jsQR(new Uint8ClampedArray(px!.data), px!.width, px!.height);
  expect(leido, "el QR tiene que ser legible").not.toBeNull();
  expect(leido!.data, "lo leído debe ser el mismo código, carácter por carácter").toBe(codigo);
});

test("con las conversaciones dentro no cabe, y lo dice con la salida al lado", async ({ page }) => {
  await seed(page, 10);
  await page.goto("/");
  const panel = await abrirTraspaso(page);

  await panel.getByPlaceholder("Al menos 8 caracteres").fill("frase-de-prueba-2026");
  // el interruptor viene puesto: se deja como está
  await panel.getByRole("button", { name: "Generar código" }).click();
  await expect(panel.getByLabel("Código de transferencia")).toBeVisible();

  // no se pinta un QR que el otro móvil no podría leer
  await expect(page.locator('[aria-label="Código de traspaso en QR"]')).toHaveCount(0);
  // y se explica, nombrando el interruptor exacto que lo arregla
  await expect(panel.getByText(/no cabe en un QR/)).toBeVisible();
  await expect(panel.getByText(/Incluir también las conversaciones/).last()).toBeVisible();
});

test("no se ofrece escanear en un navegador que no puede", async ({ page }) => {
  // este Chromium no trae BarcodeDetector: el botón no debe aparecer, en vez
  // de aparecer y no hacer nada al pulsarlo
  await seed(page, 0);
  await page.goto("/");
  const panel = await abrirTraspaso(page);
  await panel.getByRole("button", { name: "Recibir aquí" }).click();
  await expect(panel.getByPlaceholder(/Pega aquí el código/)).toBeVisible();
  await expect(panel.getByRole("button", { name: "Escanear QR" })).toHaveCount(0);
});
