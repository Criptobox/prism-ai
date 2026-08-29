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
  Smartphone,
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
import { filesFromAnswer, nombreDescarga } from "@/lib/prism/answer-files";
import { encodeText } from "@/lib/prism/sandbox";
import { writeZip } from "@/lib/prism/zip";
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
  onAddNote,
  onRemoveNote,
  onRestoreSnapshot,
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
  onAddNote?: (text: string) => void;
  onRemoveNote?: (index: number) => void;
  onRestoreSnapshot?: (index: number) => void;
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

  // Pintado imperativo en el iframe (evita re-montajes de React)
  useEffect(() => {
    const el = iframeRef.current;
    if (el) el.srcdoc = painted ?? "";
  }, [painted, reloadKey]);

  const openExternal = () => {
    const blob = new Blob([painted ?? ""], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  /** Todo lo que la respuesta creó, no solo lo que se pinta. */
  const archivos = useMemo(() => filesFromAnswer(source), [source]);

  const guardar = (data: BlobPart, nombre: string, tipo: string) => {
    const url = URL.createObjectURL(new Blob([data], { type: tipo }));
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const descargarHtml = () =>
    guardar(painted ?? "", nombreDescarga(title, "html"), "text/html");

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
      {tab === "map" ? (
        <ProjectMapView
          map={map ?? null}
          onClear={onClearMap}
          onAddNote={onAddNote}
          onRemoveNote={onRemoveNote}
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
        </div>
      )}
    </div>
  );
}
