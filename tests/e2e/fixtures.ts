import { test as base, expect } from "@playwright/test";

/** Prism AI — base común de los E2E.
 *
 * La demo de vista previa (src/lib/prism/preview-demo.ts) se escribe SOLA en la
 * primera visita: teclea una landing entera, abre el split y encoge el
 * compositor. En un navegador de verdad es la bienvenida; dentro de los tests
 * es un tercero escribiendo encima, y tumba desde las medidas de ancho hasta
 * los contadores de mensajes.
 *
 * Marcarla como «ya vista» ANTES de cargar la página deja el lienzo limpio.
 * Va aquí y no en cada spec para que un test nuevo no pueda olvidarse.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("prism-preview-demo", "1");
      } catch {
        /* frame sin acceso a storage */
      }
    });
    // `use` es el callback de fixtures de Playwright, no un hook de React
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page);
  },
});

export { expect };
export type { Page } from "@playwright/test";
