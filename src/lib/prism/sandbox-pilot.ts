/** Prism AI — Piloto del Sandbox: agente de navegador DENTRO de la vista previa.
 *
 * La mitad del §8 (Browser Agent) que se puede construir de verdad: Prism solo
 * opera sobre el iframe que él mismo sirve — pulsar, escribir, cambiar el
 * ancho, leer la página y la consola. Nada de webs ajenas; eso no es posible
 * desde una pestaña y no se finge que lo es.
 *
 * Cómo funciona: el mismo truco del QA visual. El iframe corre con `sandbox`
 * sin `allow-same-origin`, así que el padre no puede tocar su DOM — pero
 * `postMessage` sí cruza. Un runtime pequeño viaja DENTRO del HTML inyectado,
 * recibe órdenes (`prism-pilot-cmd`) y responde (`prism-pilot-result`). Sin
 * eval: tres operaciones fijas (click, type, read) que no pueden hacer nada
 * más que lo que un usuario haría con la página.
 *
 * Los pasos se escriben en un mini-lenguaje de una línea (ver `parsePasos`),
 * se ejecutan en orden y cada uno deja un resultado honesto: ok, fallido y
 * qué logs nuevos de consola aparecieron. El informe final se puede copiar
 * y pegarse al agente del chat para que corrija lo que falló.
 */

import { QA_WIDTHS, type QAResult } from "./visual-qa";

/* ------------------------------------------------------------------ */
/* tipos                                                              */
/* ------------------------------------------------------------------ */

export type PilotOp = "vista" | "pulsar" | "escribir" | "esperar" | "leer" | "qa";

export interface PilotPaso {
  op: PilotOp;
  /** pulsar/escribir: selector CSS o texto visible a buscar */
  target?: string;
  /** escribir: el texto que se pone en el campo */
  value?: string;
  /** vista/qa: ancho en px */
  width?: number;
  /** esperar: milisegundos */
  ms?: number;
  /** línea de origen en el texto del usuario (1-indexed) */
  linea: number;
}

export interface PilotLectura {
  title: string;
  width: number;
  height: number;
  botones: string[];
  enlaces: string[];
  campos: Array<{ etiqueta: string; tipo: string; valor: string }>;
  texto: string;
}

export interface LogNuevo {
  level: string;
  text: string;
}

export interface PilotPasoResultado {
  paso: PilotPaso;
  descripcion: string;
  ok: boolean;
  /** qué pasó, en una línea (éxito o motivo del fallo) */
  detalle: string;
  /** logs que aparecieron mientras el paso se ejecutaba */
  logsNuevos: LogNuevo[];
  /** solo en «leer»: lo que se vio */
  lectura?: PilotLectura;
  /** solo en «qa»: hallazgos medidos */
  qaHallazgos?: number;
  at: number;
}

/* ------------------------------------------------------------------ */
/* parser del mini-lenguaje (puro, testeable)                          */
/* ------------------------------------------------------------------ */

/** minúsculas sin acentos: SOLO para reconocer verbos («Pulsá» ≈ «pulsa»).
 * El objetivo y el valor se extraen SIEMPRE de la línea original: escribir
 * «Comprar leche» debe escribirlo con sus mayúsculas, y un selector #Tarea
 * es sensible a mayúsculas. */
function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** quita comillas envolventes: "x", 'x', «x» */
function unquote(s: string): string {
  const t = s.trim();
  const m = t.match(/^(["'«])([\s\S]*)["'»]$/);
  return m ? m[2].trim() : t;
}

const ANCHO_RE = /^(\d{2,4})\s*(?:px)?$/;

export const PILOT_EJEMPLO = `ve a 320px
pulsa #btn
pulsa "Pulsado"
lee
qa`;

export interface ParseoPasos {
  pasos: PilotPaso[];
  errores: string[];
}

/**
 * Convierte el texto del usuario en pasos. Nunca lanza: lo que no se entienda
 * vuelve en `errores` con el número de línea, para corregirlo antes de correr.
 *
 * El verbo va primero en cada línea y se reconoce sin acentos ni mayúsculas;
 * el resto (objetivo, valor) se toma de la línea tal cual la escribió el
 * usuario, porque ahí las mayúsculas y los acentos son contenido.
 */
export function parsePasos(texto: string): ParseoPasos {
  const pasos: PilotPaso[] = [];
  const errores: string[] = [];
  const lineas = texto.split("\n");
  lineas.forEach((cruda, i) => {
    const n = i + 1;
    const linea = cruda.trim();
    if (!linea || linea.startsWith("//")) return;
    const words = linea.split(/\s+/);
    const verbo = norm(words[0] ?? "");
    const resto = linea.slice(words[0]?.length ?? 0).trim();

    if (verbo === "ve" || verbo === "vista" || verbo === "viewport" || verbo === "ancho") {
      const num = norm(verbo === "ve" ? resto.replace(/^a\s+/i, "") : resto).match(ANCHO_RE);
      const w = num ? Number(num[1]) : NaN;
      if (!num || w < 200 || w > 2000) {
        errores.push(`Línea ${n}: usa un ancho entre 200 y 2000 px, p. ej. «ve a 320px» («${linea}»).`);
        return;
      }
      pasos.push({ op: "vista", width: w, linea: n });
      return;
    }

    if (verbo === "pulsa" || verbo === "pulsar" || verbo === "clic" || verbo === "click" || verbo === "toca" || verbo === "tocar") {
      const target = unquote(resto);
      if (!target) {
        errores.push(`Línea ${n}: ¿pulsar qué? Escribe el texto del botón entre comillas o un selector («${linea}»).`);
        return;
      }
      pasos.push({ op: "pulsar", target, linea: n });
      return;
    }

    if (verbo === "escribe" || verbo === "escribir" || verbo === "introduce" || verbo === "rellena" || verbo === "pon") {
      // valor con comillas primero (puede llevar «en» dentro); si no, parte por
      // el ÚLTIMO «en» para que «escribe hola en español en #c» quede bien
      const conComillas = resto.match(/^"([^"]*)"(?:\s+en\s+([\s\S]+))?$/i);
      if (conComillas) {
        pasos.push({
          op: "escribir",
          value: conComillas[1],
          target: conComillas[2] ? unquote(conComillas[2]) : undefined,
          linea: n,
        });
        return;
      }
      const conEn = resto.match(/^([\s\S]+)\s+en\s+([\s\S]+)$/i);
      if (conEn) {
        pasos.push({ op: "escribir", value: unquote(conEn[1]), target: unquote(conEn[2]), linea: n });
        return;
      }
      if (!resto) {
        errores.push(`Línea ${n}: ¿escribir qué? P. ej. escribe "Hola" en #nombre («${linea}»).`);
        return;
      }
      pasos.push({ op: "escribir", value: unquote(resto), linea: n });
      return;
    }

    if (verbo === "espera" || verbo === "esperar") {
      const ms = Math.min(5000, Math.max(50, Number(resto) || 500));
      pasos.push({ op: "esperar", ms, linea: n });
      return;
    }

    if (verbo === "lee" || verbo === "leer" || verbo === "mira" || verbo === "mirar" || verbo === "lectura" || verbo === "estado") {
      pasos.push({ op: "leer", linea: n });
      return;
    }

    if (verbo === "qa") {
      if (!resto) {
        pasos.push({ op: "qa", linea: n });
        return;
      }
      const num = norm(resto.replace(/^a\s+/i, "")).match(ANCHO_RE);
      const w = num ? Number(num[1]) : NaN;
      if (!num || w < 200 || w > 2000) {
        errores.push(`Línea ${n}: el ancho del QA debe estar entre 200 y 2000 px, p. ej. «qa 390» («${linea}»).`);
        return;
      }
      pasos.push({ op: "qa", width: w, linea: n });
      return;
    }

    errores.push(`Línea ${n}: no la entiendo. Usa pulsa «…», escribe "…" en …, ve a 320px, lee, qa o espera 500 («${linea}»).`);
  });
  return { pasos, errores };
}

/** El paso, dicho en claro para la lista de resultados. */
export function describePaso(paso: PilotPaso): string {
  switch (paso.op) {
    case "vista":
      return `Cambiar el ancho a ${paso.width} px`;
    case "pulsar":
      return `Pulsar «${paso.target}»`;
    case "escribir":
      return paso.target
        ? `Escribir «${paso.value}» en «${paso.target}»`
        : `Escribir «${paso.value}» en el primer campo`;
    case "esperar":
      return `Esperar ${paso.ms} ms`;
    case "leer":
      return "Leer la página";
    case "qa":
      return paso.width ? `Medir QA a ${paso.width} px` : "Medir QA móvil (320 y 390 px)";
  }
}

/* ------------------------------------------------------------------ */
/* el runtime que corre DENTRO del iframe                             */
/* ------------------------------------------------------------------ */

export const PILOT_SCRIPT = `(function(){
if (window.__prismPilot) return;
window.__prismPilot = true;
function recorta(s,n){ s=String(s==null?"":s); return s.length>n ? s.slice(0,n)+"…" : s; }
function visible(el){
  var r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  var s = getComputedStyle(el);
  return s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) !== 0;
}
function textoDirecto(el){
  var t = "";
  for (var i = 0; i < el.childNodes.length; i++){
    if (el.childNodes[i].nodeType === 3) t += el.childNodes[i].nodeValue;
  }
  return t.replace(/\\s+/g, " ").trim();
}
function rotuloDe(el){
  return textoDirecto(el) || el.value || el.getAttribute("aria-label") || el.title || el.placeholder || "";
}
function norm(s){ return String(s||"").toLowerCase().replace(/\\s+/g, " ").trim(); }

/* selector CSS primero; si no parece selector o no existe, por texto visible */
function buscaClic(target){
  try { var porSel = document.querySelector(target); if (porSel) return porSel; } catch (e) {}
  var q = 'button, a, [role="button"], input[type="button"], input[type="submit"], input[type="reset"], label, summary, select, option, [onclick]';
  var todos = document.querySelectorAll(q);
  var objetivo = norm(target);
  for (var i = 0; i < todos.length; i++){
    var el = todos[i];
    if (!visible(el)) continue;
    var t = norm(rotuloDe(el));
    if (t && t.indexOf(objetivo) !== -1) return el;
  }
  return null;
}

function buscaCampo(target){
  var campos = document.querySelectorAll('input, textarea, select, [contenteditable="true"]');
  if (target){
    try { var porSel = document.querySelector(target); if (porSel) return porSel; } catch (e) {}
    var objetivo = norm(target);
    for (var i = 0; i < campos.length; i++){
      var el = campos[i];
      var t = norm(el.name || el.id || el.placeholder || el.getAttribute("aria-label") || "");
      if (t && t.indexOf(objetivo) !== -1) return el;
    }
  }
  for (var j = 0; j < campos.length; j++){
    var c = campos[j];
    if (c.type === "hidden") continue;
    if (visible(c)) return c;
  }
  return null;
}

function lee(){
  var de = document.documentElement;
  var botones = [], enlaces = [], campos = [];
  var bs = document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"], a');
  for (var i = 0; i < bs.length; i++){
    var el = bs[i];
    if (!visible(el)) continue;
    var t = rotuloDe(el);
    if (!t) continue;
    if (el.tagName === "A"){ if (enlaces.length < 8) enlaces.push(recorta(t, 40)); }
    else if (botones.length < 8) botones.push(recorta(t, 40));
  }
  var cs = document.querySelectorAll('input, textarea, select');
  for (var j = 0; j < cs.length && campos.length < 8; j++){
    var c = cs[j];
    if (c.type === "hidden" || !visible(c)) continue;
    campos.push({
      etiqueta: recorta(c.name || c.id || c.placeholder || c.getAttribute("aria-label") || c.type || "campo", 30),
      tipo: c.tagName.toLowerCase() === "input" ? (c.type || "text") : c.tagName.toLowerCase(),
      valor: recorta(c.value || "", 30)
    });
  }
  return {
    title: document.title || "",
    width: de.clientWidth,
    height: de.clientHeight,
    botones: botones,
    enlaces: enlaces,
    campos: campos,
    texto: recorta(((document.body && document.body.innerText) || "").replace(/\\s+/g, " ").trim(), 600)
  };
}

function responde(token, ok, data){
  try { parent.postMessage({ type: "prism-pilot-result", token: token, ok: ok, data: data }, "*"); } catch (e) {}
}

window.addEventListener("message", function(e){
  var d = e.data;
  if (!d || d.type !== "prism-pilot-cmd" || typeof d.token !== "number") return;
  var cmd = d.cmd || {};
  if (cmd.op === "click"){
    var el = buscaClic(String(cmd.target || ""));
    if (!el){
      responde(d.token, false, { error: "No encontré nada pulsable que coincida con «" + recorta(cmd.target, 40) + "»." });
      return;
    }
    try {
      try { el.scrollIntoView({ block: "center" }); } catch (e2) {}
      var desc = rotuloDe(el) || el.tagName.toLowerCase();
      el.click();
      responde(d.token, true, { detalle: recorta(desc, 60), tag: el.tagName.toLowerCase() });
    } catch (err) {
      responde(d.token, false, { error: "Falló el clic: " + err });
    }
  } else if (cmd.op === "type"){
    var campo = buscaCampo(cmd.target ? String(cmd.target) : null);
    if (!campo){
      responde(d.token, false, { error: "No encontré ningún campo donde escribir" + (cmd.target ? " que coincida con «" + recorta(cmd.target, 40) + "»" : "") + "." });
      return;
    }
    try {
      campo.focus();
      var valor = String(cmd.value == null ? "" : cmd.value);
      if (campo.isContentEditable){
        campo.textContent = valor;
      } else {
        var proto = campo.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype
          : (campo.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype);
        var setter = Object.getOwnPropertyDescriptor(proto, "value").set;
        setter.call(campo, valor);
      }
      campo.dispatchEvent(new Event("input", { bubbles: true }));
      campo.dispatchEvent(new Event("change", { bubbles: true }));
      responde(d.token, true, {
        detalle: recorta(valor, 40),
        campo: recorta(campo.name || campo.id || campo.placeholder || campo.type || "campo", 30)
      });
    } catch (err) {
      responde(d.token, false, { error: "Falló al escribir: " + err });
    }
  } else if (cmd.op === "read"){
    responde(d.token, true, lee());
  } else {
    responde(d.token, false, { error: "Operación desconocida: " + String(cmd.op) });
  }
});

/* aviso de que el runtime ya está dentro (el padre lo usa para saber que puede operar) */
setTimeout(function(){ try { parent.postMessage({ type: "prism-pilot-ready" }, "*"); } catch (e) {} }, 100);
})();`;

/** Inyecta el runtime del piloto en el HTML de la vista previa (idempotente). */
export function injectPilot(html: string): string {
  if (!html || html.includes("prism-pilot-cmd")) return html;
  const tag = `<script>${PILOT_SCRIPT}</script>`;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${tag}</body>`);
  if (/<\/html>/i.test(html)) return html.replace(/<\/html>/i, `${tag}</html>`);
  return html + tag;
}

/* ------------------------------------------------------------------ */
/* el corredor que vive FUERA (en el componente)                       */
/* ------------------------------------------------------------------ */

export interface PilotCmd {
  op: "click" | "type" | "read";
  target?: string;
  value?: string;
}

/** Manda una orden al iframe y espera su respuesta. Sin respuesta en el
 * tiempo límite devuelve fallo — nunca un éxito inventado. */
export function enviarCmdPiloto(
  win: Window,
  cmd: PilotCmd,
  timeoutMs = 2500
): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  return new Promise((resolve) => {
    const token = (Date.now() ^ Math.floor(Math.random() * 1e6)) >>> 0;
    let cerrado = false;
    const fin = (r: { ok: boolean; data: Record<string, unknown> }) => {
      if (cerrado) return;
      cerrado = true;
      window.removeEventListener("message", onMsg);
      resolve(r);
    };
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string; token?: number; ok?: boolean; data?: Record<string, unknown> } | null;
      if (!d || d.type !== "prism-pilot-result" || d.token !== token) return;
      fin({ ok: !!d.ok, data: d.data ?? {} });
    };
    window.addEventListener("message", onMsg);
    try {
      win.postMessage({ type: "prism-pilot-cmd", token, cmd }, "*");
    } catch {
      fin({ ok: false, data: { error: "No se pudo enviar la orden al proyecto." } });
      return;
    }
    setTimeout(() => fin({ ok: false, data: { error: "El proyecto no respondió a la orden (¿sigue en marcha?)." } }), timeoutMs);
  });
}

function dormir(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** ¿Fue un error de consola lo que dejó el paso? (para contarlo en el informe) */
function erroresDe(logs: LogNuevo[]): LogNuevo[] {
  return logs.filter((l) => l.level === "error");
}

export interface EjecutarOpciones {
  frame: HTMLIFrameElement;
  win: Window;
  pasos: PilotPaso[];
  /** nº de líneas de consola acumuladas (para sacar las nuevas de cada paso) */
  totalLogs: () => number;
  /** logs acumulados desde un índice */
  logsDesde: (i: number) => LogNuevo[];
  /** batería QA (la manda el componente para reutilizar runVisualQA) */
  medirQA: (widths: readonly number[]) => Promise<QAResult[]>;
  /** ancho del iframe antes de empezar, para restaurarlo al final */
  anchoPrevio?: string | null;
  /** pintar cada paso en cuanto termina (resultados en vivo) */
  onPaso?: (r: PilotPasoResultado) => void;
  /** el usuario pidió parar: se respeta entre pasos */
  abortado?: () => boolean;
}

/**
 * Ejecuta los pasos en orden sobre el iframe. Cada paso deja un resultado con
 * su detalle y los logs nuevos de consola. Al final restaura el ancho que
 * tenía la vista. Nunca lanza: los fallos son resultados.
 */
export async function ejecutarPasosPiloto(op: EjecutarOpciones): Promise<PilotPasoResultado[]> {
  const resultados: PilotPasoResultado[] = [];
  const fin = () => {
    op.frame.style.width = op.anchoPrevio ?? "";
  };
  try {
    for (const paso of op.pasos) {
      if (op.abortado?.()) {
        resultados.push({
          paso,
          descripcion: describePaso(paso),
          ok: false,
          detalle: "Prueba detenida por el usuario antes de este paso.",
          logsNuevos: [],
          at: Date.now(),
        });
        continue;
      }
      const i0 = op.totalLogs();
      const r = await ejecutarUnPaso(paso, i0, op);
      resultados.push(r);
      op.onPaso?.(r);
    }
  } finally {
    fin();
  }
  return resultados;
}

async function ejecutarUnPaso(
  paso: PilotPaso,
  i0: number,
  op: EjecutarOpciones
): Promise<PilotPasoResultado> {
  const base = { paso, descripcion: describePaso(paso), at: Date.now() };
  try {
    if (paso.op === "vista") {
      op.frame.style.width = `${paso.width}px`;
      // dos frames para que el reflow dentro del iframe se asiente
      await dormir(350);
      const logsNuevos = op.logsDesde(i0);
      return { ...base, ok: true, detalle: `La vista ahora mide ${paso.width} px de ancho.`, logsNuevos };
    }
    if (paso.op === "esperar") {
      await dormir(Math.min(5000, Math.max(50, paso.ms ?? 500)));
      const logsNuevos = op.logsDesde(i0);
      return { ...base, ok: true, detalle: `Esperados ${paso.ms} ms.`, logsNuevos };
    }
    if (paso.op === "qa") {
      const widths = paso.width ? [paso.width] : QA_WIDTHS;
      const rs = await op.medirQA(widths);
      const hallazgos = rs.reduce((n, r) => n + (r.noRespondio || r.ok ? 0 : r.items.length), 0);
      const sinRespuesta = rs.every((r) => r.noRespondio);
      const logsNuevos = op.logsDesde(i0);
      return {
        ...base,
        ok: true,
        detalle: sinRespuesta
          ? "El medidor no respondió (¿el HTML lleva el QA dentro?)."
          : hallazgos === 0
            ? `Sin problemas medidos a ${widths.join(" / ")} px.`
            : `${hallazgos} hallazgo(s) medido(s) a ${widths.join(" / ")} px — mira la pestaña QA.`,
        logsNuevos,
        qaHallazgos: hallazgos,
      };
    }
    if (paso.op === "leer") {
      const r = await enviarCmdPiloto(op.win, { op: "read" });
      if (!r.ok) {
        return { ...base, ok: false, detalle: String(r.data.error ?? "Sin respuesta."), logsNuevos: op.logsDesde(i0) };
      }
      const l = r.data as unknown as PilotLectura;
      const partes = [
        l.botones.length ? `botones: ${l.botones.slice(0, 4).map((b) => `«${b}»`).join(", ")}` : null,
        l.enlaces.length ? `enlaces: ${l.enlaces.slice(0, 3).map((b) => `«${b}»`).join(", ")}` : null,
        l.campos.length ? `campos: ${l.campos.length}` : "sin campos",
      ].filter(Boolean);
      await dormir(150);
      return { ...base, ok: true, detalle: partes.join(" · "), logsNuevos: op.logsDesde(i0), lectura: l };
    }
    // pulsar / escribir: operación dentro del iframe + un respiro para que los
    // efectos (logs, errores asíncronos) aparezcan y se cuenten en ESTE paso
    const cmd: PilotCmd =
      paso.op === "pulsar" ? { op: "click", target: paso.target } : { op: "type", target: paso.target, value: paso.value };
    const r = await enviarCmdPiloto(op.win, cmd);
    await dormir(400);
    const logsNuevos = op.logsDesde(i0);
    if (!r.ok) {
      return { ...base, ok: false, detalle: String(r.data.error ?? "Sin respuesta."), logsNuevos };
    }
    const detalle =
      paso.op === "pulsar"
        ? `Pulsado «${r.data.detalle ?? paso.target}».`
        : `Escrito «${r.data.detalle ?? paso.value}»${r.data.campo ? ` en «${r.data.campo}»` : ""}.`;
    const conErrores = erroresDe(logsNuevos);
    return {
      ...base,
      ok: conErrores.length === 0,
      detalle: conErrores.length
        ? `${detalle} Dejó ${conErrores.length} error(es) nuevo(s) en la consola.`
        : detalle,
      logsNuevos,
    };
  } catch (e) {
    return {
      ...base,
      ok: false,
      detalle: e instanceof Error ? e.message : String(e),
      logsNuevos: op.logsDesde(i0),
    };
  }
}

/* ------------------------------------------------------------------ */
/* el informe (puro, para copiar al agente del chat)                   */
/* ------------------------------------------------------------------ */

/** Texto del informe para pegarlo al agente y que corrija lo que falló. */
export function informePiloto(
  proyecto: string,
  resultados: PilotPasoResultado[],
  erroresConsola: string[] = []
): string {
  const ok = resultados.filter((r) => r.ok).length;
  const mal = resultados.length - ok;
  const lineas: string[] = [];
  lineas.push(`Informe del Piloto del Sandbox${proyecto ? ` — «${proyecto}»` : ""}`);
  lineas.push(
    `Pasos ejecutados: ${resultados.length} · OK: ${ok} · fallidos: ${mal}.`
  );
  lineas.push("");
  resultados.forEach((r, i) => {
    lineas.push(`${i + 1}. ${r.ok ? "OK" : "FALLÓ"} — ${r.descripcion}`);
    if (r.detalle) lineas.push(`   ${r.detalle}`);
    const errs = erroresDe(r.logsNuevos);
    if (errs.length) {
      for (const e of errs.slice(0, 3)) lineas.push(`   consola: ${e.text.slice(0, 160)}`);
    }
  });
  if (erroresConsola.length) {
    lineas.push("");
    lineas.push(`Errores de consola durante la prueba (${erroresConsola.length}):`);
    for (const e of erroresConsola.slice(0, 6)) lineas.push(`- ${e.slice(0, 200)}`);
  }
  if (mal > 0 || erroresConsola.length) {
    lineas.push("");
    lineas.push(
      "Corrige lo que falló (los pasos son verificables: un «FALLÓ» es un elemento que no existe o un error real de la página), entrega el archivo COMPLETO corregido y lo vuelvo a probar con estos mismos pasos."
    );
  }
  return lineas.join("\n");
}
