/** Prism AI — Ejecutor de llamadas a herramientas (tools) del agente.
 *
 * El modelo devuelve `tool_calls` (OpenAI), `tool_use` (Anthropic) o
 * `functionCall` (Gemini). Aquí se ejecuta cada llamada contra cosas
 * que viven en el dispositivo: el Sandbox (archivos del proyecto, run,
 * QA), la cuota del proveedor. Sin red ajena — la promesa del producto
 * (MANIFIESTO: sin servidor, sin cuentas, claves en dispositivo).
 *
 * El runner es puro en el sentido de que no toca React: recibe el
 * contexto (`ToolContext`) y devuelve un `ToolResult`. Lo llama
 * `chat-app.tsx` cuando el stream trae tool_calls.
 */
import type { ToolCall, ToolResult } from "./tools-catalog";
import { isKnownTool } from "./tools-catalog";
import { htmlATexto, tituloDeHtml, MAX_TEXTO_URL } from "./html-a-texto";

/** Una página que no contesta en este tiempo no merece seguir bloqueando al
 *  agente: el modelo puede decidir otra cosa con el error. */
const TIMEOUT_URL_MS = 15_000;

/** Contexto que las herramientas necesitan para ejecutarse. Lo construye
 * `chat-app.tsx` antes de llamar al runner; aquí no se importa React ni
 * zustand para mantener el runner testeable en aislado. */
export interface ToolContext {
  /** Archivos del proyecto activo en el Sandbox, como `{path: content}`.
   * Si no hay proyecto, es `{}`. Los textos van en UTF-8; los binarios
   * no se exponen (no tendría sentido leerlos como texto). */
  projectFiles: Record<string, string>;
  /** Ejecuta el proyecto actual y devuelve los logs + errores. La
   * implementación vive en `sandbox-studio.tsx` y se inyecta aquí para
   * no romper la separación. */
  runProject?: (opts?: { qa?: boolean }) => Promise<RunOutcome>;
  /** Consulta la cuota del proveedor/modelo actual. La implementación
   * vive en `quota-panel.tsx` o similar; aquí solo se usa. */
  getQuota?: () => QuotaSnapshot | null;
}

/** Resultado de ejecutar el proyecto. */
export interface RunOutcome {
  /** Hubo proyecto que correr (había archivos y un entry). */
  ok: boolean;
  /** Nº de logs de consola recogidos. */
  logs: number;
  /** Nº de errores de consola. */
  errors: number;
  /** Primeras líneas de logs (hasta 8) — para que el modelo vea algo. */
  logLines: string[];
  /** Primeras líneas de error (hasta 4). */
  errorLines: string[];
  /** Hallazgos del QA visual si se pidió. */
  qaFindings?: number;
  /** Si no había proyecto, lo dice aquí. */
  reason?: string;
}

/** Cuota del proveedor actual, simplificada. */
export interface QuotaSnapshot {
  providerId: string;
  modelId: string;
  /** Peticiones restantes en la ventana actual, si se sabe. */
  requestsRemaining?: number;
  /** Tokens restantes en la ventana actual, si se sabe. */
  tokensRemaining?: number;
  /** Cuándo se resetea la ventana (epoch ms), si se sabe. */
  resetsAt?: number;
  /** Texto crudo si no había datos estructurados. */
  raw?: string;
}

/** Ejecuta una llamada a una herramienta. No lanza: si algo falla,
 * devuelve un `ToolResult` con `ok: false` y el mensaje de error — el
 * modelo lo recibe y puede decidir cómo reaccionar. */
export async function runTool(
  call: ToolCall,
  ctx: ToolContext
): Promise<ToolResult> {
  if (!isKnownTool(call.name)) {
    return toolError(call, `Herramienta desconocida: «${call.name}». Las disponibles son: read_file, write_file, list_files, run_project, get_quota.`);
  }
  try {
    switch (call.name) {
      case "read_file":
        return runReadFile(call, ctx);
      case "write_file":
        return runWriteFile(call, ctx);
      case "list_files":
        return runListFiles(call, ctx);
      case "run_project":
        return await runRunProject(call, ctx);
      case "read_url":
        return runReadUrl(call);
      case "get_quota":
        return runGetQuota(call, ctx);
      default:
        return toolError(call, `Herramienta no implementada: «${call.name}».`);
    }
  } catch (e) {
    return toolError(call, e instanceof Error ? e.message : String(e));
  }
}

/** Ejecuta varias llamadas en paralelo (el modelo puede pedir varias a
 * la vez). Devuelve los resultados en el mismo orden que las llamadas. */
export async function runTools(
  calls: ToolCall[],
  ctx: ToolContext
): Promise<ToolResult[]> {
  return Promise.all(calls.map((c) => runTool(c, ctx)));
}

/* ------------------------------------------------------------------ */
/* implementaciones                                                    */
/* ------------------------------------------------------------------ */

function runReadFile(call: ToolCall, ctx: ToolContext): ToolResult {
  const path = strArg(call, "path");
  if (!path) return argError(call, "path");
  if (!ctx.projectFiles[path]) {
    return toolError(
      call,
      `El archivo «${path}» no existe en el proyecto. Usa «list_files» para ver qué hay.`
    );
  }
  return toolOk(call, ctx.projectFiles[path]);
}

function runWriteFile(call: ToolCall, ctx: ToolContext): ToolResult {
  const path = strArg(call, "path");
  const content = strArg(call, "content");
  if (!path) return argError(call, "path");
  if (content === undefined) return argError(call, "content");
  // Escribimos en el contexto en memoria. La persistencia real al
  // Sandbox la hace `chat-app.tsx` al observar el resultado (es la
  // única forma de no acoplar el runner a React/zustand).
  ctx.projectFiles[path] = content;
  return toolOk(call, `Archivo «${path}» escrito (${content.length} caracteres).`);
}

function runListFiles(call: ToolCall, ctx: ToolContext): ToolResult {
  const prefix = strArg(call, "prefix") ?? "";
  const all = Object.keys(ctx.projectFiles).sort();
  const filtered = prefix ? all.filter((p) => p.startsWith(prefix)) : all;
  if (!filtered.length) {
    return toolOk(call, prefix ? `No hay archivos que empiecen por «${prefix}».` : "El proyecto no tiene archivos todavía.");
  }
  return toolOk(call, filtered.map((p) => `- ${p} (${ctx.projectFiles[p].length} car.)`).join("\n"));
}

async function runRunProject(call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
  if (!ctx.runProject) {
    return toolError(call, "No hay Sandbox disponible. El usuario no tiene un proyecto abierto en el Sandbox.");
  }
  const qa = boolArg(call, "qa");
  const outcome = await ctx.runProject({ qa });
  if (!outcome.ok) {
    return toolOk(call, outcome.reason ?? "No se pudo ejecutar el proyecto.");
  }
  const lines: string[] = [
    `Proyecto ejecutado. ${outcome.logs} logs, ${outcome.errors} errores.`,
  ];
  if (outcome.logLines.length) {
    lines.push("", "Logs:");
    lines.push(...outcome.logLines.map((l) => `  ${l}`));
  }
  if (outcome.errorLines.length) {
    lines.push("", "Errores:");
    lines.push(...outcome.errorLines.map((l) => `  ${l}`));
  }
  if (qa && outcome.qaFindings != null) {
    lines.push("", `QA móvil: ${outcome.qaFindings} hallazgo(s).`);
  }
  return toolOk(call, lines.join("\n"));
}

function runGetQuota(call: ToolCall, ctx: ToolContext): ToolResult {
  if (!ctx.getQuota) {
    return toolOk(call, "No hay datos de cuota disponibles para este proveedor.");
  }
  const q = ctx.getQuota();
  if (!q) {
    return toolOk(call, "El proveedor no expone cuota medible en las cabeceras x-ratelimit-*.");
  }
  const lines: string[] = [`Cuota de ${q.providerId} · ${q.modelId}:`];
  if (q.requestsRemaining != null) lines.push(`- Peticiones restantes: ${q.requestsRemaining}`);
  if (q.tokensRemaining != null) lines.push(`- Tokens restantes: ${q.tokensRemaining}`);
  if (q.resetsAt) {
    const en = Math.max(0, Math.round((q.resetsAt - Date.now()) / 1000));
    lines.push(`- Se resetea en ${en} s`);
  }
  if (q.raw) lines.push(`- Crudo: ${q.raw}`);
  return toolOk(call, lines.join("\n"));
}

/**
 * Lee el texto de una página.
 *
 * Va por `/api/proxy` en vez de `fetch` directo por dos razones, y las dos
 * importan:
 *
 *  1. **CORS.** Desde el navegador no se puede leer una página ajena; el
 *     proxy es del mismo origen.
 *  2. **Escudo.** `net-guard.ts` rechaza `localhost`, IPs privadas y los
 *     metadatos de la nube, también al seguir redirecciones. Sin eso, dar al
 *     agente una herramienta de red sería regalarle un ariete contra la red
 *     de quien despliegue la app.
 *
 * No es un buscador: lee una URL concreta. Y queda en el registro de
 * peticiones, para que se vea qué pidió el agente.
 */
async function runReadUrl(call: ToolCall): Promise<ToolResult> {
  const url = strArg(call, "url")?.trim();
  if (!url) return toolError(call, "Falta el argumento «url».");

  let destino: URL;
  try {
    destino = new URL(url);
  } catch {
    return toolError(call, `«${url}» no es una URL válida. Tiene que empezar por http:// o https://.`);
  }
  if (destino.protocol !== "http:" && destino.protocol !== "https:") {
    return toolError(call, `Solo se pueden leer direcciones http o https, y «${url}» no lo es.`);
  }

  let res: Response;
  try {
    res = await fetch("/api/proxy", {
      method: "GET",
      headers: {
        "x-target-url": destino.toString(),
        accept: "text/html,text/plain;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(TIMEOUT_URL_MS),
    });
  } catch (e) {
    const abortada = e instanceof DOMException && e.name === "TimeoutError";
    return toolError(
      call,
      abortada
        ? `«${destino.host}» no respondió en ${TIMEOUT_URL_MS / 1000} segundos.`
        : `No se pudo contactar con «${destino.host}».`
    );
  }

  if (!res.ok) {
    // el detalle del proxy explica los bloqueos del escudo, que es justo lo
    // que el modelo necesita saber para no reintentar en bucle
    let detalle = "";
    try {
      const j = (await res.json()) as { error?: string; detalle?: string };
      detalle = [j.error, j.detalle].filter(Boolean).join(" — ");
    } catch {
      /* sin cuerpo legible */
    }
    return toolError(call, `«${destino.host}» devolvió ${res.status}${detalle ? `: ${detalle}` : ""}.`);
  }

  const tipo = res.headers.get("content-type") ?? "";
  const crudo = await res.text();
  if (tipo.includes("json") || (!tipo.includes("html") && !tipo.includes("text"))) {
    // JSON y texto plano se entregan tal cual, solo recortados
    const t = crudo.length > MAX_TEXTO_URL ? crudo.slice(0, MAX_TEXTO_URL) + "\n[…recortado]" : crudo;
    return toolOk(call, `Contenido de ${destino.toString()}:\n\n${t}`);
  }

  const titulo = tituloDeHtml(crudo);
  const texto = htmlATexto(crudo);
  if (!texto.trim()) {
    return toolOk(
      call,
      `${destino.toString()} respondió, pero no tiene texto legible (puede que se pinte con JavaScript, que aquí no se ejecuta).`
    );
  }
  return toolOk(call, [`Página: ${titulo ?? destino.toString()}`, `URL: ${destino}`, "", texto].join("\n"));
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function strArg(call: ToolCall, name: string): string | undefined {
  const v = call.args[name];
  return typeof v === "string" ? v : undefined;
}

function boolArg(call: ToolCall, name: string): boolean {
  const v = call.args[name];
  return v === true || v === "true";
}

function toolOk(call: ToolCall, content: string): ToolResult {
  return { callId: call.id, name: call.name, content, ok: true };
}

function toolError(call: ToolCall, message: string): ToolResult {
  return { callId: call.id, name: call.name, content: `ERROR: ${message}`, ok: false };
}

function argError(call: ToolCall, name: string): ToolResult {
  return toolError(call, `Falta el argumento «${name}» o no es una cadena.`);
}
