/** Prism AI — QA visual sobre la vista previa.
 *
 * El mismo método que mide la app en los tests E2E (`tests/e2e/responsive.spec.ts`)
 * aplicado al iframe de la vista previa, a los anchos donde de verdad se mira:
 * 320 y 390 px. Detecta, midiendo el DOM real:
 *   · scroll horizontal (se sale por la derecha)
 *   · elementos fuera del viewport (botón inalcanzable)
 *   · texto por debajo de 12 px
 *   · contraste insuficiente entre texto y fondo
 *
 * Detalle técnico que decide el diseño: el iframe corre con `sandbox` SIN
 * `allow-same-origin`, así que el padre NO puede leer su DOM (y bien que hace).
 * Pero `postMessage` sí atraviesa, así que el medidor viaja DENTRO del HTML
 * inyectado y reporta desde dentro. El script es pasivo: no toca la página, no
 * hace red, solo escucha una petición de medida y responde.
 */

export type QATipo = "scroll" | "fuera" | "texto" | "contraste";

export interface QAItem {
  tipo: QATipo;
  detalle: string;
}

export interface QAResult {
  /** ancho al que se midió */
  width: number;
  ok: boolean;
  items: QAItem[];
  at: number;
  /** true si el iframe no respondió (HTML sin el medidor dentro): no se mide, no se inventa */
  noRespondio?: boolean;
}

/** Anchos de la misma batería móvil que los tests E2E (320 = iPhone SE) */
export const QA_WIDTHS = [320, 390] as const;

export const QA_LABEL: Record<QATipo, string> = {
  scroll: "Scroll horizontal",
  fuera: "Fuera de pantalla",
  texto: "Texto < 12 px",
  contraste: "Contraste",
};

/** Regla de memoria de fallos asociada a cada tipo de hallazgo */
export function reglaDeQA(tipo: QATipo): string {
  switch (tipo) {
    case "scroll":
      return "La página no debe tener scroll horizontal en móvil: usa anchos fluidos (max-width, box-sizing: border-box, flex-wrap) en vez de anchos fijos en px.";
    case "fuera":
      return "Todos los elementos interactivos deben quedar dentro del viewport en móvil: revisa anchos fijos mayores que la pantalla y posicionamientos absolutos que se van fuera.";
    case "texto":
      return "El cuerpo de texto debe medir al menos 12 px para que sea legible en móvil.";
    case "contraste":
      return "Mantén un contraste mínimo de 4.5:1 entre texto y fondo (3:1 en texto grande).";
  }
}

/* ------------------------------------------------------------------ */
/* el medidor que corre DENTRO del iframe                             */
/* ------------------------------------------------------------------ */

export const VISUAL_QA_SCRIPT = `(function(){
if (window.__prismQA) return;
window.__prismQA = true;
function loRecortaAlguien(el){
  for (var p = el.parentElement; p && p !== document.body; p = p.parentElement){
    if (getComputedStyle(p).overflowX !== "visible") return true;
  }
  return false;
}
function visible(el){
  var r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  var s = getComputedStyle(el);
  return s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) !== 0;
}
function textoDe(el){
  var t = "";
  for (var i = 0; i < el.childNodes.length; i++){
    if (el.childNodes[i].nodeType === 3) t += el.childNodes[i].nodeValue;
  }
  return t.replace(/\\s+/g, " ").trim();
}
function parseColor(s){
  var m = s.match(/rgba?\\(([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+)(?:,\\s*([\\d.]+))?\\)/);
  return m ? { r:+m[1], g:+m[2], b:+m[3], a:(m[4]===undefined?1:+m[4]) } : null;
}
function luminancia(r,g,b){
  var a = [r,g,b].map(function(v){
    v /= 255;
    return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4);
  });
  return 0.2126*a[0] + 0.7152*a[1] + 0.0722*a[2];
}
function fondoDe(el){
  var cur = el;
  while (cur && cur !== document.documentElement){
    var c = parseColor(getComputedStyle(cur).backgroundColor);
    if (c && c.a > 0.85) return c;
    cur = cur.parentElement;
  }
  var body = parseColor(getComputedStyle(document.body).backgroundColor);
  if (body && body.a > 0.85) return body;
  return { r:255, g:255, b:255, a:1 };
}
function recorta(s, n){
  return s.length > n ? s.slice(0, n) + "…" : s;
}
function medir(){
  var issues = [];
  var de = document.documentElement;
  var vw = de.clientWidth;
  var scroll = de.scrollWidth - vw;
  if (scroll > 0) {
    issues.push({ tipo:"scroll", detalle:"La página se sale " + scroll + "px por la derecha a " + vw + "px de ancho." });
  }
  var fuera = [];
  var todos = document.querySelectorAll("body *");
  for (var i = 0; i < todos.length && fuera.length < 5; i++){
    var el = todos[i];
    if (!visible(el)) continue;
    var b = el.getBoundingClientRect();
    if ((b.right > vw + 1 || b.left < -1) && !loRecortaAlguien(el)) {
      fuera.push(el.tagName.toLowerCase() + (el.getAttribute("aria-label") ? "[" + recorta(el.getAttribute("aria-label"), 24) + "]" : "") + " " + Math.round(b.left) + ".." + Math.round(b.right));
    }
  }
  if (fuera.length) issues.push({ tipo:"fuera", detalle:"Elementos fuera de la pantalla: " + fuera.join("; ") + "." });
  var pequenos = [];
  var vistosT = {};
  for (var j = 0; j < todos.length && pequenos.length < 6; j++){
    var el2 = todos[j];
    if (!visible(el2)) continue;
    var txt = textoDe(el2);
    if (!txt) continue;
    var px = parseFloat(getComputedStyle(el2).fontSize);
    if (!(px < 12)) continue;
    var key = el2.tagName + Math.round(px * 10);
    if (vistosT[key]) continue;
    vistosT[key] = 1;
    pequenos.push("<" + el2.tagName.toLowerCase() + "> " + px.toFixed(1) + "px «" + recorta(txt, 24) + "»");
  }
  if (pequenos.length) issues.push({ tipo:"texto", detalle:"Texto por debajo de 12 px: " + pequenos.join("; ") + "." });
  var contras = [];
  var vistosC = {};
  for (var k = 0; k < todos.length && contras.length < 6; k++){
    var el3 = todos[k];
    if (!visible(el3)) continue;
    var txt3 = textoDe(el3);
    if (!txt3 || txt3.length < 3) continue;
    var s3 = getComputedStyle(el3);
    var fg = parseColor(s3.color);
    if (!fg) continue;
    var bg = fondoDe(el3);
    var L1 = luminancia(fg.r, fg.g, fg.b);
    var L2 = luminancia(bg.r, bg.g, bg.b);
    var ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    var tam = parseFloat(s3.fontSize);
    var grande = tam >= 24 || (tam >= 18.66 && (s3.fontWeight === "bold" || Number(s3.fontWeight) >= 700));
    if (ratio >= (grande ? 3 : 4.5)) continue;
    var keyC = s3.color + "|" + el3.tagName;
    if (vistosC[keyC]) continue;
    vistosC[keyC] = 1;
    contras.push(el3.tagName.toLowerCase() + " «" + recorta(txt3, 18) + "» " + ratio.toFixed(2) + ":1");
  }
  if (contras.length) issues.push({ tipo:"contraste", detalle:"Contraste insuficiente: " + contras.join("; ") + "." });
  return { width: vw, ok: issues.length === 0, items: issues, at: Date.now() };
}
function responder(token){
  try { parent.postMessage({ type:"prism-qa-result", token: token, result: medir() }, "*"); } catch (e) {}
}
window.addEventListener("message", function(e){
  var d = e.data;
  if (!d || d.type !== "prism-qa-run") return;
  requestAnimationFrame(function(){ requestAnimationFrame(function(){ responder(d.token); }); });
});
function auto(){ setTimeout(function(){ responder(0); }, 300); }
if (document.readyState === "complete") auto();
else window.addEventListener("load", auto);
})();`;

/** Inyecta el medidor en el HTML de la vista previa (idempotente). */
export function injectVisualQA(html: string): string {
  if (!html || html.includes("prism-qa-run")) return html;
  const tag = `<script>${VISUAL_QA_SCRIPT}</script>`;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${tag}</body>`);
  if (/<\/html>/i.test(html)) return html.replace(/<\/html>/i, `${tag}</html>`);
  return html + tag;
}

/* ------------------------------------------------------------------ */
/* el corredor que vive FUERA (en los paneles)                        */
/* ------------------------------------------------------------------ */

/** Mide un ancho: lo cambia, pide la medida y restaura. Sin respuesta (el HTML
 * no lleva el medidor dentro) devuelve noRespondio, nunca un falso OK. */
function medirAncho(
  frame: HTMLIFrameElement,
  win: Window,
  width: number
): Promise<QAResult> {
  return new Promise((resolve) => {
    const token = (Date.now() ^ Math.floor(Math.random() * 1e6)) >>> 0;
    const prev = frame.style.width;
    let cerrado = false;
    const fin = (r: QAResult) => {
      if (cerrado) return;
      cerrado = true;
      window.removeEventListener("message", onMsg);
      frame.style.width = prev;
      resolve(r);
    };
    const onMsg = (e: MessageEvent) => {
      if (e.source !== win) return;
      const d = e.data as { type?: string; token?: number; result?: QAResult } | null;
      if (!d || d.type !== "prism-qa-result" || d.token !== token) return;
      fin(d.result ?? { width, ok: false, items: [], at: Date.now() });
    };
    window.addEventListener("message", onMsg);
    frame.style.width = `${width}px`;
    try {
      win.postMessage({ type: "prism-qa-run", token }, "*");
    } catch {
      fin({ width, ok: true, items: [], at: Date.now(), noRespondio: true });
      return;
    }
    setTimeout(
      () => fin({ width, ok: true, items: [], at: Date.now(), noRespondio: true }),
      2500
    );
  });
}

/** Corre la batería de QA sobre un iframe a los anchos indicados. */
export async function runVisualQA(
  frame: HTMLIFrameElement | null,
  widths: readonly number[] = QA_WIDTHS
): Promise<QAResult[]> {
  const win = frame?.contentWindow;
  if (!frame || !win) return [];
  const results: QAResult[] = [];
  for (const w of widths) {
    results.push(await medirAncho(frame, win, w));
  }
  return results;
}

/** Escucha la medida automática que el medidor manda al cargar (token 0). */
export function onQAAutoResult(cb: (r: QAResult) => void): () => void {
  const onMsg = (e: MessageEvent) => {
    const d = e.data as { type?: string; token?: number; result?: QAResult } | null;
    if (!d || d.type !== "prism-qa-result" || d.token !== 0 || !d.result) return;
    cb(d.result);
  };
  window.addEventListener("message", onMsg);
  return () => window.removeEventListener("message", onMsg);
}
