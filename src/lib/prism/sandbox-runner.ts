"use client";
/** Prism AI — Ejecutor del Sandbox en memoria (para el bucle del agente).
 *
 * Hoy (pre-v3.15) el Sandbox vive en `sandbox-studio.tsx`: el usuario
 * pulsa «Ejecutar» y el HTML autocontenido se carga en un iframe visible.
 * Los logs se pintan en la pestaña Consola. El agente no tiene acceso
 * a eso: escribe código y te pregunta a ti si funciona.
 *
 * Aquí se monta un ejecutor SEPARADO: dado un mapa de archivos, construye
 * el HTML autocontenido (con `buildRunHtml` + puente de consola + QA),
 * lo sirve en un iframe OCULTO, espera a que cargue y recoge los logs
 * de consola durante un tiempo configurable. Devuelve un `RunOutcome`
 * que el tool `run_project` le pasa al modelo.
 *
 * El iframe se crea y se destruye en cada llamada: no se acumula, no
 * comparte estado con el Sandbox visible. Si el usuario tiene el
 * Sandbox abierto, este ejecutor no lo toca.
 *
 * Regla del PLAN-V4: el resultado vuelve al `agent-loop` en vez de a
 * la pantalla. La UI sigue mostrando el chat; el agente lee sus
 * propios errores y los corrige.
 */
import { buildRunHtml, pickEntryPath, isHtmlPath, SANDBOX_ORIGIN } from "./sandbox";
import { injectVisualQA, type QAResult } from "./visual-qa";
import { enviarCmdPiloto } from "./sandbox-pilot";
import { esErrorDelEntorno } from "./auto-revision";
import {
  MAX_BOTONES,
  ESPERA_CLIC_MS,
  type InformeBotones,
  type ResultadoBoton,
} from "./prueba-botones";
import { injectPilot } from "./sandbox-pilot";
import type { RunOutcome } from "./tool-runner";

/** Tiempo por defecto para recoger logs tras la carga (ms). Si hay más
 * logs después, se pierden — el bucle del agente es iterativo y puede
 * ejecutar otra vez si necesita más. */
const DEFAULT_WAIT_MS = 2500;

/** Máximo de logs que se devuelven al modelo (para no inundar el
 * contexto). Los errores siempre se priorizan. */
const MAX_LOGS = 8;
const MAX_ERRORS = 4;

/** Tope de la consola completa que viaja en `outcome.consola` para
 * `read_console`. */
const MAX_CONSOLA_RUN = 40;

interface CollectedLog {
  level: string;
  text: string;
}

/** Ejecuta un proyecto en memoria y devuelve logs + errores + QA.
 *
 * No lanza: si algo falla (no hay entry, error de construcción, etc.),
 * devuelve `ok: false` con el motivo en `reason`. El modelo lo recibe
 * y puede decidir cómo reaccionar.
 *
 * @param files Mapa `path → content` (solo archivos de texto; los
 * binarios no se soportan aquí, el tool `read_file` ya los excluye).
 * @param opts `qa: true` para medir el QA visual móvil.
 */
export async function runProjectInMemory(
  files: Record<string, string>,
  opts: { qa?: boolean; botones?: boolean } = {}
): Promise<RunOutcome> {
  // 1. Construir el mapa que espera `buildRunHtml`: Map<path, Uint8Array>.
  const fileMap = new Map<string, Uint8Array>();
  for (const [path, content] of Object.entries(files)) {
    fileMap.set(path, new TextEncoder().encode(content));
  }
  if (!fileMap.size) {
    return { ok: false, ejecutado: false, logs: 0, errors: 0, logLines: [], errorLines: [], reason: "El proyecto no tiene archivos." };
  }

  // 2. Elegir entry HTML.
  const entry = pickEntryPath([...fileMap.keys()]);
  if (!entry) {
    return {
      ok: false,
      ejecutado: false,
      logs: 0,
      errors: 0,
      logLines: [],
      errorLines: [],
      reason: "No hay ningún archivo .html en el proyecto. Añade un index.html.",
    };
  }

  // 3. Construir el HTML autocontenido.
  let built: ReturnType<typeof buildRunHtml>;
  try {
    built = buildRunHtml(entry, fileMap);
  } catch (e) {
    return {
      ok: false,
      ejecutado: false,
      logs: 0,
      errors: 0,
      logLines: [],
      errorLines: [],
      reason: `No se pudo construir el HTML: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  // 4. Inyectar el medidor de QA y el runtime del piloto (por si el
  //    agente quiere seguir operando con `sandbox-pilot`).
  // Peso del proyecto ya empaquetado, sin la instrumentación de Prism.
  // Lo calcula `buildRunHtml`, que es el único sitio que ve el HTML antes
  // de que se le inyecte nada.
  const htmlBytes = built.htmlBytes;
  const html = injectPilot(injectVisualQA(built.html));

  // 5. Crear un iframe OCULTO en el body, ejecutar y recoger logs.
  return new Promise<RunOutcome>((resolve) => {
    const logs: CollectedLog[] = [];
    let resolved = false;
    let informeBotones: InformeBotones | undefined;
    /** Cuántos logs había cuando empezó el barrido de botones.
     *
     * Las dos fases comparten el array de logs, así que sin este corte los
     * errores de un CLIC se contaban también como errores de CARGA. Resultado:
     * un botón roto disparaba la corrección por consola en vez de la de
     * botones, y al modelo le llegaba el mensaje equivocado. */
    let corteBarrido: number | null = null;
    /** Medidas del QA móvil tal como las manda el medidor. Se guardan
     * ENTERAS (`QAResult`) y no un recuento: `run_regression` compara
     * hallazgo a hallazgo, y para eso necesita el `tipo` y el `detalle`. */
    let qaResults: QAResult[] | null = null;

    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "390px"; // ancho móvil por defecto para el QA
    iframe.style.height = "600px";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    iframe.style.zIndex = "-1";
    iframe.style.border = "0";
    // sandbox sin allow-same-origin: el puente de consola usa postMessage,
    // el padre no toca el DOM del proyecto.
    iframe.sandbox.add("allow-scripts");
    iframe.srcdoc = html;

    const finish = () => {
      if (resolved) return;
      resolved = true;
      window.removeEventListener("message", onMsg);
      // solo lo de la fase de carga: lo que salga al pulsar va en `botones`
      const deCarga = corteBarrido == null ? logs : logs.slice(0, corteBarrido);
      const errorLogs = deCarga.filter((l) => l.level === "error");
      const otherLogs = deCarga.filter((l) => l.level !== "error");
      const logLines = otherLogs.slice(0, MAX_LOGS).map((l) => `[${l.level}] ${l.text}`);
      const errorLines = errorLogs.slice(0, MAX_ERRORS).map((l) => l.text);
      // consola completa (tope propio) para `read_console`: las 8/4 de arriba
      // son para el mensaje de run_project, que tiene que ser corto.
      const consola = deCarga.slice(-MAX_CONSOLA_RUN).map((l) => ({ level: l.level, text: l.text }));
      // Una medida que NO respondió no es «cero hallazgos»: es que no se
      // midió. Contarla como buena convertía una página sin medidor en un
      // aprobado. Se excluye del recuento igual que hace el Sandbox visible.
      const medidas = (qaResults ?? []).filter((r) => !r.noRespondio);
      const qaFindings = qaResults ? medidas.reduce((n, r) => n + (r.ok ? 0 : r.items.length), 0) : undefined;
      const outcome: RunOutcome = {
        ok: errorLogs.length === 0,
        ejecutado: true,
        logs: deCarga.length,
        errors: errorLogs.length,
        logLines,
        errorLines,
        qaFindings,
        botones: informeBotones,
        consola,
        entry,
        htmlBytes,
        // la última medida que respondió: es la que compara `run_regression`
        qa: medidas.length ? medidas[medidas.length - 1] : null,
      };
      // Destruir el iframe: si hay un error de runtime que cuelga el
      // script, el `remove()` libera el proceso.
      try {
        iframe.remove();
      } catch {
        /* noop */
      }
      resolve(outcome);
    };

    const onMsg = (e: MessageEvent) => {
      if (iframe.contentWindow && e.source !== iframe.contentWindow) return;
      const d = e.data as { source?: string; level?: string; text?: string; type?: string } | null;
      if (!d) return;
      // Puente de consola del Sandbox.
      if (d.source === SANDBOX_ORIGIN && typeof d.text === "string") {
        logs.push({ level: d.level ?? "log", text: d.text });
        return;
      }
      // Resultado del QA (si se pidió).
      //
      // El medidor manda `{ type, token, result }` (visual-qa.ts): la medida
      // va DENTRO de `result`. Aquí se leía `e.data.items`, que no existe,
      // así que `Array.isArray(undefined)` era false y no se guardaba nada:
      // `run_project` con `qa: true` jamás le contó al agente un solo
      // hallazgo. El QA se medía, se mandaba, y se tiraba en esta línea.
      if (d.type === "prism-qa-result" && opts.qa) {
        const r = (e.data as { result?: QAResult }).result;
        if (r && Array.isArray(r.items)) {
          qaResults = qaResults ?? [];
          qaResults.push(r);
        }
      }
    };
    window.addEventListener("message", onMsg);

    /** Barrido de botones: se pulsan uno a uno y se mira qué pasa.
     *
     * La revisión de carga solo caza lo que revienta al abrir la página, y en
     * una web generada la mayoría de los fallos viven detrás de un clic.
     *
     * Cada botón se pulsa con una firma de la página antes y después, para
     * saber si cambió ALGO. Si cambió lo correcto no se puede saber, y no se
     * finge que sí. */
    const barrerBotones = async (): Promise<InformeBotones> => {
      const win = iframe.contentWindow;
      if (!win) return { hecho: false, resultados: [], total: 0, motivo: "El proyecto no respondió." };
      const lista = await enviarCmdPiloto(win, { op: "buttons" });
      if (!lista.ok) {
        return {
          hecho: false,
          resultados: [],
          total: 0,
          motivo: String((lista.data as { error?: string }).error ?? "No se pudo leer la página."),
        };
      }
      const botones = ((lista.data as { botones?: { i: number; rotulo: string }[] }).botones ?? []);
      const resultados: ResultadoBoton[] = [];
      for (const b of botones.slice(0, MAX_BOTONES)) {
        const antesLogs = logs.length;
        const antes = await enviarCmdPiloto(win, { op: "signature" });
        const clic = await enviarCmdPiloto(win, { op: "clickIndex", index: b.i });
        await new Promise((r) => setTimeout(r, ESPERA_CLIC_MS));
        const despues = await enviarCmdPiloto(win, { op: "signature" });

        // los errores de consola que salieron POR ESTE clic
        // se descartan los errores del propio entorno (la vista previa
        // prohíbe localStorage), que no son culpa del modelo
        const nuevos = logs
          .slice(antesLogs)
          .filter((l) => l.level === "error" && !esErrorDelEntorno(l.text));
        const excepcion = clic.ok ? null : String((clic.data as { error?: string }).error ?? "error");
        const fa = antes.data as { largo?: number; texto?: string; url?: string };
        const fd = despues.data as { largo?: number; texto?: string; url?: string };
        resultados.push({
          rotulo: b.rotulo,
          ok: !excepcion && nuevos.length === 0,
          error: excepcion ?? nuevos[0]?.text,
          cambio:
            fa.largo !== fd.largo || fa.texto !== fd.texto || fa.url !== fd.url,
        });
      }
      return { hecho: true, resultados, total: botones.length };
    };

    // Cargar el iframe. El `load` dispara cuando el HTML se renderiza;
    // los logs llegan después por postMessage.
    iframe.onload = () => {
      // Esperar DEFAULT_WAIT_MS para recoger logs asíncronos.
      setTimeout(() => {
        if (!opts.botones) {
          finish();
          return;
        }
        corteBarrido = logs.length;
        void barrerBotones().then((inf) => {
          informeBotones = inf;
          finish();
        });
      }, DEFAULT_WAIT_MS);
    };
    // Si el iframe no carga (p. ej. por un HTML roto), terminar igualmente. Con
    // barrido de botones el techo sube: cada clic son ~4 mensajes y una espera.
    setTimeout(finish, opts.botones ? 5000 + MAX_BOTONES * (ESPERA_CLIC_MS + 800) : 5000);

    document.body.appendChild(iframe);
  });
}
