import { expect, test } from "./fixtures";

/** Prism AI — El agente puede LEER una página, no buscar en la web.
 *
 * `PLAN-V4` daba esto por imposible «sin servidor». Resulta que el servidor ya
 * estaba y ya estaba protegido: `/api/proxy` pide cualquier host público y
 * `net-guard.ts` rechaza localhost, IPs privadas y los metadatos de la nube,
 * también al seguir redirecciones.
 *
 * Aquí se comprueba **el escudo**, que es la mitad que solo se puede probar de
 * verdad contra el servidor: una herramienta de red sin él sería regalarle al
 * agente un ariete contra la red de quien despliegue la app.
 *
 * La conversión de la página a texto se prueba en
 * `tests/unit/tool-runner-read-url.test.ts`: en este entorno no hay red hacia
 * fuera, y una página local NO sirve —el escudo la rechaza, que es justo lo
 * que debe hacer—.
 */

test("el escudo anti-SSRF sigue puesto: no se puede leer la red interna", async ({ page }) => {
  await page.goto("/");
  // se pide directamente al proxy, que es lo que usa la herramienta por debajo
  const res = await page.request.get("/api/proxy", {
    headers: { "x-target-url": "http://169.254.169.254/latest/meta-data/" },
  });
  expect(res.status(), "los metadatos de la nube quedan fuera").toBe(403);
  const j = (await res.json()) as { error?: string };
  expect(j.error).toContain("no permitido");
});
