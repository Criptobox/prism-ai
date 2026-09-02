"use client";
/** Prism AI — Sandbox: navega el proyecto, ejecútalo, revísalo y corrige antes de subirlo.
 *
 * Paneles sobre el mismo proyecto (ZIP, repo local o semilla del chat):
 *   Editor   — árbol de carpetas + editor con números de línea
 *   Vista    — el proyecto corriendo en un iframe aislado (sin acceso a tus claves)
 *   Cambios  — diff de lo editado respecto a lo cargado
 *   Revisión — análisis estático: secretos, archivos privados, enlaces rotos,
 *              sintaxis, accesibilidad… lo que romperías al subirlo a GitHub
 *   Consola  — console.log y errores del proyecto en ejecución
 *   Regresión — comparación medida entre la ejecución anterior y la actual
 * Y sobre la vista: QA móvil (medir) y Piloto (operar: pulsar, escribir,
 * cambiar el ancho y leer — el agente de navegador que sí se puede construir).
 *
 * Todo ocurre en tu dispositivo: nada del proyecto se envía a ningún servidor.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Box,
  ChevronRight,
  Copy,
  Download,
  Eraser,
  FilePlus2,
  FileText,
  FolderClosed,
  FolderOpen,
  GitCompare,
  Github,
  Loader2,
  MousePointerClick,
  Maximize2,
  Minimize2,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Square,
  Terminal,
  Trash2,
  UploadCloud,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PANTALLA_ESTRECHA, useMediaQuery } from "@/lib/prism/use-media-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ancestorDirs,
  buildRunHtml,
  buildTree,
  decodeText,
  encodeText,
  extOf,
  isHtmlPath,
  isJunkPath,
  isTextPath,
  pickEntryPath,
  SANDBOX_ORIGIN,
  type PublishSeed,
  type SandboxSeed,
  type TreeNode,
} from "@/lib/prism/sandbox";
import {
  createReviewer,
  type Diagnostic,
  type ReviewFile,
  type ReviewLevel,
  type ReviewReport,
} from "@/lib/prism/sandbox-review";
import { LEVEL_META, ReviewBanner, ReviewDiagnostics } from "./review-view";
import { DiffView, type ChangedFile } from "./diff-view";
import { fileDiff, wholeFileDiff } from "@/lib/prism/diff";
import { readZip, writeZip } from "@/lib/prism/zip";
import {
  injectVisualQA,
  onQAAutoResult,
  QA_LABEL,
  QA_WIDTHS,
  reglaDeQA,
  runVisualQA,
  type QAResult,
} from "@/lib/prism/visual-qa";
import { reglaFromDiagnostico, useFailures } from "@/lib/prism/failures";
import {
  compareRuns,
  comparables,
  type RegressionDiff,
  type RunSnapshot,
} from "@/lib/prism/regression";
import {
  ejecutarPasosPiloto,
  informePiloto,
  injectPilot,
  parsePasos,
  PILOT_EJEMPLO,
  type PilotPasoResultado,
} from "@/lib/prism/sandbox-pilot";
import { ScanSearch } from "lucide-react";
import { cn } from "@/lib/utils";

interface Entry {
  path: string;
  data: Uint8Array;
  text: string | null; // null = binario
  orig: string | null; // texto original, o null si el archivo es nuevo
}

interface LogLine {
  id: number;
  level: string;
  text: string;
  time: string;
}

type Panel = "editor" | "vista" | "cambios" | "revision" | "consola" | "regresion";

const MAX_LOGS = 200;
const IMAGE_EXT = ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp", "ico"];

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function toDataUrl(data: Uint8Array, mime: string): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < data.length; i += chunk) {
    bin += String.fromCharCode(...data.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(bin)}`;
}

/** Copia al portapapeles con el camino clásico de reserva: la API moderna
 * falta o falla en contextos no seguros (http) y en algunos navegadores
 * veteranos, y el informe del piloto no puede quedarse atrapado. */
function copiarTexto(texto: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(texto);
  return new Promise((resolve, reject) => {
    const ta = document.createElement("textarea");
    ta.value = texto;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    document.body.removeChild(ta);
    if (ok) resolve();
    else reject(new Error("sin portapapeles"));
  });
}

/* ------------------------------------------------------------------ */
/* árbol de archivos                                                   */
/* ------------------------------------------------------------------ */

function TreeRows({
  nodes,
  depth,
  open,
  toggle,
  selPath,
  onSelect,
  dirty,
  problems,
}: {
  nodes: TreeNode[];
  depth: number;
  open: Set<string>;
  toggle: (path: string) => void;
  selPath: string | null;
  onSelect: (path: string) => void;
  dirty: Set<string>;
  problems: Map<string, ReviewLevel>;
}) {
  return (
    <>
      {nodes.map((node) => {
        const pad = { paddingLeft: `${depth * 12 + 6}px` };
        if (node.dir) {
          const isOpen = open.has(node.path);
          return (
            <li key={`d:${node.path}`}>
              <button
                type="button"
                onClick={() => toggle(node.path)}
                style={pad}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-xs text-muted-foreground transition hover:bg-accent/60 hover:text-foreground"
                title={node.path}
              >
                <ChevronRight
                  className={cn("size-3 shrink-0 transition-transform", isOpen && "rotate-90")}
                />
                {isOpen ? (
                  <FolderOpen className="size-3.5 shrink-0 text-prism-cyan" />
                ) : (
                  <FolderClosed className="size-3.5 shrink-0 text-prism-cyan/70" />
                )}
                <span className="min-w-0 flex-1 truncate font-medium">{node.name}</span>
                <span className="shrink-0 text-[10px] tabular-nums opacity-60">{node.count}</span>
              </button>
              {isOpen && (
                <ul>
                  <TreeRows
                    nodes={node.children}
                    depth={depth + 1}
                    open={open}
                    toggle={toggle}
                    selPath={selPath}
                    onSelect={onSelect}
                    dirty={dirty}
                    problems={problems}
                  />
                </ul>
              )}
            </li>
          );
        }
        const worst = problems.get(node.path);
        return (
          <li key={`f:${node.path}`}>
            <button
              type="button"
              onClick={() => onSelect(node.path)}
              style={pad}
              aria-current={selPath === node.path ? "true" : undefined}
              className={cn(
                "flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-xs transition",
                selPath === node.path
                  ? "bg-primary/10 font-medium text-foreground ring-1 ring-inset ring-primary/25"
                  : "hover:bg-accent/60"
              )}
              title={node.path}
            >
              <FileText className="ml-[15px] size-3 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-mono">{node.name}</span>
              {worst && (
                <span
                  className={cn("size-1.5 shrink-0 rounded-full", LEVEL_META[worst].dot)}
                  title={`${LEVEL_META[worst].label} en este archivo`}
                />
              )}
              {dirty.has(node.path) && (
                <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" title="Editado" />
              )}
            </button>
          </li>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* editor con números de línea                                         */
/* ------------------------------------------------------------------ */

function CodeEditor({
  value,
  onChange,
  onRun,
  label,
  goto: target,
}: {
  value: string;
  onChange: (v: string) => void;
  onRun: () => void;
  label: string;
  /** línea a la que saltar; «nonce» permite repetir el salto a la misma línea */
  goto: { line: number; nonce: number } | null;
}) {
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const lines = useMemo(() => value.split("\n").length, [value]);

  // salta a la línea que señala un diagnóstico y la deja seleccionada.
  // «nonce» evita repetir el salto en cada tecla, pero permite volver a la misma
  // línea si se pulsa dos veces el mismo diagnóstico.
  const lastJump = useRef<number | null>(null);
  useEffect(() => {
    if (!target || lastJump.current === target.nonce) return;
    const area = areaRef.current;
    if (!area) return;
    lastJump.current = target.nonce;
    const rows = value.split("\n");
    const idx = Math.min(Math.max(target.line, 1), rows.length) - 1;
    const start = rows.slice(0, idx).reduce((n, r) => n + r.length + 1, 0);
    area.focus();
    area.setSelectionRange(start, start + rows[idx].length);
    const lineHeight = area.scrollHeight / Math.max(rows.length, 1);
    area.scrollTop = Math.max(0, (idx - 4) * lineHeight);
    if (gutterRef.current) gutterRef.current.scrollTop = area.scrollTop;
  }, [target, value]);

  return (
    <div className="flex min-h-0 flex-1 bg-muted/20">
      <div
        ref={gutterRef}
        aria-hidden
        className="select-none overflow-hidden border-r bg-muted/40 py-3 pl-2 pr-2 text-right font-mono text-[12px] leading-relaxed text-muted-foreground/50"
      >
        {Array.from({ length: lines }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <textarea
        ref={areaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => {
          if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
        }}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            onRun();
            return;
          }
          if (e.key === "Tab") {
            e.preventDefault();
            const el = e.currentTarget;
            const { selectionStart: s, selectionEnd: t } = el;
            const next = `${value.slice(0, s)}  ${value.slice(t)}`;
            onChange(next);
            requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
          }
        }}
        spellCheck={false}
        wrap="off"
        className="min-h-0 flex-1 resize-none bg-transparent p-3 font-mono text-[12px] leading-relaxed outline-none"
        aria-label={`Contenido de ${label}`}
        placeholder="Escribe el contenido del archivo… (Ctrl+Intro ejecuta)"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* panel de revisión                                                   */
/* ------------------------------------------------------------------ */

function ReviewPanel({
  report,
  onGoTo,
  onRecheck,
}: {
  report: ReviewReport | null;
  onGoTo: (d: Diagnostic) => void;
  onRecheck: () => void;
}) {
  if (!report) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <ShieldCheck className="size-8 text-muted-foreground/40" />
        <p className="max-w-[300px] text-xs text-muted-foreground">
          Revisa el proyecto entero antes de subirlo: credenciales olvidadas, archivos privados,
          enlaces rotos y errores de sintaxis.
        </p>
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={onRecheck}>
          <ShieldCheck className="size-3.5" /> Revisar el proyecto
        </Button>
      </div>
    );
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <div className="space-y-3">
        <ReviewBanner report={report} />
        <ReviewDiagnostics report={report} onGoTo={onGoTo} onRecheck={onRecheck} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* panel de regresión (antes/después medidos)                          */
/* ------------------------------------------------------------------ */

function fmtHora(at: number): string {
  return new Date(at).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function ListaRegression({
  titulo,
  items,
  tono,
}: {
  titulo: string;
  items: string[];
  tono: "rojo" | "verde" | "ambar";
}) {
  if (!items.length) return null;
  return (
    <div
      className={cn(
        "rounded-lg border p-2",
        tono === "rojo" && "border-red-500/40 bg-red-500/[0.05]",
        tono === "verde" && "border-emerald-500/40 bg-emerald-500/[0.05]",
        tono === "ambar" && "border-amber-500/40 bg-amber-500/[0.05]"
      )}
    >
      <p
        className={cn(
          "text-[11px] font-semibold",
          tono === "rojo" && "text-red-600 dark:text-red-400",
          tono === "verde" && "text-emerald-600 dark:text-emerald-400",
          tono === "ambar" && "text-amber-600 dark:text-amber-400"
        )}
      >
        {titulo}
      </p>
      <ul className="mt-1 space-y-0.5 font-mono text-[10.5px] leading-snug text-foreground/85">
        {items.slice(0, 6).map((t, i) => (
          <li key={i} className="break-words">
            · {t}
          </li>
        ))}
      </ul>
      {items.length > 6 && (
        <p className="mt-1 text-[10px] text-muted-foreground">y {items.length - 6} más…</p>
      )}
    </div>
  );
}

function RegressionPanel({
  baseline,
  diff,
}: {
  baseline: RunSnapshot | null;
  diff: RegressionDiff | null;
}) {
  if (!baseline) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <Activity className="size-8 text-muted-foreground/40" />
        <p className="max-w-[320px] text-xs leading-relaxed text-muted-foreground">
          Ejecuta el proyecto, haz tus cambios y vuelve a ejecutar: aquí verás
          <strong className="text-foreground"> qué rompió o arregló el cambio</strong> — errores
          de consola nuevos, hallazgos del QA móvil y el peso de la página, medidos en ambas
          ejecuciones.
        </p>
      </div>
    );
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <div className="space-y-3">
        {/* cabecera de ejecuciones */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span>
            Antes: <strong className="text-foreground">{fmtHora(baseline.at)}</strong> ·{" "}
            {baseline.entry}
          </span>
          {diff && (
            <span>
              Después: <strong className="text-foreground">{fmtHora(Date.now())}</strong>
            </span>
          )}
        </div>

        {!diff ? (
          <p className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
            Esta es la primera ejecución medida (a las {fmtHora(baseline.at)}). Edita lo que
            quieras y pulsa «Ejecutar» otra vez: la comparación saldrá aquí sola.
          </p>
        ) : (
          <>
            {/* veredicto */}
            <p
              className={cn(
                "rounded-lg border p-2.5 text-xs font-medium leading-snug",
                diff.nivel === "mal" && "border-red-500/40 bg-red-500/[0.07] text-red-600 dark:text-red-400",
                diff.nivel === "ok" && "border-emerald-500/40 bg-emerald-500/[0.07] text-emerald-600 dark:text-emerald-400",
                diff.nivel === "igual" && "border-border/60 bg-muted/30 text-muted-foreground",
                diff.nivel === "sin-datos" && "border-amber-500/40 bg-amber-500/[0.06] text-amber-600 dark:text-amber-400"
              )}
            >
              {diff.veredicto}
            </p>

            <ListaRegression titulo="Errores NUEVOS de consola" items={diff.nuevos} tono="rojo" />
            <ListaRegression titulo="Errores que el cambio ARREGLÓ" items={diff.arreglados} tono="verde" />
            <ListaRegression titulo="Avisos nuevos" items={diff.avisosNuevos} tono="ambar" />
            {diff.qa.regressed.length > 0 && (
              <ListaRegression titulo="QA móvil EMPEORÓ" items={diff.qa.regressed} tono="rojo" />
            )}
            {diff.qa.resueltos.length > 0 && (
              <ListaRegression titulo="QA móvil MEJORÓ" items={diff.qa.resueltos} tono="verde" />
            )}

            {/* medidas frías */}
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-lg border border-border/60 bg-muted/30 p-2">
                <p className="text-muted-foreground">QA móvil (antes → después)</p>
                <p className="mt-0.5 font-medium text-foreground">
                  {diff.qa.antes?.noRespondio || !diff.qa.antes
                    ? "sin respuesta"
                    : `${diff.qa.antes.items.length} hallazgo(s)`}{" "}
                  →{" "}
                  {diff.qa.despues?.noRespondio || !diff.qa.despues
                    ? "sin respuesta"
                    : `${diff.qa.despues.items.length} hallazgo(s)`}
                </p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/30 p-2">
                <p className="text-muted-foreground">Peso del HTML servido</p>
                <p className="mt-0.5 font-medium text-foreground">
                  {fmtSize(diff.html.antes)} → {fmtSize(diff.html.despues)}
                  {diff.html.despues > diff.html.antes * 1.1 && (
                    <span className="ml-1 text-amber-600 dark:text-amber-400">(+10%)</span>
                  )}
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sandbox                                                             */
/* ------------------------------------------------------------------ */

/** Preferencia de tamaño del Sandbox en escritorio (por dispositivo, no en el store). */
const CLAVE_MAXIMIZADO = "prism-sandbox-maximizado";

export function SandboxStudio({
  open,
  onOpenChange,
  initial,
  onInitialConsumed,
  initialZipUrl,
  onInitialZipConsumed,
  onPublish,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: SandboxSeed | null;
  onInitialConsumed?: () => void;
  /** URL pública de un ZIP que se carga al abrir el Sandbox (U3 plantillas).
   *  Más limpio que pasar el File por chat-app: el Sandbox ya sabe leer ZIPs. */
  initialZipUrl?: string | null;
  onInitialZipConsumed?: () => void;
  /** Manda el proyecto ya corregido al diálogo de subida a GitHub. */
  onPublish?: (seed: PublishSeed) => void;
}) {
  const [name, setName] = useState("");
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  /** ruta → texto original de los archivos que se han quitado del proyecto:
   * sin esto, borrar un archivo lo hace desaparecer también del diff. */
  const [deleted, setDeleted] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");
  const [selPath, setSelPath] = useState<string | null>(null);
  const [openDirs, setOpenDirs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [runHtml, setRunHtml] = useState<string | null>(null);
  const [runKey, setRunKey] = useState(0);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [panel, setPanel] = useState<Panel>("editor");
  const [report, setReport] = useState<ReviewReport | null>(null);
  /** flag: el Sandbox acaba de cargar un proyecto (semilla o ZIP) y debe
   *  abrir directo la vista previa con index.html en vez de quedarse en
   *  el editor. Lo consume el efecto de abajo que llama a `run()`. */
  const [autoRunPending, setAutoRunPending] = useState(false);
  /** ¿has elegido tú una pestaña desde que empezó a cargar el proyecto?
   *
   *  El auto-arranque llega DESPUÉS de que el ZIP termine de leerse, así que
   *  si mientras tanto pulsabas «Editor», te devolvía a la vista previa y
   *  perdías el clic. Cargar un proyecto abre la vista previa sola —eso es lo
   *  que se pidió—, pero solo mientras no hayas dicho tú dónde querías estar. */
  const eleccionManualRef = useRef(false);

  /* ------- tamaño de la ventana del Sandbox -------
   * En el móvil el diálogo con marco (92 vh y un margen a cada lado) dejaba la
   * vista previa en un recorte diminuto justo cuando más sitio hace falta: al
   * probar el proyecto. Ahí va siempre a pantalla completa. En escritorio es
   * una elección, y se recuerda. */
  const estrecha = useMediaQuery(PANTALLA_ESTRECHA);
  /** En escritorio también arranca a pantalla completa: si no, el proyecto
   * queda en un recuadro (92 vh × max-w-6xl) y no se ve. Quien quiera el
   * diálogo con marco puede restaurarlo; se recuerda. */
  const [maximizado, setMaximizado] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return localStorage.getItem(CLAVE_MAXIMIZADO) !== "0";
    } catch {
      return true;
    }
  });
  const pantallaCompleta = estrecha || maximizado;
  /** El proyecto en marcha cubre el viewport (sin árbol ni marcos). */
  const [vistaCompleta, setVistaCompleta] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_MAXIMIZADO, maximizado ? "1" : "0");
    } catch {
      /* idem */
    }
  }, [maximizado]);

  // Escape sale de la vista a pantalla completa sin cerrar el Sandbox
  useEffect(() => {
    if (!vistaCompleta) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setVistaCompleta(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [vistaCompleta]);
  const [gotoLine, setGotoLine] = useState<{ path: string; line: number; nonce: number } | null>(
    null
  );
  const [showNewFile, setShowNewFile] = useState(false);
  const [newPath, setNewPath] = useState("");
  const logSeq = useRef(0);
  /** true en cuanto se ha revisado una vez: a partir de ahí el informe se actualiza solo */
  const reviewedRef = useRef(false);
  /** Revisor con memoria: al reanalizar solo mira los archivos que cambiaron.
   * En un repo entero la diferencia es entre un tirón de ~0,4 s por pausa al
   * escribir y no notar nada. */
  const reviewerRef = useRef(createReviewer());
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const dragRef = useRef<HTMLDivElement | null>(null);

  /* ------- QA visual del proyecto en marcha ------- */
  const [qaAbierto, setQaAbierto] = useState(false);
  const [qaCorriendo, setQaCorriendo] = useState(false);
  const [qaResultados, setQaResultados] = useState<QAResult[]>([]);
  const [qaAuto, setQaAuto] = useState<QAResult | null>(null);
  /** última medida automática (para la instantánea de regresión) */
  const qaUltimaRef = useRef<QAResult | null>(null);
  // medida automática que el medidor manda tras cada «Ejecutar»: queda en ref
  // para la instantánea de regresión y en estado para el chip de la vista
  useEffect(
    () =>
      onQAAutoResult((r) => {
        qaUltimaRef.current = r;
        setQaAuto(r);
      }),
    []
  );

  /* ------- Piloto: pasos del agente de navegador sobre la vista -------
   * El runtime viaja dentro del HTML ejecutado y recibe órdenes por
   * postMessage; aquí solo se escriben los pasos, se ejecutan en orden y se
   * enseñan los resultados. El informe final se copia para el agente del chat. */
  const [pilotoAbierto, setPilotoAbierto] = useState(false);
  const [pilotoTexto, setPilotoTexto] = useState("");
  const [pilotoCorriendo, setPilotoCorriendo] = useState(false);
  const [pilotoResultados, setPilotoResultados] = useState<PilotPasoResultado[] | null>(null);
  const pilotoAbortRef = useRef(false);
  /** índice de consola donde empezó la última prueba (para el informe) */
  const pilotoInicioRef = useRef(0);
  const pilotoParseo = useMemo(() => parsePasos(pilotoTexto), [pilotoTexto]);
  const pilotoFallos = pilotoResultados?.filter((r) => !r.ok).length ?? 0;

  /* ------- Regresión visible: instantánea por ejecución + comparación -------
   * Cada «Ejecutar» deja una instantánea (consola + QA móvil + peso). La
   * comparación contra la ejecución anterior dice qué rompió o arregló el
   * cambio — un antes y un después medidos, no una opinión. */
  const [baseline, setBaseline] = useState<RunSnapshot | null>(null);
  const [regDiff, setRegDiff] = useState<RegressionDiff | null>(null);
  const baselineRef = useRef<RunSnapshot | null>(null);
  const pendienteRef = useRef<{ entry: string; htmlBytes: number; startedAt: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** logs espejo en ref: la instantánea se cierra desde un timer, sin render */
  const logsRef = useRef<LogLine[]>([]);

  const finalizarSnapshot = useCallback(() => {
    const pend = pendienteRef.current;
    if (!pend) return;
    pendienteRef.current = null;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // el QA cuenta si el medidor respondió DESPUÉS de arrancar esta ejecución
    const qa =
      qaUltimaRef.current && qaUltimaRef.current.at >= pend.startedAt ? qaUltimaRef.current : null;
    const snap: RunSnapshot = {
      at: Date.now(),
      entry: pend.entry,
      logs: logsRef.current.map((l) => ({ level: l.level, text: l.text })),
      qa,
      htmlBytes: pend.htmlBytes,
    };
    const prev = baselineRef.current;
    const diff = prev && comparables(prev, snap) ? compareRuns(prev, snap) : null;
    baselineRef.current = snap;
    setBaseline(snap);
    setRegDiff(diff);
  }, []);

  const qaProblemas = qaResultados.reduce(
    (n, r) => n + (r.noRespondio || r.ok ? 0 : r.items.length),
    0
  );

  /** Batería QA sobre el iframe, guardando resultados y apuntando los
   * hallazgos a la memoria de fallos (dedupe por regla). La usa el botón QA
   * y el paso «qa» del Piloto. */
  const medirQARecordando = useCallback(async (widths: readonly number[]): Promise<QAResult[]> => {
    const resultados = await runVisualQA(frameRef.current, widths);
    setQaResultados(resultados);
    const store = useFailures.getState();
    for (const r of resultados) {
      if (r.noRespondio || r.ok) continue;
      for (const item of r.items) {
        store.record(
          "sandbox",
          `QA del Sandbox a ${r.width}px: ${item.detalle.slice(0, 140)}`,
          reglaDeQA(item.tipo),
          item.tipo === "scroll" || item.tipo === "fuera" ? "error" : "warn"
        );
      }
    }
    return resultados;
  }, []);

  const correrQA = useCallback(async () => {
    setQaAbierto(true);
    setQaCorriendo(true);
    try {
      await medirQARecordando(QA_WIDTHS);
    } finally {
      setQaCorriendo(false);
    }
  }, [medirQARecordando]);

  const reset = useCallback(() => {
    setEntries({});
    setDeleted({});
    setName("");
    setSelPath(null);
    setOpenDirs(new Set());
    setRunHtml(null);
    setLogs([]);
    setFilter("");
    setReport(null);
    setGotoLine(null);
    setPanel("editor");
    setVistaCompleta(false);
    reviewedRef.current = false;
    reviewerRef.current.reset();
    // piloto: otro proyecto, otra prueba — fuera pasos y resultados
    setPilotoAbierto(false);
    setPilotoTexto("");
    setPilotoResultados(null);
    pilotoAbortRef.current = false;
    // regresión: otro proyecto, otra historia — la comparación empieza de cero
    logsRef.current = [];
    pendienteRef.current = null;
    baselineRef.current = null;
    setBaseline(null);
    setRegDiff(null);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /* ------- carga desde semilla (Repo Studio / chat) ------- */
  useEffect(() => {
    if (!open || !initial) return;
    const map: Record<string, Entry> = {};
    for (const f of initial.files) {
      map[f.path] = {
        path: f.path,
        data: encodeText(f.content),
        text: f.content,
        orig: f.content,
      };
    }
    const paths = Object.keys(map);
    setEntries(map);
    setName(initial.name);
    setRunHtml(null);
    setLogs([]);
    setReport(null);
    setPanel("editor");
    const entry = pickEntryPath(paths, null) ?? paths[0] ?? null;
    setSelPath(entry);
    setOpenDirs(new Set(paths.flatMap(ancestorDirs)));
    // Si hay un index.html (o HTML de entrada), abrir directo la vista
    // previa en vez de quedarse en el editor — pedido en PLAN-V7 (U3).
    if (entry) {
      // proyecto nuevo: vuelve a mandar el auto-arranque hasta que elijas
      eleccionManualRef.current = false;
      setAutoRunPending(true);
    }
    onInitialConsumed?.();
    toast.success("Proyecto cargado en el Sandbox", {
      description: `${initial.files.length} archivo${initial.files.length > 1 ? "s" : ""} listo${initial.files.length > 1 ? "s" : ""} para ejecutar.`,
    });
  }, [open, initial, onInitialConsumed]);

  /* ------- carga desde URL de un ZIP (U3 plantillas) -------
   *  Cuando chat-app abre el Sandbox con initialZipUrl, lo descarga y lo
   *  pasa por el mismo loadZipFile que usa el botón «Cargar ZIP» interno.
   *  Vive en un efecto aparte para no mezclarlo con la semilla de texto. */
  useEffect(() => {
    if (!open || !initialZipUrl) return;
    let cancelled = false;
    setLoading(true);
    fetch(initialZipUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`No se pudo cargar ${initialZipUrl} (${r.status})`);
        return r.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        const name = initialZipUrl.split("/").pop() ?? "plantilla.zip";
        return loadZipFile(new File([blob], name, { type: "application/zip" }));
      })
      .then(() => {
        if (!cancelled) onInitialZipConsumed?.();
      })
      .catch((e) => {
        if (cancelled) return;
        toast.error("No se pudo cargar la plantilla", {
          description: e instanceof Error ? e.message : String(e),
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, initialZipUrl, onInitialZipConsumed]);

  /* ------- puente de consola desde el iframe ------- */
  useEffect(() => {
    if (!open) return;
    const onMsg = (e: MessageEvent) => {
      // solo se acepta lo que venga del iframe del Sandbox
      if (frameRef.current && e.source !== frameRef.current.contentWindow) return;
      const d = e.data as { source?: string; level?: string; text?: string } | null;
      if (!d || d.source !== SANDBOX_ORIGIN || typeof d.text !== "string") return;
      logSeq.current += 1;
      const line: LogLine = {
        id: logSeq.current,
        level: d.level ?? "log",
        text: d.text,
        time: new Date().toLocaleTimeString(),
      };
      logsRef.current = [...logsRef.current.slice(-(MAX_LOGS - 1)), line];
      setLogs((ls) => [...ls.slice(-(MAX_LOGS - 1)), line]);
      // un error en tiempo de ejecución es el fallo más verificable que existe:
      // se apunta en la memoria de fallos (dedupe por regla, caduca en 14 días)
      if (line.level === "error") {
        useFailures.getState().record(
          "sandbox",
          `Error en ejecución: ${line.text.slice(0, 160)}`,
          "El JavaScript del proyecto debe ejecutarse sin errores: prueba con «Ejecutar» y revisa la consola antes de dar el trabajo por terminado.",
          "error"
        );
      }
      // salta a la consola, salvo si estás mirando la vista previa:
      // ahí el aviso es la chapa roja de la pestaña, sin interrumpir la prueba
      if (line.level === "error") setPanel((p) => (p === "vista" ? p : "consola"));
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [open]);

  const loadZipFile = useCallback(
    async (file: File) => {
      setLoading(true);
      try {
        const buf = await file.arrayBuffer();
        const list = await readZip(buf);
        const map: Record<string, Entry> = {};
        for (const e of list) {
          if (isJunkPath(e.path) || map[e.path]) continue;
          const isText = isTextPath(e.path) && e.size <= 1_500_000;
          let text: string | null = null;
          if (isText) {
            try {
              text = decodeText(e.data);
            } catch {
              text = null;
            }
          }
          map[e.path] = { path: e.path, data: e.data, text, orig: text };
        }
        const paths = Object.keys(map);
        if (!paths.length) {
          toast.error("El ZIP no tiene archivos utilizables");
          return;
        }
        reset();
        setEntries(map);
        setName(file.name.replace(/\.zip$/i, ""));
        const entry = pickEntryPath(paths, null);
        setSelPath(entry ?? paths.sort()[0] ?? null);
        // se despliegan las carpetas del primer nivel y las del archivo elegido
        const top = new Set<string>(
          paths.map((p) => p.split("/")[0]).filter((p) => paths.some((q) => q.startsWith(`${p}/`)))
        );
        for (const d of ancestorDirs(entry ?? "")) top.add(d);
        setOpenDirs(top);
        if (!entry) {
          toast.info("No hay HTML en el proyecto", {
            description: "Puedes editarlo y revisarlo, pero no hay página que ejecutar.",
          });
        } else {
          // Hay index.html (o HTML de entrada): abrir directo la vista previa
          // en vez de quedarse en el editor — pedido en PLAN-V7 (U3).
          eleccionManualRef.current = false;
          setAutoRunPending(true);
        }
        toast.success("ZIP cargado", {
          description: `${paths.length} archivos. «Revisar» lo analiza y «Ejecutar» lo prueba.`,
        });
      } catch (e) {
        toast.error("No se pudo abrir el ZIP", {
          description: e instanceof Error ? e.message : String(e),
        });
      } finally {
        setLoading(false);
      }
    },
    [reset]
  );

  const loadDemo = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/demo-sandbox.zip");
      if (!res.ok) throw new Error(`No se encontró la demo (${res.status})`);
      const blob = await res.blob();
      await loadZipFile(new File([blob], "demo-web.zip", { type: "application/zip" }));
    } catch (e) {
      toast.error("No se pudo cargar la demo", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  }, [loadZipFile]);

  const paths = useMemo(() => Object.keys(entries).sort(), [entries]);
  const q = filter.trim().toLowerCase();
  const filtered = useMemo(
    () => (q ? paths.filter((p) => p.toLowerCase().includes(q)) : paths),
    [paths, q]
  );
  const tree = useMemo(() => buildTree(filtered), [filtered]);
  const errorCount = logs.filter((l) => l.level === "error").length;

  const dirtyPaths = useMemo(
    () =>
      new Set(
        Object.values(entries)
          .filter((e) => e.text !== null && e.text !== e.orig)
          .map((e) => e.path)
      ),
    [entries]
  );
  const dirtyCount = dirtyPaths.size;

  /** peor nivel de diagnóstico por archivo, para el punto de color del árbol */
  const problemsByFile = useMemo(() => {
    const m = new Map<string, ReviewLevel>();
    if (!report) return m;
    const rank: Record<ReviewLevel, number> = { error: 0, warn: 1, info: 2 };
    for (const d of report.diagnostics) {
      if (!d.file) continue;
      const cur = m.get(d.file);
      if (!cur || rank[d.level] < rank[cur]) m.set(d.file, d.level);
    }
    return m;
  }, [report]);

  /** Lo que ha cambiado respecto al proyecto tal y como se cargó. */
  const changes = useMemo<ChangedFile[]>(() => {
    const out: ChangedFile[] = [];
    for (const e of Object.values(entries)) {
      if (e.text === null) continue; // los binarios no se editan aquí
      if (e.orig === null) {
        if (!e.text) continue; // creado y aún vacío: nada que enseñar
        out.push({
          path: e.path,
          before: null,
          after: e.text,
          diff: wholeFileDiff(e.path, e.text, "nuevo"),
        });
      } else if (e.text !== e.orig) {
        out.push({
          path: e.path,
          before: e.orig,
          after: e.text,
          diff: fileDiff(e.path, e.orig, e.text),
        });
      }
    }
    for (const [path, orig] of Object.entries(deleted)) {
      out.push({ path, before: orig, after: null, diff: wholeFileDiff(path, orig, "borrado") });
    }
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }, [entries, deleted]);

  const sel = selPath ? entries[selPath] : undefined;

  const buildFilesMap = useCallback((): Map<string, Uint8Array> => {
    const map = new Map<string, Uint8Array>();
    for (const e of Object.values(entries)) {
      map.set(e.path, e.text !== null && e.text !== e.orig ? encodeText(e.text) : e.data);
    }
    return map;
  }, [entries]);

  const run = useCallback(() => {
    const map = buildFilesMap();
    const preferred = selPath && isHtmlPath(selPath) ? selPath : null;
    const entry = pickEntryPath([...map.keys()], preferred);
    if (!entry) {
      toast.error("No hay ninguna página HTML que ejecutar", {
        description: "El Sandbox corre proyectos web: añade un index.html o crea uno nuevo.",
      });
      return;
    }
    const built = buildRunHtml(entry, map);
    // el medidor de QA y el runtime del piloto viajan DENTRO del HTML: el sandbox
    // no deja leer su DOM desde fuera, pero postMessage sí cruza. La exportación
    // no pasa por aquí: sale limpio.
    const servido = injectPilot(injectVisualQA(built.html));
    setRunHtml(servido);
    setRunKey((k) => k + 1);
    logsRef.current = [];
    setLogs([]);
    // resultados del piloto de la ejecución anterior: ya no describen esta página
    setPilotoResultados(null);
    setPanel("vista");
    setVistaCompleta(true);
    // instantánea pendiente: se cierra a los 3 s con lo que haya en consola y
    // la medida de QA que el medidor mande al cargar (regresión visible)
    pendienteRef.current = { entry, htmlBytes: servido.length, startedAt: Date.now() };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(finalizarSnapshot, 3000);
    if (built.bareImports.length) {
      toast.error("Este proyecto importa paquetes de npm", {
        description: `${built.bareImports.slice(0, 3).join(", ")}… El Sandbox no instala dependencias: solo ejecuta el código del propio proyecto.`,
      });
    } else if (built.missing.length) {
      toast.info("Faltan recursos referenciados", {
        description: `${built.missing.length} archivo(s) no están en el proyecto: ${built.missing.slice(0, 3).join(", ")}. Mira la pestaña «Revisión».`,
      });
    }
  }, [buildFilesMap, selPath, finalizarSnapshot]);

  /* Al cargar un proyecto (semilla o ZIP) con index.html, abrir directo
   * la vista previa en vez de quedarse en el editor. Lo pide el usuario:
   * «en el sandbox cuando se abre debe abrir directo index.html». */
  useEffect(() => {
    if (!open || !autoRunPending) return;
    setAutoRunPending(false);
    // si ya elegiste pestaña mientras cargaba, no se te saca de ahí
    if (eleccionManualRef.current) return;
    run();
  }, [open, autoRunPending, run]);

  // al desmontar el Sandbox, no dejas timers vivos
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  /* ------- Piloto: ejecución de los pasos ------- */
  const ejecutarPiloto = useCallback(async () => {
    if (pilotoCorriendo) return;
    const { pasos, errores } = pilotoParseo;
    if (errores.length) {
      toast.error("Hay líneas que no entiendo", { description: errores[0] });
      return;
    }
    if (!pasos.length) {
      toast.info("Escribe al menos un paso", { description: 'P. ej. pulsa "Añadir" y luego lee.' });
      return;
    }
    setPilotoAbierto(true);
    setPilotoCorriendo(true);
    pilotoAbortRef.current = false;
    setPilotoResultados([]);
    pilotoInicioRef.current = logsRef.current.length;
    try {
      if (runHtml === null) {
        run();
        // deja cargar el documento y registrar el runtime dentro del iframe
        await new Promise((r) => setTimeout(r, 1600));
      }
      const frame = frameRef.current;
      const win = frame?.contentWindow;
      if (!frame || !win) {
        toast.error("La vista previa no está disponible");
        return;
      }
      const resultados = await ejecutarPasosPiloto({
        frame,
        win,
        pasos,
        totalLogs: () => logsRef.current.length,
        logsDesde: (i) => logsRef.current.slice(i).map((l) => ({ level: l.level, text: l.text })),
        medirQA: medirQARecordando,
        anchoPrevio: frame.style.width,
        onPaso: (r) => setPilotoResultados((prev) => [...(prev ?? []), r]),
        abortado: () => pilotoAbortRef.current,
      });
      setPilotoResultados(resultados);
      const mal = resultados.filter((r) => !r.ok).length;
      if (mal > 0) {
        toast.error(`${mal} paso${mal === 1 ? "" : "s"} fallido${mal === 1 ? "" : "s"}`, {
          description: "Copia el informe y pégaselo al agente en el chat para que lo corrija.",
        });
      } else {
        toast.success("Los pasos pasaron todos", {
          description: `${resultados.length} paso${resultados.length === 1 ? "" : "s"} sin fallos medidos.`,
        });
      }
    } finally {
      setPilotoCorriendo(false);
    }
  }, [pilotoCorriendo, pilotoParseo, runHtml, run, medirQARecordando]);

  /** Informe de la última prueba al portapapeles, para el agente del chat. */
  const copiarInformePiloto = useCallback(() => {
    if (!pilotoResultados?.length) return;
    const erroresConsola = logsRef.current
      .slice(pilotoInicioRef.current)
      .filter((l) => l.level === "error")
      .map((l) => l.text);
    const informe = informePiloto(name, pilotoResultados, erroresConsola);
    copiarTexto(informe)
      .then(() =>
        toast.success("Informe copiado", {
          description: "Pégalo en el chat: el agente corregirá lo que falló y lo vuelves a probar.",
        })
      )
      .catch(() => toast.error("No se pudo copiar", { description: "Tu navegador bloqueó el portapapeles." }));
  }, [pilotoResultados, name]);

  /** Lo que ve la revisión: el texto de cada archivo tal y como está ahora y,
   * en los binarios, sus bytes — dentro de un PDF o una imagen también puede
   * haberse quedado una credencial. */
  const reviewInput = useCallback(
    (): ReviewFile[] =>
      Object.values(entries).map((e) => ({
        path: e.path,
        text: e.text,
        size: e.text !== null && e.text !== e.orig ? encodeText(e.text).length : e.data.length,
        bytes: e.text === null ? e.data : undefined,
      })),
    [entries]
  );

  const runReview = useCallback(() => {
    const rep = reviewerRef.current.review(reviewInput());
    reviewedRef.current = true;
    setReport(rep);
    setPanel("revision");
    setVistaCompleta(false);
    if (rep.ready && rep.counts.warn === 0) {
      toast.success("Proyecto limpio", { description: "No se ha encontrado nada que corregir." });
    } else if (!rep.ready) {
      toast.error(
        `${rep.counts.error} problema${rep.counts.error === 1 ? "" : "s"} antes de subir a GitHub`,
        { description: "Pulsa cada uno para ir al archivo y la línea." }
      );
    }
    // Memoria de fallos: solo ERRORES de familias con regla útil (lo verificable).
    // Un aviso de estilo sería ruido que envenena el contexto del agente.
    const store = useFailures.getState();
    const errores = rep.diagnostics.filter((d) => d.level === "error");
    for (const d of errores.slice(0, 6)) {
      const regla = reglaFromDiagnostico(d);
      if (regla) {
        store.record("sandbox", `Revisión: ${d.message.slice(0, 160)}${d.file ? ` (${d.file})` : ""}`, regla);
      }
    }
  }, [reviewInput]);

  // una vez revisado, el informe se rehace solo mientras se editan los archivos
  useEffect(() => {
    if (!reviewedRef.current) return;
    const id = setTimeout(() => setReport(reviewerRef.current.review(reviewInput())), 600);
    return () => clearTimeout(id);
  }, [reviewInput]);

  const goToDiagnostic = useCallback(
    (d: Diagnostic) => {
      if (!d.file || !entries[d.file]) return;
      setSelPath(d.file);
      setOpenDirs((s) => new Set([...s, ...ancestorDirs(d.file)]));
      setPanel("editor");
      setVistaCompleta(false);
      if (d.line) setGotoLine({ path: d.file, line: d.line, nonce: Date.now() });
    },
    [entries]
  );

  const stopRun = () => {
    setRunHtml(null);
    setLogs([]);
    setPanel("editor");
    setVistaCompleta(false);
  };

  /** Cierra el círculo: lo que has corregido aquí se sube a GitHub sin pasar
   * por «exportar ZIP y volver a subirlo a mano». Va el proyecto entero, con
   * sus binarios: lo que se sube es lo mismo que exportaría el ZIP. */
  const publish = () => {
    const files = Object.values(entries).map((e) => ({
      path: e.path,
      data: e.text !== null && e.text !== e.orig ? encodeText(e.text) : e.data,
    }));
    if (!files.length) {
      toast.error("No hay nada que subir");
      return;
    }
    onPublish?.({ name: name || "proyecto-sandbox", files });
  };

  const exportZip = () => {
    if (!paths.length) return;
    const files = Object.values(entries).map((e) => ({
      path: e.path,
      data: e.text !== null && e.text !== e.orig ? encodeText(e.text) : e.data,
    }));
    const zip = writeZip(files);
    const blob = new Blob([zip as BlobPart], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name || "sandbox"}-editado.zip`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("ZIP exportado", {
      description: `${files.length} archivos${dirtyCount > 0 ? ` (incluye ${dirtyCount} editado${dirtyCount > 1 ? "s" : ""})` : ""}.`,
    });
  };

  const createFile = () => {
    const path = newPath.trim().replace(/^\/+/, "");
    if (!path) return;
    if (entries[path]) {
      toast.error("Ya existe un archivo con esa ruta");
      return;
    }
    setEntries((es) => ({
      ...es,
      [path]: { path, data: new Uint8Array(0), text: "", orig: null },
    }));
    setDeleted((d) => {
      if (!(path in d)) return d;
      const copy = { ...d };
      delete copy[path];
      return copy;
    });
    setSelPath(path);
    setOpenDirs((s) => new Set([...s, ...ancestorDirs(path)]));
    setPanel("editor");
    setShowNewFile(false);
    setNewPath("");
  };

  const deleteFile = () => {
    if (!selPath) return;
    const gone = selPath;
    const original = entries[gone]?.orig;
    setEntries((es) => {
      const copy = { ...es };
      delete copy[gone];
      return copy;
    });
    // solo se recuerda si venía del proyecto: un archivo creado y borrado en la
    // misma sesión no es un cambio, es que nunca existió
    if (typeof original === "string") setDeleted((d) => ({ ...d, [gone]: original }));
    setSelPath(null);
    if (runHtml !== null) {
      setRunHtml(null);
      setVistaCompleta(false);
    } // la vista previa ya no refleja el proyecto
    toast.success(`«${gone}» eliminado del proyecto`, {
      description: "Ya no aparecerá en el ZIP exportado.",
    });
  };

  const revertFile = () => {
    if (!sel) return;
    if (sel.orig === null) {
      // archivo nuevo: revertir es vaciarlo, no restaurar un original inexistente
      setEntries((es) => ({ ...es, [sel.path]: { ...es[sel.path], text: "" } }));
      return;
    }
    setEntries((es) => ({ ...es, [sel.path]: { ...es[sel.path], text: es[sel.path].orig } }));
  };

  const toggleDir = useCallback((path: string) => {
    setOpenDirs((s) => {
      const next = new Set(s);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  // con un filtro activo se despliega todo para que se vean los resultados
  const visibleDirs = useMemo(
    () => (q ? new Set(filtered.flatMap(ancestorDirs)) : openDirs),
    [q, filtered, openDirs]
  );

  const TABS: { id: Panel; label: string; icon: typeof Play; badge?: number; tone?: string }[] = [
    { id: "editor", label: "Editor", icon: FileText },
    { id: "vista", label: "Vista", icon: Play },
    {
      id: "cambios",
      label: "Cambios",
      icon: GitCompare,
      badge: changes.length || undefined,
      tone: "bg-emerald-500",
    },
    {
      id: "revision",
      label: "Revisión",
      icon: ShieldCheck,
      badge: report?.counts.error || undefined,
      tone: "bg-red-500",
    },
    {
      id: "consola",
      label: "Consola",
      icon: Terminal,
      badge: errorCount || undefined,
      tone: "bg-red-500",
    },
    {
      id: "regresion",
      label: "Regresión",
      icon: Activity,
      badge:
        regDiff && regDiff.nivel === "mal"
          ? regDiff.nuevos.length + regDiff.qa.regressed.length || undefined
          : undefined,
      tone: "bg-red-500",
    },
  ];

  const ocultarArbol = panel === "vista";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setVistaCompleta(false);
        onOpenChange(v);
      }}
    >
      <DialogContent
        className={cn(
          // Nunca «relative»: pisa el `fixed` del Dialog y el panel se rendera
          // debajo del viewport (la app es h-dvh + overflow hidden) → el botón
          // Sandbox parece muerto.
          "flex flex-col gap-0 overflow-hidden p-0",
          pantallaCompleta
            ? "fixed inset-0 top-0 right-0 bottom-0 left-0 z-50 h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 rounded-none border-0 shadow-none sm:max-w-none data-[state=open]:translate-x-0 data-[state=open]:translate-y-0 data-[state=open]:zoom-in-100"
            : "h-[92vh] max-w-6xl"
        )}
      >
        <DialogHeader className={cn("border-b pb-3 pt-4", pantallaCompleta ? "px-3" : "px-5")}>
          <DialogTitle className="flex items-center gap-2 pr-8 text-base">
            <Box className="size-4 shrink-0 text-prism-cyan" /> Sandbox
            {name && (
              <span className="truncate text-xs font-normal text-muted-foreground">· {name}</span>
            )}
            <span className="ml-auto flex shrink-0 items-center gap-1">
              {paths.length > 0 && (
                <span className="text-[11px] font-normal text-muted-foreground">
                  {paths.length} archivo{paths.length === 1 ? "" : "s"}
                </span>
              )}
              {/* En pantallas estrechas no hay elección que ofrecer: el diálogo
                  con marco deja el iframe en un sello de correos. */}
              {!estrecha && (
                <button
                  onClick={() => setMaximizado((v) => !v)}
                  aria-label={maximizado ? "Restaurar tamaño del Sandbox" : "Sandbox a pantalla completa"}
                  title={maximizado ? "Restaurar tamaño" : "Pantalla completa"}
                  className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  {maximizado ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
                </button>
              )}
            </span>
          </DialogTitle>
          <DialogDescription className={cn("text-xs", pantallaCompleta && "sr-only")}>
            Navega el proyecto, ejecútalo en un marco aislado y revísalo entero: credenciales
            olvidadas, archivos privados, enlaces rotos y errores de sintaxis, antes de subirlo a
            GitHub.
          </DialogDescription>
        </DialogHeader>

        {!paths.length ? (
          /* ------- estado vacío: zona de carga ------- */
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto p-6">
            <div
              ref={dragRef}
              onDragOver={(e) => {
                e.preventDefault();
                dragRef.current?.classList.add("ring-2", "ring-prism-cyan");
              }}
              onDragLeave={() => dragRef.current?.classList.remove("ring-2", "ring-prism-cyan")}
              onDrop={(e) => {
                e.preventDefault();
                dragRef.current?.classList.remove("ring-2", "ring-prism-cyan");
                const f = e.dataTransfer.files?.[0];
                if (f) void loadZipFile(f);
              }}
              className="flex w-full max-w-md flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border/70 p-8 text-center transition"
            >
              <UploadCloud className="size-9 text-muted-foreground/50" />
              <p className="text-sm font-medium">Suelta un ZIP aquí</p>
              <p className="text-xs text-muted-foreground">o elige el archivo desde tu dispositivo</p>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept=".zip,application/zip"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void loadZipFile(f);
                    e.target.value = "";
                  }}
                />
                <span className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90">
                  {loading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <UploadCloud className="size-4" />
                  )}
                  {loading ? "Cargando…" : "Cargar ZIP"}
                </span>
              </label>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={loadDemo}
                disabled={loading}
              >
                <Play className="size-3.5" /> Probar con una demo
              </Button>
            </div>
            <div className="max-w-md space-y-1 text-center text-[11px] leading-relaxed text-muted-foreground/80">
              <p>
                <strong className="text-foreground">Ejecuta:</strong> webs estáticas HTML + CSS +
                JS, incluidos los módulos ES que se importan entre archivos. No instala
                dependencias: los paquetes de npm quedan fuera.
              </p>
              <p>
                <strong className="text-foreground">Revisa:</strong> cualquier proyecto — busca
                claves de API, archivos privados, enlaces rotos y sintaxis rota antes de que acaben
                en GitHub.
              </p>
              <p>
                El proyecto corre aislado (sin acceso a esta app ni a tus claves) y nada sale de tu
                dispositivo.
              </p>
            </div>
          </div>
        ) : (
          /* ------- proyecto cargado ------- */
          <>
            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
              <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={run}>
                <Play className="size-3.5" /> Ejecutar
              </Button>
              {runHtml !== null && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={stopRun}
                >
                  <Square className="size-3.5" /> Detener
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={runReview}
                title="Analiza todo el proyecto antes de subirlo a GitHub"
              >
                <ShieldCheck className="size-3.5" /> Revisar
                {report && !report.ready && (
                  <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                    {report.counts.error}
                  </span>
                )}
              </Button>
              <div className="ml-auto flex gap-2">
                {onPublish && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={publish}
                    title="Sube este proyecto a GitHub (pasa otra vez por la revisión)"
                  >
                    <Github className="size-3.5" /> Subir
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={exportZip}
                >
                  <Download className="size-3.5" /> ZIP
                  {dirtyCount > 0 && (
                    <span className="rounded-full bg-emerald-500/15 px-1.5 text-[10px] font-semibold text-emerald-600">
                      {dirtyCount}
                    </span>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={reset}
                  title="Vaciar y cargar otro ZIP"
                >
                  <Trash2 className="size-3.5" /> Vaciar
                </Button>
              </div>
            </div>

            <div
              className={cn(
                "grid min-h-0 flex-1",
                ocultarArbol
                  ? "grid-cols-1"
                  : "grid-cols-1 grid-rows-[minmax(0,180px)_minmax(0,1fr)] sm:grid-cols-[minmax(0,260px)_minmax(0,1fr)] sm:grid-rows-1"
              )}
            >
              {/* ---------- navegador del proyecto ----------
                  En Vista se esconde: el proyecto tiene que verse entero, no
                  en una columna al lado del árbol. */}
              <div
                className={cn(
                  "flex min-h-0 flex-col border-b sm:border-b-0 sm:border-r",
                  ocultarArbol && "hidden"
                )}
              >
                <div className="flex items-center gap-1.5 border-b px-3 py-2">
                  <Search className="size-3.5 shrink-0 text-muted-foreground" />
                  <input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Buscar archivo…"
                    className="h-7 w-full bg-transparent text-xs outline-none"
                    aria-label="Buscar archivos del proyecto"
                  />
                  <button
                    onClick={() => setShowNewFile((v) => !v)}
                    title="Archivo nuevo"
                    aria-label="Crear archivo nuevo"
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <FilePlus2 className="size-3.5" />
                  </button>
                </div>
                {showNewFile && (
                  <div className="space-y-1 border-b px-3 py-2">
                    <Label htmlFor="new-sb-file" className="text-[10px] text-muted-foreground">
                      Ruta del archivo nuevo
                    </Label>
                    <div className="flex gap-1.5">
                      <Input
                        id="new-sb-file"
                        value={newPath}
                        onChange={(e) => setNewPath(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && createFile()}
                        placeholder="css/estilo.css"
                        className="h-7 text-xs"
                      />
                      <Button
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={createFile}
                        disabled={!newPath.trim()}
                      >
                        Crear
                      </Button>
                    </div>
                  </div>
                )}
                <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
                  {filtered.length === 0 ? (
                    <li className="px-2 py-4 text-center text-xs text-muted-foreground">
                      Ningún archivo coincide con «{filter}»
                    </li>
                  ) : (
                    <TreeRows
                      nodes={tree}
                      depth={0}
                      open={visibleDirs}
                      toggle={toggleDir}
                      selPath={selPath}
                      onSelect={(p) => {
                        setSelPath(p);
                        setPanel("editor");
                      }}
                      dirty={dirtyPaths}
                      problems={problemsByFile}
                    />
                  )}
                </ul>
                {report && (
                  <div className="flex items-center gap-2 border-t px-3 py-1.5 text-[10px] text-muted-foreground">
                    <span
                      className={cn(
                        "inline-flex size-1.5 rounded-full",
                        report.ready ? "bg-emerald-500" : "bg-red-500"
                      )}
                    />
                    {report.ready
                      ? "Sin errores bloqueantes"
                      : `${report.counts.error} error${report.counts.error === 1 ? "" : "es"}`}
                    {report.counts.warn > 0 && ` · ${report.counts.warn} aviso${report.counts.warn === 1 ? "" : "s"}`}
                  </div>
                )}
              </div>

              {/* ---------- paneles ---------- */}
              <div className="flex min-h-0 flex-col">
                <div
                  role="tablist"
                  aria-label="Paneles del Sandbox"
                  className={cn(
                    "flex shrink-0 items-center gap-1 border-b px-2 py-1.5",
                    vistaCompleta && "hidden"
                  )}
                >
                  {TABS.map((t) => {
                    const Icon = t.icon;
                    const active = panel === t.id;
                    return (
                      <button
                        key={t.id}
                        role="tab"
                        aria-selected={active}
                        onClick={() => {
                          eleccionManualRef.current = true;
                          setPanel(t.id);
                        }}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition",
                          active
                            ? "bg-primary/10 text-foreground ring-1 ring-inset ring-primary/25"
                            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                        )}
                      >
                        <Icon className="size-3.5" />
                        {t.label}
                        {t.badge ? (
                          <span
                            className={cn(
                              "flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white",
                              t.tone
                            )}
                          >
                            {t.badge}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>

                {/* --- Editor --- */}
                {panel === "editor" &&
                  (sel ? (
                    <>
                      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
                        <span className="min-w-0 flex-1 truncate font-mono text-xs" title={sel.path}>
                          {sel.path}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground/70">
                          {fmtSize(sel.data.length)}
                        </span>
                        {sel.text !== null && sel.text !== sel.orig && (
                          <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                            sin guardar
                          </span>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          onClick={revertFile}
                          disabled={sel.text === null || sel.text === (sel.orig ?? "")}
                        >
                          <RotateCcw className="size-3" /> Revertir
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 text-xs text-red-500 hover:text-red-600"
                          onClick={deleteFile}
                        >
                          <Trash2 className="size-3" /> Quitar
                        </Button>
                      </div>
                      {sel.text !== null ? (
                        <CodeEditor
                          key={sel.path}
                          value={sel.text}
                          label={sel.path}
                          onRun={run}
                          goto={
                            gotoLine && gotoLine.path === sel.path
                              ? { line: gotoLine.line, nonce: gotoLine.nonce }
                              : null
                          }
                          onChange={(v) =>
                            setEntries((es) => ({ ...es, [sel.path]: { ...es[sel.path], text: v } }))
                          }
                        />
                      ) : IMAGE_EXT.includes(extOf(sel.path)) ? (
                        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-muted/20 p-4">
                          <img
                            src={toDataUrl(
                              sel.data,
                              extOf(sel.path) === "svg" ? "image/svg+xml" : `image/${extOf(sel.path)}`
                            )}
                            alt={sel.path}
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                      ) : (
                        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 bg-muted/20 p-6 text-center">
                          <FileText className="size-8 text-muted-foreground/40" />
                          <p className="text-xs text-muted-foreground">
                            Archivo binario ({fmtSize(sel.data.length)}) — se conserva tal cual en el
                            ZIP exportado.
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
                      <FileText className="size-8 text-muted-foreground/40" />
                      <p className="max-w-[280px] text-xs text-muted-foreground">
                        Elige un archivo del árbol para verlo y editarlo. «Ejecutar» prueba el
                        proyecto y «Revisar» lo analiza antes de subirlo.
                      </p>
                    </div>
                  ))}

                {/* --- Vista previa ---
                    Se mantiene montada aunque se mire otra pestaña: cambiar de panel
                    no debe reiniciar el proyecto ni perder lo que llevas probado. */}
                {runHtml !== null ? (
                  <div
                    className={cn(
                      "flex min-h-0 flex-1 flex-col",
                      panel !== "vista" && !vistaCompleta && "hidden",
                      vistaCompleta && "fixed inset-0 z-[60] bg-background"
                    )}
                  >
                    <div className="flex shrink-0 items-center gap-2 border-b bg-muted/40 px-3 py-1.5 text-[10px] text-muted-foreground">
                      {vistaCompleta ? (
                        <button
                          type="button"
                          onClick={() => setVistaCompleta(false)}
                          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium text-foreground hover:bg-accent"
                          title="Volver al Sandbox (Esc)"
                          aria-label="Volver al Sandbox"
                        >
                          <Minimize2 className="size-3" /> Volver
                        </button>
                      ) : (
                        <>
                          <span className="inline-flex size-1.5 rounded-full bg-emerald-500" />
                          Vista previa aislada · sin acceso a tus claves
                        </>
                      )}
                      {vistaCompleta && (
                        <div
                          role="tablist"
                          aria-label="Paneles del Sandbox"
                          className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
                        >
                          {TABS.map((t) => {
                            const Icon = t.icon;
                            const active = panel === t.id;
                            return (
                              <button
                                key={t.id}
                                type="button"
                                role="tab"
                                aria-selected={active}
                                onClick={() => {
                                  eleccionManualRef.current = true;
                                  setPanel(t.id);
                                  if (t.id !== "vista") setVistaCompleta(false);
                                }}
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition",
                                  active
                                    ? "bg-primary/10 text-foreground ring-1 ring-inset ring-primary/25"
                                    : "hover:bg-accent/60 hover:text-foreground"
                                )}
                              >
                                <Icon className="size-3" />
                                {t.label}
                                {t.badge ? (
                                  <span
                                    className={cn(
                                      "flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-1 text-[8px] font-bold text-white",
                                      t.tone
                                    )}
                                  >
                                    {t.badge}
                                  </span>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setRunKey((k) => k + 1)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-accent",
                          !vistaCompleta && !qaAbierto && "ml-auto"
                        )}
                        title="Recargar la vista previa"
                      >
                        <RefreshCw className="size-3" /> Recargar
                      </button>
                      <button
                        type="button"
                        onClick={() => (qaAbierto ? setQaAbierto(false) : void correrQA())}
                        className={cn(
                          "relative inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-accent",
                          qaAbierto && "bg-accent text-foreground",
                          !vistaCompleta && !qaAbierto && ""
                        )}
                        title="QA visual: mide el proyecto a 320 y 390 px (desbordes, texto pequeño, contraste)"
                      >
                        <ScanSearch className="size-3" /> QA
                        {qaProblemas > 0 && !qaAbierto && (
                          <span className="flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-bold text-white">
                            {qaProblemas}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPilotoAbierto((v) => !v)}
                        className={cn(
                          "relative inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-accent",
                          pilotoAbierto && "bg-accent text-foreground"
                        )}
                        title="Piloto: pulsa, escribe, cambia el ancho y lee la página por pasos; deja un informe para el agente"
                      >
                        <MousePointerClick className="size-3" /> Piloto
                        {pilotoFallos > 0 && !pilotoAbierto && (
                          <span className="flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-bold text-white">
                            {pilotoFallos}
                          </span>
                        )}
                      </button>
                      {!vistaCompleta && (
                        <button
                          type="button"
                          onClick={() => setVistaCompleta(true)}
                          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium text-foreground hover:bg-accent"
                          title="Ver el proyecto a pantalla completa"
                          aria-label="Ver el proyecto a pantalla completa"
                        >
                          <Maximize2 className="size-3" /> Pantalla completa
                        </button>
                      )}
                    </div>
                    {qaAbierto && (
                      <div className="shrink-0 border-b border-border/60 bg-muted/30 px-3 py-2">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <p className="text-[11px] font-medium text-foreground/80">
                            {qaCorriendo
                              ? "Midiendo a 320 y 390 px…"
                              : qaProblemas === 0
                                ? qaResultados.length
                                  ? "El proyecto pasa la batería móvil sin problemas medidos."
                                  : qaAuto && !qaAuto.ok
                                    ? `Medida automática a ${qaAuto.width}px: ${qaAuto.items.length} aviso(s).`
                                    : "Pulsa «Repetir» para medir el proyecto a 320 y 390 px."
                                : `${qaProblemas} problema(s) medido(s) en móvil`}
                          </p>
                          <button
                            onClick={() => void correrQA()}
                            disabled={qaCorriendo}
                            className="shrink-0 rounded-md border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                          >
                            Repetir
                          </button>
                        </div>
                        <div className="space-y-1">
                          {qaResultados.map((r) => (
                            <div key={r.width} className="text-[11px] leading-snug">
                              <span
                                className={cn(
                                  "mr-1.5 inline-block w-9 rounded px-1 text-center font-semibold",
                                  r.noRespondio
                                    ? "bg-muted text-muted-foreground"
                                    : r.ok
                                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                      : "bg-red-500/15 text-red-600 dark:text-red-400"
                                )}
                              >
                                {r.width}
                              </span>
                              {r.noRespondio ? (
                                <span className="text-muted-foreground">El medidor no respondió a este ancho.</span>
                              ) : r.ok ? (
                                <span className="text-muted-foreground">Sin desbordes, texto pequeño ni contraste pobre.</span>
                              ) : (
                                <ul className="ml-0 list-none space-y-0.5">
                                  {r.items.map((it, i) => (
                                    <li key={i} className="text-foreground/85">
                                      <span className="mr-1 font-medium text-red-600 dark:text-red-400">{QA_LABEL[it.tipo]}:</span>
                                      {it.detalle}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {pilotoAbierto && (
                      <div className="shrink-0 border-b border-border/60 bg-muted/30 px-3 py-2">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <p className="text-[11px] font-medium text-foreground/80">
                            Piloto — pasos sobre la vista en marcha: pulsa, escribe, cambia el ancho y lee
                          </p>
                          <button
                            type="button"
                            onClick={() => setPilotoAbierto(false)}
                            className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                            aria-label="Cerrar el piloto"
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                        <textarea
                          value={pilotoTexto}
                          onChange={(e) => setPilotoTexto(e.target.value)}
                          rows={4}
                          spellCheck={false}
                          placeholder={"ve a 320px\npulsa \"Añadir\"\nescribe \"Comprar leche\" en #tarea\nlee\nqa"}
                          className="w-full resize-y rounded-md border border-border/60 bg-background p-2 font-mono text-[11px] leading-relaxed outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-prism-cyan/50"
                          aria-label="Pasos del piloto"
                        />
                        {pilotoParseo.errores.length > 0 && (
                          <ul className="mt-1 space-y-0.5 text-[10.5px] text-amber-600 dark:text-amber-400">
                            {pilotoParseo.errores.slice(0, 3).map((e, i) => (
                              <li key={i} className="break-words">{e}</li>
                            ))}
                          </ul>
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {pilotoCorriendo ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1.5 text-xs"
                              onClick={() => {
                                pilotoAbortRef.current = true;
                              }}
                            >
                              <Square className="size-3" /> Detener
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              className="h-7 gap-1.5 text-xs"
                              onClick={() => void ejecutarPiloto()}
                              disabled={!pilotoParseo.pasos.length}
                            >
                              <Play className="size-3" /> Ejecutar {pilotoParseo.pasos.length || ""} paso{pilotoParseo.pasos.length === 1 ? "" : "s"}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1.5 text-xs"
                            onClick={() => setPilotoTexto(PILOT_EJEMPLO)}
                            disabled={pilotoCorriendo}
                            title="Rellena pasos que funcionan con la demo del Sandbox"
                          >
                            <Wand2 className="size-3" /> Ejemplo
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1.5 text-xs"
                            onClick={copiarInformePiloto}
                            disabled={!pilotoResultados?.length || pilotoCorriendo}
                            title="Copia el informe de la última prueba para pegárselo al agente en el chat"
                          >
                            <Copy className="size-3" /> Copiar informe
                          </Button>
                          {pilotoCorriendo && (
                            <span className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground">
                              <Loader2 className="size-3 animate-spin" /> Ejecutando… mira la vista.
                            </span>
                          )}
                        </div>
                        {pilotoResultados && pilotoResultados.length > 0 && (
                          <ol className="mt-2 max-h-44 space-y-1 overflow-y-auto pr-1 text-[11px] leading-snug">
                            {pilotoResultados.map((r, i) => (
                              <li key={`${r.at}-${i}`} className="rounded border border-border/50 bg-background/60 px-2 py-1">
                                <p className="flex items-start gap-1.5">
                                  <span
                                    className={cn(
                                      "mt-[1px] flex h-3.5 min-w-3.5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white",
                                      r.ok ? "bg-emerald-500" : "bg-red-500"
                                    )}
                                  >
                                    {r.ok ? "✓" : "✕"}
                                  </span>
                                  <span className="min-w-0 font-medium text-foreground/90">{r.descripcion}</span>
                                </p>
                                <p className={cn("ml-5 mt-0.5 break-words", r.ok ? "text-muted-foreground" : "text-red-600 dark:text-red-400")}>
                                  {r.detalle}
                                </p>
                                {r.logsNuevos
                                  .filter((l) => l.level === "error")
                                  .slice(0, 2)
                                  .map((l, j) => (
                                    <p key={j} className="ml-5 break-words font-mono text-[10px] text-red-500/90">
                                      ↳ {l.text.slice(0, 140)}
                                    </p>
                                  ))}
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    )}
                    <iframe
                      key={runKey}
                      ref={frameRef}
                      title="Vista previa del Sandbox"
                      sandbox="allow-scripts allow-modals allow-forms allow-popups allow-pointer-lock"
                      srcDoc={runHtml}
                      className="min-h-0 h-full w-full flex-1 border-0 bg-white"
                    />
                  </div>
                ) : panel === "vista" ? (
                  <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                      <Play className="size-8 text-muted-foreground/40" />
                      <p className="max-w-[280px] text-xs text-muted-foreground">
                        El proyecto todavía no está en marcha. Pulsa «Ejecutar» (o Ctrl+Intro desde
                        el editor) para verlo aquí.
                      </p>
                    <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={run}>
                      <Play className="size-3.5" /> Ejecutar
                    </Button>
                  </div>
                ) : null}

                {/* --- Cambios --- */}
                {panel === "cambios" && (
                  <DiffView
                    changes={changes}
                    onOpenFile={(p) => {
                      setSelPath(p);
                      setOpenDirs((d) => new Set([...d, ...ancestorDirs(p)]));
                      setPanel("editor");
                    }}
                  />
                )}

                {/* --- Revisión --- */}
                {panel === "revision" && (
                  <ReviewPanel report={report} onGoTo={goToDiagnostic} onRecheck={runReview} />
                )}

                {/* --- Consola --- */}
                {panel === "consola" && (
                  <div className="flex min-h-0 flex-1 flex-col bg-[#14101f] text-[11px]">
                    <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-1.5">
                      <Terminal className="size-3 text-violet-300" />
                      <span className="text-violet-200/80">Consola del proyecto</span>
                      <span className="text-white/30">{logs.length}</span>
                      <button
                        onClick={() => setLogs([])}
                        className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-white/50 hover:bg-white/10 hover:text-white"
                      >
                        <Eraser className="size-3" /> Limpiar
                      </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto p-2 font-mono leading-relaxed">
                      {logs.length === 0 ? (
                        <p className="text-white/30">
                          {runHtml === null
                            ? "Ejecuta el proyecto para ver aquí sus console.log y sus errores."
                            : "Sin mensajes todavía."}
                        </p>
                      ) : (
                        logs.map((l) => (
                          <div
                            key={l.id}
                            className={cn(
                              "flex gap-2 border-b border-white/5 py-0.5",
                              l.level === "error" && "text-red-300",
                              l.level === "warn" && "text-amber-300",
                              (l.level === "log" || l.level === "info") && "text-emerald-100/90"
                            )}
                          >
                            <span className="shrink-0 text-white/30">{l.time}</span>
                            <span className="min-w-0 whitespace-pre-wrap break-all">{l.text}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* --- Regresión --- */}
                {panel === "regresion" && (
                  <RegressionPanel baseline={baseline} diff={regDiff} />
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
