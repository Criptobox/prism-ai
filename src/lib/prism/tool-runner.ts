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
import { isKnownTool, TOOL_CATALOG } from "./tools-catalog";
import { htmlATexto, tituloDeHtml, extraerSeleccion, MAX_TEXTO_URL } from "./html-a-texto";
import type { ReplOutcome } from "./js-repl";
import type { QAResult } from "./visual-qa";
import type { RunSnapshot } from "./regression";
import { compareRuns, comparables, resumenRegresion } from "./regression";
import type { ProjectMap } from "./types";
import { buscarEnMapa, resumenMemoria, MAX_RESULTADOS_MEMORIA } from "./project-map";
import { compararProyectos, resumenProyectos } from "./diff-proyectos";
import { buscarEnWeb } from "./busqueda-web";
import {
  crearSnapshot,
  guardarSnapshot,
  listarSnapshots,
  obtenerSnapshot,
  MAX_CHARS_SNAPSHOT,
  type Snapshot,
} from "./snapshots";

/** Una página que no contesta en este tiempo no merece seguir bloqueando al
 *  agente: el modelo puede decidir otra cosa con el error. */
const TIMEOUT_URL_MS = 15_000;

/** Ídem para fetch_api. */
const TIMEOUT_API_MS = 15_000;

/** Techo de `max_chars` en read_url. El modelo puede subir el tope por
 * defecto cuando de verdad necesita la página larga, pero no hasta el punto
 * de que una sola página se coma la conversación entera. */
const MAX_TEXTO_URL_TECHO = 20_000;

/** Tope del JSON que se le devuelve al modelo desde fetch_api. Sin él, una
 * API verbosa se come el contexto de la conversación entera. */
const MAX_JSON_API = 4_000;

/** Líneas de consola que recuerda read_console entre ejecuciones. */
const MAX_CONSOLA = 20;

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
  /** Ejecuta JS aislado para `run_js`. La implementación real es
   * `runJsInMemory` (js-repl.ts) y la inyecta `use-agent-tools.ts`;
   * los tests pasan una falsa para no necesitar navegador. */
  runJs?: (code: string) => Promise<ReplOutcome>;
  /** Almacenamiento de snapshots para `git_snapshot`. Inyectarlo permite
   * testear sin localStorage; si no viene, snapshots.ts usa el suyo. */
  snapshotStorage?: Storage;
  /** Última consola de `run_project` en esta conversación. Lo mantiene el
   * propio runner (se escribe al ejecutar) para que `read_console` tenga
   * de dónde leer sin acoplar el runner al Sandbox visible. */
  lastConsole?: { lines: { level: string; text: string }[]; fecha: number };
  /** Última ejecución medida de esta conversación: la referencia contra la
   * que compara `run_regression`. La escriben tanto `run_project` como
   * `run_regression`, así que el flujo natural —ejecuto, cambio algo,
   * mido— funciona sin que el modelo tenga que preparar nada. */
  lastRun?: RunSnapshot | null;
  /** Mapa del proyecto de la sesión, para `ask_memory`. Lo inyecta
   * `chat-app.tsx`; si no viene, la herramienta lo dice en vez de
   * responder con el vacío. */
  projectMap?: ProjectMap | null;
}

/** Resultado de ejecutar el proyecto. */
export interface RunOutcome {
  /** El proyecto se ejecutó SIN errores de consola.
   *
   * OJO: no significa «se pudo ejecutar». El comentario decía eso y el código
   * hacía lo otro (`ok = sin errores`), y esa contradicción tenía consecuencias:
   * `run_project` le contestaba al modelo «No se pudo ejecutar el proyecto»
   * justo cuando SÍ se ejecutaba y daba errores — o sea, se le ocultaban al
   * agente los errores de su propio código, que es para lo que existe la
   * herramienta. Para saber si llegó a correr, mira `ejecutado`. */
  ok: boolean;
  /** Llegó a ejecutarse (había archivos, entry y el HTML se pudo construir),
   *  con errores o sin ellos. Es la pregunta que hay que hacerse antes de
   *  echarle la culpa al modelo. */
  ejecutado: boolean;
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
  /** Resultado de pulsar los botones, si se pidió el barrido. */
  botones?: import("./prueba-botones").InformeBotones;
  /** Consola completa de la carga (hasta 40 líneas, con nivel), para que
   * `read_console` pueda releerla después sin reejecutar. Las líneas de
   * los clics del barrido van en `botones`, no aquí. */
  consola?: { level: string; text: string }[];
  /** Página que se ejecutó (la que eligió `pickEntryPath`). Va aquí para
   * que `run_regression` pueda negarse a comparar dos ejecuciones de
   * páginas distintas en vez de restar peras y manzanas. */
  entry?: string;
  /** Tamaño del HTML del proyecto (sin la instrumentación que inyecta Prism). */
  htmlBytes?: number;
  /** Última medida de QA que respondió, entera. `null` si no se pidió QA o
   * si el medidor no contestó — que no es lo mismo que «cero hallazgos». */
  qa?: QAResult | null;
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
    // La lista se saca del catálogo, no se escribe a mano: cada vez que se
    // añadía una herramienta esta frase se quedaba vieja y el modelo leía que
    // no existía algo que sí existe.
    return toolError(
      call,
      `Herramienta desconocida: «${call.name}». Las disponibles son: ${TOOL_CATALOG.map((t) => t.name).join(", ")}.`
    );
  }
  try {
    switch (call.name) {
      case "read_file":
        return runReadFile(call, ctx);
      case "write_file":
        return runWriteFile(call, ctx);
      case "edit_file":
        return runEditFile(call, ctx);
      case "list_files":
        return runListFiles(call, ctx);
      case "run_project":
        return await runRunProject(call, ctx);
      case "run_js":
        return await runRunJs(call, ctx);
      case "read_console":
        return runReadConsole(call, ctx);
      case "read_url":
        return runReadUrl(call);
      case "search_web":
        return await runSearchWeb(call);
      case "fetch_api":
        return await runFetchApi(call);
      case "get_quota":
        return runGetQuota(call, ctx);
      case "git_snapshot":
        return runGitSnapshot(call, ctx);
      case "run_regression":
        return await runRunRegression(call, ctx);
      case "snapshot_diff":
        return runSnapshotDiff(call, ctx);
      case "ask_memory":
        return runAskMemory(call, ctx);
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

/** Cuenta cuántas veces aparece un fragmento, sin regex (el fragmento es
 * texto literal, y con regex habría que escapar caracteres especiales). */
function contarApariciones(pajar: string, aguja: string): number {
  if (!aguja) return 0;
  let n = 0;
  let i = pajar.indexOf(aguja);
  while (i !== -1) {
    n++;
    i = pajar.indexOf(aguja, i + aguja.length);
  }
  return n;
}

function runEditFile(call: ToolCall, ctx: ToolContext): ToolResult {
  const path = strArg(call, "path");
  const find = strArg(call, "find");
  const replace = strArg(call, "replace") ?? "";
  const all = boolArg(call, "all");
  if (!path) return argError(call, "path");
  if (find === undefined || find === "") return argError(call, "find");
  const actual = ctx.projectFiles[path];
  if (actual === undefined) {
    return toolError(
      call,
      `El archivo «${path}» no existe en el proyecto. Usa «list_files» para ver qué hay, o «write_file» para crearlo.`
    );
  }
  const veces = contarApariciones(actual, find);
  if (veces === 0) {
    return toolError(
      call,
      `«find» no aparece en «${path}». El archivo puede haber cambiado: usa «read_file» y copia el fragmento EXACTO (espacios incluidos).`
    );
  }
  if (veces > 1 && !all) {
    return toolError(
      call,
      `«find» aparece ${veces} veces en «${path}» y sin "all": true no se toca (podrías cambiar la que no es). Pásale un fragmento más largo que sea único, o repite con "all": true si quieres reemplazarlas todas.`
    );
  }
  const nuevo = all
    ? actual.split(find).join(replace)
    : actual.replace(find, replace);
  ctx.projectFiles[path] = nuevo;
  return toolOk(
    call,
    `«${path}» actualizado: ${all ? veces : 1} reemplazo(s). El archivo pasa de ${actual.length} a ${nuevo.length} caracteres.`
  );
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
  // La consola completa se recuerda en el contexto para que
  // `read_console` pueda releerla después sin reejecutar el proyecto.
  // Y la ejecución entera queda como referencia para `run_regression`: así
  // el flujo natural —ejecuto, cambio algo, mido— funciona sin que el modelo
  // tenga que acordarse de preparar nada.
  if (outcome.ejecutado) {
    ctx.lastConsole = {
      lines: (outcome.consola ?? []).slice(-MAX_CONSOLA),
      fecha: Date.now(),
    };
    ctx.lastRun = snapshotDeOutcome(outcome);
  }
  // `ejecutado`, no `ok`: con `ok` esto contestaba «no se pudo ejecutar»
  // siempre que había errores, que es justo cuando el modelo necesita verlos.
  if (!outcome.ejecutado) {
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

async function runRunJs(call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
  const code = strArg(call, "code");
  if (!code) return argError(call, "code");
  if (!ctx.runJs) {
    return toolError(call, "El REPL no está disponible en este entorno.");
  }
  const r = await ctx.runJs(code);
  const lines: string[] = [];
  if (r.logs.length) {
    lines.push("Consola:", ...r.logs.map((l) => `  ${l}`));
  }
  lines.push(`resultado (${r.ms} ms): ${r.valor}`);
  return toolOk(call, lines.join("\n"));
}

function runReadConsole(call: ToolCall, ctx: ToolContext): ToolResult {
  const nivel = strArg(call, "level");
  const ultima = ctx.lastConsole;
  if (!ultima || !ultima.lines.length) {
    return toolOk(
      call,
      "Todavía no hay consola en esta conversación: ejecuta el proyecto con «run_project» primero."
    );
  }
  const hace = Math.max(0, Math.round((Date.now() - ultima.fecha) / 1000));
  const filtradas = nivel
    ? ultima.lines.filter((l) => l.level === nivel)
    : ultima.lines;
  if (!filtradas.length) {
    return toolOk(call, `No hay líneas de nivel «${nivel}» en la última ejecución (hace ${hace} s).`);
  }
  return toolOk(
    call,
    [
      `Consola de la última ejecución (hace ${hace} s, ${filtradas.length} línea(s)):`,
      ...filtradas.map((l) => `  [${l.level}] ${l.text}`),
    ].join("\n")
  );
}

async function runSearchWeb(call: ToolCall): Promise<ToolResult> {
  const query = strArg(call, "query")?.trim();
  if (!query) return argError(call, "query");
  const r = await buscarEnWeb(query);
  if (!r.ok) return toolError(call, r.error);
  const cuerpo = r.resultados
    .map((res, i) => `${i + 1}. ${res.titulo}\n   ${res.url}${res.resumen ? `\n   ${res.resumen}` : ""}`)
    .join("\n\n");
  return toolOk(
    call,
    [`Resultados para «${query}»:`, "", cuerpo, "", "Usa «read_url» con la URL que te sirva para leerla entera."].join("\n")
  );
}

/** Saca un campo de un objeto JSON por ruta de puntos («a.b.0.c»).
 * Devuelve undefined si la ruta se corta — el llamador decide cómo
 * presentarlo («sin dato»), nunca se rellena. */
function campoPorRuta(obj: unknown, ruta: string): unknown {
  let actual: unknown = obj;
  for (const paso of ruta.split(".").filter(Boolean)) {
    if (actual == null || typeof actual !== "object") return undefined;
    if (Array.isArray(actual)) {
      const idx = Number(paso);
      if (!Number.isInteger(idx) || idx < 0 || idx >= actual.length) return undefined;
      actual = actual[idx];
    } else {
      actual = (actual as Record<string, unknown>)[paso];
    }
  }
  return actual;
}

async function runFetchApi(call: ToolCall): Promise<ToolResult> {
  const url = strArg(call, "url")?.trim();
  if (!url) return argError(call, "url");
  const fields = Array.isArray(call.args.fields)
    ? (call.args.fields as unknown[]).filter((f): f is string => typeof f === "string")
    : undefined;

  let destino: URL;
  try {
    destino = new URL(url);
  } catch {
    return toolError(call, `«${url}» no es una URL válida.`);
  }
  if (destino.protocol !== "http:" && destino.protocol !== "https:") {
    return toolError(call, "Solo http(s), igual que read_url.");
  }

  let res: Response;
  try {
    res = await fetch("/api/proxy", {
      method: "GET",
      headers: {
        "x-target-url": destino.toString(),
        accept: "application/json",
      },
      signal: AbortSignal.timeout(TIMEOUT_API_MS),
    });
  } catch (e) {
    const abortada = e instanceof DOMException && e.name === "TimeoutError";
    return toolError(
      call,
      abortada
        ? `«${destino.host}» no respondió en ${TIMEOUT_API_MS / 1000} s.`
        : `No se pudo contactar con «${destino.host}».`
    );
  }
  if (!res.ok) {
    let detalle = "";
    try {
      const j = (await res.json()) as { error?: string; detalle?: string };
      detalle = [j.error, j.detalle].filter(Boolean).join(" — ");
    } catch {
      /* sin cuerpo legible */
    }
    return toolError(call, `«${destino.host}» devolvió ${res.status}${detalle ? `: ${detalle}` : ""}.`);
  }

  const crudo = await res.text();
  let dato: unknown;
  try {
    dato = JSON.parse(crudo);
  } catch {
    return toolError(
      call,
      `«${destino.host}» no devolvió JSON válido (primeros 120 caracteres: ${crudo.slice(0, 120) || "(vacío)"}). Si es HTML, usa read_url.`
    );
  }

  // Sin fields: el JSON entero, recortado por el tope.
  if (!fields || !fields.length) {
    const t =
      JSON.stringify(dato).length > MAX_JSON_API
        ? JSON.stringify(dato).slice(0, MAX_JSON_API) + "…(recortado)"
        : JSON.stringify(dato);
    return toolOk(call, `JSON de ${destino.toString()} (recortado a ${MAX_JSON_API} caracteres):\n\n${t}`);
  }

  // Con fields: solo lo pedido, y «sin dato» donde la ruta no exista.
  const pares = fields.map((f) => {
    const v = campoPorRuta(dato, f);
    return `${f}: ${v === undefined ? "sin dato" : JSON.stringify(v)}`;
  });
  return toolOk(call, [`Campos pedidos de ${destino.toString()}:`, ...pares.map((p) => `- ${p}`)].join("\n"));
}

function runGitSnapshot(call: ToolCall, ctx: ToolContext): ToolResult {
  const action = strArg(call, "action");
  if (!action) return argError(call, "action");
  const st = ctx.snapshotStorage;

  if (action === "create") {
    const mensaje = strArg(call, "message") ?? "snapshot del agente";
    const snap = crearSnapshot(ctx.projectFiles, mensaje);
    if (!snap) {
      const total = Object.values(ctx.projectFiles).reduce((n, t) => n + t.length, 0);
      return toolError(
        call,
        total > MAX_CHARS_SNAPSHOT
          ? `El proyecto supera el tope de un snapshot (${total.toLocaleString("es")} caracteres de ${MAX_CHARS_SNAPSHOT.toLocaleString("es")}). No se guardó nada.`
          : "No hay archivos que guardar: el proyecto está vacío."
      );
    }
    const lista = guardarSnapshot(snap, st);
    return toolOk(
      call,
      `Snapshot «${snap.id}» creado (${Object.keys(snap.files).length} archivos)${lista.length > 1 ? ` · hay ${lista.length} guardados` : ""}. Para volver a este punto: git_snapshot con action "restore" e id "${snap.id}".`
    );
  }

  if (action === "list") {
    const lista = listarSnapshots(st);
    if (!lista.length) {
      return toolOk(call, "No hay snapshots guardados todavía. Crea uno con action «create» antes de un cambio grande.");
    }
    return toolOk(
      call,
      [
        `Snapshots guardados (${lista.length}, el más nuevo primero):`,
        ...lista.map((s: Snapshot) =>
          `- ${s.id} · ${new Date(s.fecha).toLocaleString("es")} · ${s.mensaje} · ${Object.keys(s.files).length} archivos`
        ),
      ].join("\n")
    );
  }

  if (action === "restore") {
    const id = strArg(call, "id");
    if (!id) return argError(call, "id");
    const snap = obtenerSnapshot(id, st);
    if (!snap) {
      return toolError(call, `No existe el snapshot «${id}». Usa action "list" para ver los ids.`);
    }
    // restaurar = reemplazar el proyecto entero del contexto: se borra
    // lo actual y se pone lo del snapshot. La UI lo recogerá por el
    // callback de archivos del bucle del agente.
    for (const k of Object.keys(ctx.projectFiles)) delete ctx.projectFiles[k];
    Object.assign(ctx.projectFiles, snap.files);
    return toolOk(
      call,
      `Restaurado «${snap.id}» (${snap.mensaje}, ${Object.keys(snap.files).length} archivos). Lo hecho DESPUÉS de ese snapshot se ha descargado en esta sesión.`
    );
  }

  return toolError(call, `Acción desconocida: «${action}». Usa create, list o restore.`);
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
  const tope = numArg(call, "max_chars", 500, MAX_TEXTO_URL_TECHO) ?? MAX_TEXTO_URL;
  const selector = strArg(call, "selector")?.trim();

  if (tipo.includes("json") || (!tipo.includes("html") && !tipo.includes("text"))) {
    // JSON y texto plano se entregan tal cual, solo recortados. Un selector
    // aquí no significa nada, y callarse sería dejar al modelo creyendo que
    // se le hizo caso.
    if (selector) {
      return toolError(
        call,
        `«${destino.host}» no devolvió HTML (${tipo || "sin content-type"}), así que el selector «${selector}» no se puede aplicar. Pídela sin selector.`
      );
    }
    const t = crudo.length > tope ? crudo.slice(0, tope) + "\n[…recortado]" : crudo;
    return toolOk(call, `Contenido de ${destino.toString()}:\n\n${t}`);
  }

  const titulo = tituloDeHtml(crudo);
  // Con selector se recorta ANTES de pasar a texto: así el tope de caracteres
  // se gasta en la zona pedida y no en el menú de navegación.
  let html = crudo;
  if (selector) {
    const sel = extraerSeleccion(crudo, selector);
    if (sel.error) return toolError(call, sel.error);
    html = sel.html ?? crudo;
  }

  const texto = htmlATexto(html, tope);
  if (!texto.trim()) {
    return toolOk(
      call,
      selector
        ? `Se encontró «${selector}» en ${destino.toString()}, pero dentro no hay texto legible (puede que se pinte con JavaScript, que aquí no se ejecuta).`
        : `${destino.toString()} respondió, pero no tiene texto legible (puede que se pinte con JavaScript, que aquí no se ejecuta).`
    );
  }
  const cabecera = [`Página: ${titulo ?? destino.toString()}`, `URL: ${destino}`];
  if (selector) cabecera.push(`Zona: ${selector}`);
  return toolOk(call, [...cabecera, "", texto].join("\n"));
}

/** Convierte una ejecución en la instantánea que compara `regression.ts`. */
function snapshotDeOutcome(o: RunOutcome): RunSnapshot {
  return {
    at: Date.now(),
    entry: o.entry ?? "",
    logs: o.consola ?? [],
    qa: o.qa ?? null,
    htmlBytes: o.htmlBytes ?? 0,
  };
}

async function runRunRegression(call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
  if (!ctx.runProject) {
    return toolError(call, "No hay Sandbox disponible. El usuario no tiene un proyecto abierto en el Sandbox.");
  }
  // Por defecto CON QA: sin él la comparación solo ve la consola, y media
  // gracia de medir un cambio de diseño es ver qué pasó a 320 px.
  const qa = boolArgDef(call, "include_qa", true);
  const antes = ctx.lastRun ?? null;
  const outcome = await ctx.runProject({ qa });
  if (!outcome.ejecutado) {
    return toolOk(call, outcome.reason ?? "No se pudo ejecutar el proyecto, así que no hay nada que comparar.");
  }
  const despues = snapshotDeOutcome(outcome);
  ctx.lastConsole = { lines: (outcome.consola ?? []).slice(-MAX_CONSOLA), fecha: Date.now() };
  ctx.lastRun = despues;

  const cabecera = `Proyecto ejecutado (${despues.entry || "sin entry"}): ${outcome.logs} logs, ${outcome.errors} errores.`;

  // Sin referencia previa no hay comparación, y no se inventa una: se guarda
  // esta ejecución y se dice qué hacer para tener el «después».
  if (!antes) {
    return toolOk(
      call,
      `${cabecera}\n\nNo había ejecución anterior en esta conversación, así que NO hay comparación. Esta queda guardada como referencia: haz tu cambio y vuelve a llamar a run_regression para ver qué se movió.`
    );
  }
  // Dos páginas distintas no se comparan: los errores de una no dicen nada
  // de la otra.
  if (!comparables(antes, despues)) {
    return toolOk(
      call,
      `${cabecera}\n\nNo se compara: la ejecución anterior era de «${antes.entry}» y esta es de «${despues.entry}». Son páginas distintas. Esta queda como nueva referencia.`
    );
  }
  return toolOk(call, `${cabecera}\n\n${resumenRegresion(compareRuns(antes, despues))}`);
}

function runSnapshotDiff(call: ToolCall, ctx: ToolContext): ToolResult {
  const idA = strArg(call, "a")?.trim();
  if (!idA) return argError(call, "a");
  const idB = strArg(call, "b")?.trim();

  const disponibles = () => {
    const l = listarSnapshots(ctx.snapshotStorage);
    return l.length
      ? `Los que hay: ${l.map((s) => `${s.id} («${s.mensaje}»)`).join(", ")}.`
      : "No hay ningún punto de restauración todavía; créalo con git_snapshot.";
  };

  const a = obtenerSnapshot(idA, ctx.snapshotStorage);
  if (!a) return toolError(call, `No existe el punto de restauración «${idA}». ${disponibles()}`);

  let despues: Record<string, string>;
  let etiquetaDespues: string;
  if (idB) {
    const b = obtenerSnapshot(idB, ctx.snapshotStorage);
    if (!b) return toolError(call, `No existe el punto de restauración «${idB}». ${disponibles()}`);
    despues = b.files;
    etiquetaDespues = `${b.id} («${b.mensaje}»)`;
  } else {
    despues = ctx.projectFiles;
    etiquetaDespues = "el proyecto actual";
  }
  const d = compararProyectos(a.files, despues);
  return toolOk(call, resumenProyectos(d, `${a.id} («${a.mensaje}»)`, etiquetaDespues));
}

function runAskMemory(call: ToolCall, ctx: ToolContext): ToolResult {
  const q = strArg(call, "q")?.trim();
  if (!q) return argError(call, "q");
  const map = ctx.projectMap;
  // Sin mapa la respuesta correcta no es «no hay nada sobre eso» (que suena a
  // que se buscó), sino que todavía no hay mapa que consultar.
  if (!map || (!map.files.length && !map.features.length && !(map.notes ?? []).length)) {
    return toolOk(
      call,
      "Todavía no hay mapa del proyecto en esta sesión: se construye a medida que se generan archivos y se apuntan notas. No hay nada que consultar."
    );
  }
  const limite = numArg(call, "limit", 1, 20) ?? MAX_RESULTADOS_MEMORIA;
  return toolOk(call, resumenMemoria(buscarEnMapa(map, q, limite), q));
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

/** Como `boolArg` pero con valor por defecto: hay parámetros (include_qa)
 * donde «no lo dijo» significa true, y `boolArg` los daba por false. */
function boolArgDef(call: ToolCall, name: string, def: boolean): boolean {
  const v = call.args[name];
  if (v === true || v === "true") return true;
  if (v === false || v === "false") return false;
  return def;
}

/** Número saneado. Los modelos mandan «4000» tanto como 4000, y a veces
 * mandan basura; aquí se acepta lo razonable y se recorta al rango. */
function numArg(call: ToolCall, name: string, min: number, max: number): number | undefined {
  const v = call.args[name];
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return undefined;
  return Math.max(min, Math.min(max, Math.trunc(n)));
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
