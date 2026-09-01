"use client";
/** Prism AI — REPL de JavaScript aislado para el agente (tool `run_js`).
 *
 * `run_project` arranca el proyecto ENTERO: sirve para ver si la web
 * funciona, pero es el martillo. Cuando el agente quiere probar UNA
 * función («¿y si parseo la fecha así?»), arrancar todo el proyecto
 * son segundos y tokens; y muchas veces ni siquiera hay proyecto.
 *
 * Aquí se crea un iframe OCULTO con `sandbox="allow-scripts"` (sin
 * `allow-same-origin`: el código no toca las claves ni el DOM de Prism,
 * igual que el ejecutor del Sandbox), se inyecta el snippet y se recoge:
 *  - el valor de la variable `resultado` (contrato simple y explícito:
 *    el modelo lo sabe por la descripción de la tool),
 *  - todo lo que pasó por console.log/info/warn/error.
 *
 * Sin red especial: el iframe puede hacer fetch como cualquier página
 * (CORS incluido), pero la tool para datos en JSON es `fetch_api`, que
 * filtra campos y ahorra tokens. Aquí no se filtra nada porque no se
 * promete nada.
 *
 * El serializador (`serializar`) es la parte pura y va con sus tests;
 * el iframe es navegador y lo prueba el E2E.
 */

/** Resultado de ejecutar un snippet. */
export interface ReplOutcome {
  /** true si el código terminó sin lanzar. */
  ok: boolean;
  /** El valor de `resultado`, serializado a texto (o el error). */
  valor: string;
  /** Líneas de consola recogidas: `[log] …`, `[error] …`. */
  logs: string[];
  /** ms desde el inicio hasta la respuesta (o el timeout). */
  ms: number;
}

/** Techo de espera: el agente itera; un snippet que no acaba en 5 s
 * está en bucle infinito y es mejor devolvérselo tal cual. */
export const TIMEOUT_REPL_MS = 5_000;

/** Techo de líneas de consola que se devuelven (el resto se cuenta). */
const MAX_LOGS = 15;

/** Origen del puente postMessage del REPL. */
const REPL_ORIGIN = "prism-repl";

/* ------------------------------------------------------------------ */
/* serializador (puro, testeable)                                      */
/* ------------------------------------------------------------------ */

/** Tope de profundidad al serializar objetos anidados. */
const PROFUNDIDAD_MAX = 3;
/** Tope de items de array / claves de objeto que se muestran. */
const ITEMS_MAX = 30;
/** Tope de caracteres por string. */
const STRING_MAX = 300;

function escapeCadena(s: string): string {
  const corto = s.length > STRING_MAX ? s.slice(0, STRING_MAX) + `…(+${s.length - STRING_MAX})` : s;
  return JSON.stringify(corto);
}

/** Serializa un valor de JS a texto legible para el modelo, sin romperse
 * con ciclos, profundidad infinita ni Proxy hostiles. */
export function serializar(valor: unknown, profundidad = 0, vistos: Set<object> = new Set()): string {
  if (valor === null) return "null";
  if (valor === undefined) return "undefined";
  const t = typeof valor;
  if (t === "string") return escapeCadena(valor as string);
  if (t === "number" || t === "boolean" || t === "bigint") return String(valor);
  if (t === "symbol") return String(valor);
  if (t === "function") {
    const f = valor as { name?: string };
    return `[Function${f.name ? ` ${f.name}` : ""}]`;
  }
  if (valor instanceof Error) {
    return `${valor.name}: ${valor.message}`;
  }
  if (profundidad >= PROFUNDIDAD_MAX) {
    return Array.isArray(valor) ? "[…]" : "{…}";
  }
  const obj = valor as object;
  if (vistos.has(obj)) return "[circular]";
  vistos.add(obj);
  try {
    if (Array.isArray(valor)) {
      const items = valor.slice(0, ITEMS_MAX).map((v) => serializar(v, profundidad + 1, vistos));
      const mas = valor.length > ITEMS_MAX ? `, …(+${valor.length - ITEMS_MAX})` : "";
      return `[${items.join(", ")}${mas}]`;
    }
    if (valor instanceof Map) {
      const items = Array.from(valor.entries()).slice(0, ITEMS_MAX).map(
        ([k, v]) => `${serializar(k, profundidad + 1, vistos)} => ${serializar(v, profundidad + 1, vistos)}`
      );
      return `Map(${valor.size}) {${items.join(", ")}}`;
    }
    if (valor instanceof Set) {
      const items = Array.from(valor.values()).slice(0, ITEMS_MAX).map(
        (v) => serializar(v, profundidad + 1, vistos)
      );
      return `Set(${valor.size}) {${items.join(", ")}}`;
    }
    if (valor instanceof Date) return valor.toISOString();
    // objeto plano (o clase): solo sus propias claves
    const claves = Object.keys(valor as Record<string, unknown>).slice(0, ITEMS_MAX);
    const total = Object.keys(valor as Record<string, unknown>).length;
    const pares = claves.map(
      (k) => `${k}: ${serializar((valor as Record<string, unknown>)[k], profundidad + 1, vistos)}`
    );
    if (total > ITEMS_MAX) pares.push(`…(+${total - ITEMS_MAX} claves)`);
    return `{${pares.join(", ")}}`;
  } finally {
    vistos.delete(obj);
  }
}

/* ------------------------------------------------------------------ */
/* el HTML del REPL                                                    */
/* ------------------------------------------------------------------ */

/** Construye el srcdoc del REPL. Exportada para tests: lo importante
 * que se prueba aquí es que un `</script>` dentro del código del usuario
 * NO rompa el srcdoc (la inyección clásica de HTML). */
export function buildSrcdoc(codigo: string): string {
  const seguro = JSON.stringify(codigo).replace(/<\/script/gi, "<\\/script");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script>
(function(){
  var ORIGEN = ${JSON.stringify(REPL_ORIGIN)};
  var SER = ${serializar.toString()};
  function post(m){ try{ parent.postMessage(Object.assign({source:ORIGEN}, m), "*"); }catch(e){} }
  ["log","info","warn","error"].forEach(function(k){
    var orig = console[k] ? console[k].bind(console) : function(){};
    console[k] = function(){
      var args = Array.prototype.slice.call(arguments);
      post({type:"console", level:k, text:args.map(function(x){ try{ return SER(x); }catch(e){ return String(x); } }).join(" ")});
      try{ orig.apply(null, args); }catch(e){}
    };
  });
  window.addEventListener("error", function(e){ post({type:"console", level:"error", text:"Uncaught " + e.message}); });
  function main(){
    try{
      var f = new Function('"use strict";return (async () => {' + ${seguro} + '\\n;return (typeof resultado !== "undefined" ? resultado : undefined);})();');
      Promise.resolve(f()).then(function(r){
        post({type:"fin", ok:true, valor:SER(r)});
      }, function(err){
        post({type:"fin", ok:false, valor:SER(err)});
      });
    }catch(e){
      post({type:"fin", ok:false, valor:SER(e)});
    }
  }
  main();
})();
</script></body></html>`;
}

/* ------------------------------------------------------------------ */
/* ejecución                                                           */
/* ------------------------------------------------------------------ */

/** Ejecuta un snippet en el iframe aislado y recoge resultado + consola.
 * No lanza: los errores del código del usuario vuelven como `ok:false`
 * con el mensaje serializado, que es justo lo que el modelo necesita. */
export function runJsInMemory(codigo: string): Promise<ReplOutcome> {
  const inicio = Date.now();
  const logs: string[] = [];
  return new Promise<ReplOutcome>((resolve) => {
    if (typeof document === "undefined") {
      resolve({ ok: false, valor: "ERROR: sin navegador (entorno de servidor).", logs: [], ms: 0 });
      return;
    }
    let resuelto = false;
    const terminar = (r: ReplOutcome) => {
      if (resuelto) return;
      resuelto = true;
      window.removeEventListener("message", onMsg);
      clearTimeout(timer);
      try {
        iframe.remove();
      } catch {
        /* noop */
      }
      resolve(r);
    };

    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "1px";
    iframe.style.height = "1px";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    iframe.style.zIndex = "-1";
    iframe.style.border = "0";
    // allow-scripts SIN allow-same-origin: sin acceso a las claves de Prism
    iframe.sandbox.add("allow-scripts");
    iframe.srcdoc = buildSrcdoc(codigo);

    const onMsg = (e: MessageEvent) => {
      if (iframe.contentWindow && e.source !== iframe.contentWindow) return;
      const d = e.data as { source?: string; type?: string; level?: string; text?: string; ok?: boolean; valor?: string } | null;
      if (!d || d.source !== REPL_ORIGIN) return;
      if (d.type === "console" && typeof d.text === "string") {
        logs.push(`[${d.level ?? "log"}] ${d.text}`);
        return;
      }
      if (d.type === "fin") {
        const visibles = logs.slice(0, MAX_LOGS);
        const mas = logs.length > MAX_LOGS ? `\n…(+${logs.length - MAX_LOGS} líneas más)` : "";
        terminar({
          ok: !!d.ok,
          valor: d.valor ?? "undefined",
          logs: [...visibles, ...(mas ? [mas] : [])],
          ms: Date.now() - inicio,
        });
      }
    };
    window.addEventListener("message", onMsg);

    const timer = setTimeout(() => {
      const visibles = logs.slice(0, MAX_LOGS);
      terminar({
        ok: false,
        valor: `ERROR: el código no terminó en ${TIMEOUT_REPL_MS / 1000} s (¿bucle infinito?). Se descartó.`,
        logs: visibles,
        ms: Date.now() - inicio,
      });
    }, TIMEOUT_REPL_MS);

    document.body.appendChild(iframe);
  });
}
