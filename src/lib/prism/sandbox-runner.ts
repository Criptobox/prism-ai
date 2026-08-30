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
import { injectVisualQA } from "./visual-qa";
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
  opts: { qa?: boolean } = {}
): Promise<RunOutcome> {
  // 1. Construir el mapa que espera `buildRunHtml`: Map<path, Uint8Array>.
  const fileMap = new Map<string, Uint8Array>();
  for (const [path, content] of Object.entries(files)) {
    fileMap.set(path, new TextEncoder().encode(content));
  }
  if (!fileMap.size) {
    return { ok: false, logs: 0, errors: 0, logLines: [], errorLines: [], reason: "El proyecto no tiene archivos." };
  }

  // 2. Elegir entry HTML.
  const entry = pickEntryPath([...fileMap.keys()]);
  if (!entry) {
    return {
      ok: false,
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
      logs: 0,
      errors: 0,
      logLines: [],
      errorLines: [],
      reason: `No se pudo construir el HTML: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  // 4. Inyectar el medidor de QA y el runtime del piloto (por si el
  //    agente quiere seguir operando con `sandbox-pilot`).
  const html = injectPilot(injectVisualQA(built.html));

  // 5. Crear un iframe OCULTO en el body, ejecutar y recoger logs.
  return new Promise<RunOutcome>((resolve) => {
    const logs: CollectedLog[] = [];
    let resolved = false;
    let qaResults: { ok: boolean; items: { detalle: string }[] }[] | null = null;

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
      const errorLogs = logs.filter((l) => l.level === "error");
      const otherLogs = logs.filter((l) => l.level !== "error");
      const logLines = otherLogs.slice(0, MAX_LOGS).map((l) => `[${l.level}] ${l.text}`);
      const errorLines = errorLogs.slice(0, MAX_ERRORS).map((l) => l.text);
      let qaFindings: number | undefined;
      if (qaResults) {
        qaFindings = qaResults.reduce((n, r) => n + (r.ok ? 0 : r.items.length), 0);
      }
      const outcome: RunOutcome = {
        ok: errorLogs.length === 0,
        logs: logs.length,
        errors: errorLogs.length,
        logLines,
        errorLines,
        qaFindings,
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
      if (d.type === "prism-qa-result" && opts.qa) {
        const r = (e.data as { items?: { detalle: string }[]; ok?: boolean }).items;
        if (Array.isArray(r)) {
          qaResults = qaResults ?? [];
          qaResults.push({ ok: !!(e.data as { ok?: boolean }).ok, items: r });
        }
      }
    };
    window.addEventListener("message", onMsg);

    // Cargar el iframe. El `load` dispara cuando el HTML se renderiza;
    // los logs llegan después por postMessage.
    iframe.onload = () => {
      // Esperar DEFAULT_WAIT_MS para recoger logs asíncronos.
      setTimeout(finish, DEFAULT_WAIT_MS);
    };
    // Si el iframe no carga en 5s (p. ej. por un HTML roto), terminar.
    setTimeout(finish, 5000);

    document.body.appendChild(iframe);
  });
}
