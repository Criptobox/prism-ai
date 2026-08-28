"use client";
/** Prism AI — Panel de vista previa en vivo + mapa del proyecto */
import { useEffect, useRef, useState } from "react";
import {
  Code2,
  Download,
  ExternalLink,
  Eye,
  Map as MapIcon,
  Monitor,
  RefreshCw,
  Smartphone,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectMapView } from "./project-map-view";
import { cn } from "@/lib/utils";
import type { ProjectMap } from "@/lib/prism/types";

export function PreviewPanel({
  code,
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

  const download = () => {
    const blob = new Blob([painted ?? ""], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prism-preview-${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  return (
    <div className={cn("flex h-full min-w-0 flex-col bg-background", className)}>
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
        <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={download} title="Descargar .html" aria-label="Descargar HTML">
          <Download className="size-3.5" />
        </Button>
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
