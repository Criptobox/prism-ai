import { expect, test } from "./fixtures";

/** Prism AI — Share Target (PLAN-V4 punto 4).
 *
 * Cuando una app externa comparte texto con Prism (PWA instalada),
 * el navegador POSTea al `action` del `share_target` del manifest.
 * Aquí se prueba el handler directamente: se hace POST con
 * `multipart/form-data` (como haría el navegador) y se verifica que
 * la respuesta es una redirección a `/?shared=1` con la cookie
 * `prism-share` puesta.
 *
 * No se puede probar el flujo completo (compartir desde otra app) en
 * Playwright porque el navegador no expone esa UI. Pero el handler es
 * lo único que toca el servidor; el cliente solo lee la cookie.
 */

test.describe("Share Target (PLAN-V4 punto 4)", () => {
  test("POST con texto plano redirige y pone la cookie prism-share", async ({ request }) => {
    // Construye el body multipart/form-data a mano (sin dependencias).
    const boundary = "----prism-test-boundary";
    const body =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="text"\r\n\r\n` +
      `Hola desde la app de notas\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="title"\r\n\r\n` +
      `Nota compartida\r\n` +
      `--${boundary}--\r\n`;

    const res = await request.post("http://localhost:3000/share", {
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      data: body,
      maxRedirects: 0, // no seguir la redirección; queremos inspeccionarla
    });

    // El handler responde 307 (o 308) con Location: /?shared=1.
    expect(res.status()).toBeGreaterThanOrEqual(300);
    expect(res.status()).toBeLessThan(400);
    const location = res.headers()["location"];
    expect(location).toContain("/?shared=1");

    // La cookie prism-share se setea en la respuesta de redirección.
    const setCookie = res.headers()["set-cookie"] ?? "";
    expect(setCookie).toContain("prism-share=");
    expect(setCookie).toContain(encodeURIComponent("Nota compartida"));
  });

  test("POST sin campos redirige sin cookie", async ({ request }) => {
    const boundary = "----prism-test-boundary";
    const body = `--${boundary}--\r\n`;
    const res = await request.post("http://localhost:3000/share", {
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      data: body,
      maxRedirects: 0,
    });
    expect(res.status()).toBeGreaterThanOrEqual(300);
    expect(res.status()).toBeLessThan(400);
    // Sin cookie prism-share.
    const setCookie = res.headers()["set-cookie"] ?? "";
    expect(setCookie).not.toContain("prism-share=");
  });

  test("GET / sigue funcionando (no se rompe con el handler POST)", async ({ request }) => {
    const res = await request.get("http://localhost:3000/");
    expect(res.status()).toBe(200);
    // La página sirve el HTML de la app.
    const text = await res.text();
    expect(text).toContain("Prism AI");
  });
});
