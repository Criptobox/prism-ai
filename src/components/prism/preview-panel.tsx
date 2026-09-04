"use client";
/** Prism AI — Panel de vista previa en vivo + mapa del proyecto */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Code2,
  Download,
  ExternalLink,
  Eye,
  FileArchive,
  FileText,
  Map as MapIcon,
  Monitor,
  RefreshCw,
  ScanSearch,
  Smartphone,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProjectMapView } from "./project-map-view";
import { cn } from "@/lib/utils";
import { bundlePreview, filesFromAnswer, nombreDescarga } from "@/lib/prism/answer-files";
import { encodeText } from "@/lib/prism/sandbox";
import { writeZip } from "@/lib/prism/zip";
import {
  injectVisualQA,
  onQAAutoResult,
  QA_LABEL,
  QA_WIDTHS,
  reglaDeQA,
  runVisualQA,
  type QAResult,
} from "@/lib/prism/visual-qa";
import { useFailures } from "@/lib/prism/failures";
import { SANDBOX_ORIGIN, injectConsoleBridge } from "@/lib/prism/sandbox";
import {
  registrarError,
  resumenErroresVivos,
  promptDeErroresVivos,
  type ErrorEnVivo,
} from "@/lib/prism/errores-en-vivo";
import type { ProjectMap } from "@/lib/prism/types";

export function PreviewPanel({
  code,
  source,
  title,
  streaming,
  onClose,
  className,
  map,
  onClearMap,
  reglas,
  archivosDelProyecto,
  onAddNote,
  onRemoveNote,
  onAddRegla,
  onRemoveRegla,
  onRestoreSnapshot,
  onFixLive,
}: {
  code: string | null;
  /** respuesta completa de la que salió el HTML: de ahí salen los DEMÁS archivos
   *  (styles.css, app.js…) que la vista previa no pinta pero sí se pueden guardar */
  source?: string | null;
  /** título de la conversación, para nombrar la descarga */
  title?: string | null;
  /** true mientras la IA está escribiendo (refresco con debounce) */
  streaming?: boolean;
  onClose?: () => void;
  className?: string;
  /** mapa del proyecto construido en la conversación */
  map?: ProjectMap | null;
  onClearMap?: () => void;
  /** notas de memoria y historial (edición Obsidian) */
  reglas?: readonly import("@/lib/prism/reglas-no").ReglaNo[];
  archivosDelProyecto?: readonly string[];
  onAddNote?: (text: string) => void;
  onRemoveNote?: (index: number) => void;
  onAddRegla?: (patron: string, motivo: string) => void;
  onRemoveRegla?: (id: string) => void;
  onRestoreSnapshot?: (index: number) => void;
  /** Manda al chat los errores que salieron usando la página, para que el
   *  modelo los corrija. Sin esto el aviso solo informa. */
  onFixLive?: (prompt: string) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [tab, setTab] = useState<"preview" | "code" | "map">("preview");
  const [reloadKey, setReloadKey] = useState(0);
  const [painted, setPainted] = useState(code);

  // Durante streaming se repinta con debounce para no recargar el iframe letra a letra
  useEffect(() => {
    const t = setTimeout(() => setPainted(code), streaming ? 400 : 0);
    return () => clearTimeout(t);
  }, [code, streaming]);

  /** Todo lo que la respuesta creó, no solo lo que se pinta. */
  const archivos = useMemo(() => filesFromAnswer(source), [source]);

  /** Con el CSS y el JS hermanos ya metidos dentro: si no, la página se pinta
   *  a medias porque esos archivos no existen dentro del iframe. */
  const bundle = useMemo(
    () => (painted ? bundlePreview(painted, archivos) : ""),
    [painted, archivos]
  );
  /** Lo que se pinta lleva DENTRO el medidor de QA visual: el sandbox no deja
   *  leer su DOM desde fuera (sin allow-same-origin), pero postMessage sí cruza.
   *  Descargas y «abrir en pestaña» van con el bundle LIMPIO, sin el medidor. */
  /** …y el puente de consola: sin él, un error al pulsar un botón moría dentro
   *  del iframe sin que se enterara nadie. Solo en lo que se PINTA; lo que se
   *  descarga o se abre en pestaña sigue yendo limpio. */
  const paraPintar = useMemo(
    () => (bundle ? injectConsoleBridge(injectVisualQA(bundle)) : ""),
    [bundle]
  );

  /* ------- errores mientras TÚ la usas ------- */
  const [erroresVivos, setErroresVivos] = useState<ErrorEnVivo[]>([]);
  /** lo último que se tocó dentro del iframe, para dar contexto al error */
  const ultimoGesto = useRef<string | undefined>(undefined);

  // se limpian al repintar: los errores de la versión anterior ya no aplican
  useEffect(() => {
    setErroresVivos([]);
    ultimoGesto.current = undefined;
  }, [paraPintar]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { source?: string; level?: string; text?: string; gesto?: string } | null;
      if (!d || d.source !== SANDBOX_ORIGIN) return;
      if (typeof d.gesto === "string") {
        ultimoGesto.current = d.gesto || undefined;
        return;
      }
      if (d.level !== "error" || typeof d.text !== "string") return;
      setErroresVivos((prev) => registrarError(prev, d.text as string, ultimoGesto.current));
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  /* ------- QA visual: la batería móvil medida sobre el DOM real ------- */
  const [qaAbierto, setQaAbierto] = useState(false);
  const [qaCorriendo, setQaCorriendo] = useState(false);
  const [qaResultados, setQaResultados] = useState<QAResult[]>([]);
  const [qaAuto, setQaAuto] = useState<QAResult | null>(null);

  // el medidor manda una medida al cargar (token 0): se enseña bajo demanda
  useEffect(() => onQAAutoResult(setQaAuto), []);

  const correrQA = async () => {
    setQaAbierto(true);
    setQaCorriendo(true);
    try {
      const resultados = await runVisualQA(iframeRef.current, QA_WIDTHS);
      setQaResultados(resultados);
      registrarQAFallos(resultados);
    } finally {
      setQaCorriendo(false);
    }
  };

  /** los problemas verificados alimentan la memoria de fallos (reglas dedup) */
  const registrarQAFallos = (resultados: QAResult[]) => {
    const store = useFailures.getState();
    for (const r of resultados) {
      if (r.noRespondio || r.ok) continue;
      for (const item of r.items) {
        store.record(
          "vista",
          `Vista previa a ${r.width}px: ${item.detalle.slice(0, 140)}`,
          reglaDeQA(item.tipo),
          item.tipo === "scroll" || item.tipo === "fuera" ? "error" : "warn"
        );
      }
    }
  };

  const qaProblemas = qaResultados.reduce((n, r) => n + (r.noRespondio || r.ok ? 0 : r.items.length), 0);

  // Pintado imperativo en el iframe (evita re-montajes de React)
  useEffect(() => {
    const el = iframeRef.current;
    if (el) el.srcdoc = paraPintar;
  }, [paraPintar, reloadKey]);

  const openExternal = () => {
    const blob = new Blob([bundle], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const guardar = (data: BlobPart, nombre: string, tipo: string) => {
    const url = URL.createObjectURL(new Blob([data], { type: tipo }));
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  // el .html suelto lleva el CSS y el JS dentro; si no, se abriría sin estilos
  const descargarHtml = () =>
    guardar(bundle, nombreDescarga(title, "html"), "text/html");

  const descargarUno = (path: string, text: string) =>
    guardar(text, path.split("/").pop() || "archivo.txt", "text/plain");

  /** El proyecto entero en un ZIP: es lo que hace falta cuando la respuesta
   *  trae index.html + styles.css + app.js y solo se veía el primero. */
  const descargarZip = () => {
    const zip = writeZip(archivos.map((f) => ({ path: f.path, data: encodeText(f.text) })));
    guardar(
      new Uint8Array(zip).buffer as ArrayBuffer,
      nombreDescarga(title, "zip"),
      "application/zip"
    );
  };

  return (
    <div className={cn("panel-in flex h-full min-w-0 flex-col bg-background", className)}>
      {/* Barra de herramientas */}
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border/60 bg-card/60 px-2">
        <Eye className="ml-1 size-3.5 shrink-0 text-prism-cyan" />
        <span className="whitespace-nowrap text-xs font-medium">
          {tab === "map" ? "Mapa del proyecto" : "Vista previa"}
        </span>
        {streaming && tab !== "map" && (
          <span className="ml-1.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-prism-cyan/10 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-prism-cyan">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-prism-cyan opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-prism-cyan" />
            </span>
            en vivo
          </span>
        )}
        <div className="flex-1" />
        <div className="flex shrink-0 rounded-lg border border-border/60 p-0.5">
          <button
            onClick={() => setDevice("desktop")}
            aria-label="Vista escritorio"
            title="Escritorio"
            className={cn(
              "rounded-md p-1 transition",
              device === "desktop" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Monitor className="size-3.5" />
          </button>
          <button
            onClick={() => setDevice("mobile")}
            aria-label="Vista móvil"
            title="Móvil (390px)"
            className={cn(
              "rounded-md p-1 transition",
              device === "mobile" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Smartphone className="size-3.5" />
          </button>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className={cn("relative size-8 shrink-0", qaAbierto && "bg-muted text-foreground")}
          onClick={() => (qaAbierto ? setQaAbierto(false) : void correrQA())}
          title="QA visual: mide la página a 320 y 390 px (desbordes, texto pequeño, contraste)"
          aria-label="QA visual"
        >
          <ScanSearch className="size-3.5" />
          {qaProblemas > 0 && !qaAbierto && (
            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-0.5 text-[8px] font-bold text-white">
              {qaProblemas}
            </span>
          )}
        </Button>
        <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => setReloadKey((k) => k + 1)} title="Recargar" aria-label="Recargar vista previa">
          <RefreshCw className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn("size-8 shrink-0", tab === "code" && "bg-muted text-foreground")}
          onClick={() => setTab((t) => (t === "code" ? "preview" : "code"))}
          title="Ver código"
          aria-label="Alternar código"
        >
          <Code2 className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn("size-8 shrink-0", tab === "map" && "bg-muted text-foreground")}
          onClick={() => setTab((t) => (t === "map" ? "preview" : "map"))}
          title="Mapa del proyecto (memoria que ahorra tokens)"
          aria-label="Mapa del proyecto"
        >
          <MapIcon className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={openExternal} title="Abrir en pestaña nueva" aria-label="Abrir en pestaña nueva">
          <ExternalLink className="size-3.5" />
        </Button>
        {archivos.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                title={`Descargar (${archivos.length} archivos)`}
                aria-label="Descargar lo creado"
              >
                <Download className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="text-[11px]">
                Esta respuesta creó {archivos.length} archivos
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={descargarZip}>
                <FileArchive className="size-3.5" /> Descargar todo (.zip)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {archivos.map((f) => (
                <DropdownMenuItem
                  key={f.path}
                  onClick={() => descargarUno(f.path, f.text)}
                  className="text-xs"
                >
                  <FileText className="size-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{f.path}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={descargarHtml}
            title="Descargar .html"
            aria-label="Descargar HTML"
          >
            <Download className="size-3.5" />
          </Button>
        )}
        {onClose && (
          <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={onClose} title="Cerrar vista previa" aria-label="Cerrar vista previa">
            <X className="size-4" />
          </Button>
        )}
      </div>

      {/* Contenido */}
      {qaAbierto && tab !== "map" && (
        <div className="shrink-0 border-b border-border/60 bg-muted/30 px-3 py-2">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium text-foreground/80">
              {qaCorriendo
                ? "Midiendo la página a 320 y 390 px…"
                : qaProblemas === 0
                  ? qaResultados.length
                    ? "Sin problemas medidos a los anchos móviles."
                    : qaAuto && !qaAuto.ok
                      ? `Medida automática a ${qaAuto.width}px: ${qaAuto.items.length} ${qaAuto.items.length === 1 ? "aviso" : "avisos"}.`
                      : "Pulsa el icono de lupa para medir la página a 320 y 390 px."
                  : `${qaProblemas} ${qaProblemas === 1 ? "problema medido" : "problemas medidos"} en móvil`}
            </p>
            <button
              onClick={() => void correrQA()}
              disabled={qaCorriendo}
              className="shrink-0 rounded-md border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              Repetir
            </button>
          </div>
          <div className="space-y-1.5">
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
            {qaResultados.length === 0 && qaAuto && !qaAuto.ok && (
              <p className="text-[11px] text-foreground/85">
                <span className="mr-1 font-medium text-amber-600 dark:text-amber-400">Medido a {qaAuto.width}px:</span>
                {qaAuto.items.map((it) => it.detalle).join(" ")}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Contenido (vista previa / código / mapa) */}
      {tab === "map" ? (
        <ProjectMapView
          map={map ?? null}
          onClear={onClearMap}
          reglas={reglas}
          archivosDelProyecto={archivosDelProyecto}
          onAddNote={onAddNote}
          onRemoveNote={onRemoveNote}
          onAddRegla={onAddRegla}
          onRemoveRegla={onRemoveRegla}
          onRestoreSnapshot={onRestoreSnapshot}
        />
      ) : tab === "code" ? (
        <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {painted}
        </pre>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto bg-muted/40 p-0 sm:p-3">
          <div
            className={cn(
              "mx-auto bg-white shadow-sm transition-[width] duration-300 sm:rounded-lg sm:border sm:border-border/60",
              device === "mobile" ? "h-full w-[390px] max-w-full" : "h-full w-full"
            )}
          >
            <iframe
              ref={iframeRef}
              title="Vista previa de la página generada"
              sandbox="allow-scripts allow-forms allow-modals allow-popups allow-pointer-lock"
              className="size-full border-0"
            />
          </div>

          {/* Lo que falla mientras TÚ la usas. El barrido automático pulsa a
              ciegas y sin datos; esto recoge tu orden real y tus datos. */}
          {erroresVivos.length > 0 && (
            <div className="pointer-events-none sticky bottom-2 z-10 mt-2 flex justify-center px-2">
              <div className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-destructive/40 bg-background/95 px-3 py-1.5 shadow-lg backdrop-blur">
                <TriangleAlert className="size-3.5 shrink-0 text-destructive" />
                <span
                  className="min-w-0 truncate text-[11.5px]"
                  title={erroresVivos.map((e) => e.texto).join("\n")}
                >
                  {resumenErroresVivos(erroresVivos)}
                </span>
                {onFixLive && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 shrink-0 px-2 text-[11px]"
                    onClick={() => {
                      onFixLive(promptDeErroresVivos(erroresVivos, "index.html"));
                      setErroresVivos([]);
                    }}
                  >
                    Arreglar
                  </Button>
                )}
                <button
                  onClick={() => setErroresVivos([])}
                  aria-label="Descartar los errores"
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
