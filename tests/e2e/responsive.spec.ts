import {  expect, test, type Page  } from "./fixtures";

/** Prism AI — la interfaz cabe en la pantalla, también en las estrechas.
 *
 * Fija dos regresiones concretas que ya ocurrieron: a 320 px el campo de
 * escribir se quedaba sin ancho y el texto se partía letra a letra, y el botón
 * de Ajustes acababa fuera del viewport porque el selector de modelo no podía
 * encogerse. Se mide, no se mira. */
async function seed(page: Page) {
  await page.addInitScript(() => {
    if (window.top !== window.self) return;
    const s = { state: { sessions: [], activeSessionId: null, onboardingDone: true, favorites: [], radarSeenIds: [], settings: { defaultModelKey: "custom::mock-mini-free", systemPrompt: "x", temperature: 0.7, maxTokens: null, stream: true, contextWindow: 10, sendKeyOnProxy: true, onlyFree: false, agentMode: false, agentMaxLoops: 3, accent: "violeta", accentCustom: "#8b5cf6", autoSpeak: false, accessCode: "", compression: "off", outputStyle: "normal", piiShield: true }, providers: { custom: { apiKey: "k", baseUrl: "/api/mock-llm", enabled: true, models: ["mock-mini-free"], useProxy: false } }, version: 1 }, version: 0 };
    try { localStorage.setItem("prism-ai-v1", JSON.stringify(s)); } catch {}
  });
}
for (const w of [320, 390, 768, 1440]) {
  test(`sin desbordes a ${w}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 780 });
    await seed(page);
    await page.goto("/");
    await expect(page.getByPlaceholder("Escribe tu mensaje…")).toBeVisible({ timeout: 30_000 });
    const r = await page.evaluate((vw) => {
      /** Un elemento que algún ancestro recorta no puede pintarse fuera de la
       *  pantalla, por muy ancha que sea su caja: es el caso de los adornos de
       *  fondo (un resplandor de 28rem centrado dentro de un `overflow-hidden`).
       *  Lo que sí importa —un diálogo o una barra que se salen de verdad— no
       *  está recortado por nadie, y se sigue detectando igual. */
      const loRecortaAlguien = (el: Element): boolean => {
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const ov = getComputedStyle(p).overflowX;
          if (ov !== "visible") return true;
        }
        return false;
      };
      const fuera: string[] = [];
      document.querySelectorAll("body *").forEach((el) => {
        const b = el.getBoundingClientRect();
        if (b.width > 0 && b.height > 0 && (b.right > vw + 1 || b.left < -1)) {
          if (loRecortaAlguien(el)) return;
          fuera.push(`${el.tagName}[${(el.getAttribute("aria-label") || "").slice(0,24)}] ${Math.round(b.left)}..${Math.round(b.right)}`);
        }
      });
      const ta = document.querySelector("textarea");
      return {
        scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        fuera: fuera.slice(0, 5),
        anchoCampo: ta ? Math.round(ta.getBoundingClientRect().width) : -1,
      };
    }, w);
    console.log(`${w}px → scrollH=${r.scroll} campo=${r.anchoCampo}px fuera=${JSON.stringify(r.fuera)}`);
    expect(r.scroll, "scroll horizontal").toBe(0);
    expect(r.fuera, "elementos fuera del viewport").toEqual([]);
    expect(r.anchoCampo, "ancho del campo de escribir").toBeGreaterThan(150);
  });
}
