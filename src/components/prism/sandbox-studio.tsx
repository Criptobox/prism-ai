"use client";
/** Prism AI — Sandbox: carga un ZIP, edita y EJECUTA el software (estilo Spck).
 * Los proyectos web estáticos (HTML/CSS/JS) corren en un iframe aislado con
 * consola integrada. Tus claves y datos quedan fuera del proyecto ejecutado.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Download,
  Eraser,
  FilePlus2,
  FileText,
  Loader2,
  Play,
  RotateCcw,
  Search,
  Square,
  Terminal,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
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
  buildRunHtml,
  decodeText,
  encodeText,
  extOf,
  isHtmlPath,
  isJunkPath,
  isTextPath,
  pickEntryPath,
  SANDBOX_ORIGIN,
  type SandboxSeed,
} from "@/lib/prism/sandbox";
import { readZip, writeZip } from "@/lib/prism/zip";
import { cn } from "@/lib/utils";

interface Entry {
  path: string;
  data: Uint8Array;
  text: string | null; // null = binario
  orig: string | null; // texto original (para dirty)
}

interface LogLine {
  level: string;
  text: string;
  time: string;
}

const MAX_LOGS = 200;

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KB`;
}

export function SandboxStudio({
  open,
  onOpenChange,
  initial,
  onInitialConsumed,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: SandboxSeed | null;
  onInitialConsumed?: () => void;
}) {
  const [name, setName] = useState("");
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [filter, setFilter] = useState("");
  const [selPath, setSelPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [runHtml, setRunHtml] = useState<string | null>(null);
  const [runKey, setRunKey] = useState(0);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [showNewFile, setShowNewFile] = useState(false);
  const [newPath, setNewPath] = useState("");
  const logSeq = useRef(0);

  /* ------- carga desde semilla (Repo Studio) ------- */
  useEffect(() => {
    if (!open || !initial) return;
    const map: Record<string, Entry> = {};
    for (const f of initial.files) {
      map[f.path] = { path: f.path, data: encodeText(f.content), text: f.content, orig: f.content };
    }
    setEntries(map);
    setName(initial.name);
    setRunHtml(null);
    setLogs([]);
    setSelPath(pickEntryPath(Object.keys(map), null));
    onInitialConsumed?.();
    toast.success("Proyecto cargado en el Sandbox", {
      description: `${initial.files.length} archivo${initial.files.length > 1 ? "s" : ""} listo${initial.files.length > 1 ? "s" : ""} para ejecutar.`,
    });
  }, [open, initial, onInitialConsumed]);

  /* ------- puente de consola desde el iframe ------- */
  useEffect(() => {
    if (!open) return;
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { source?: string; level?: string; text?: string } | null;
      if (!d || d.source !== SANDBOX_ORIGIN || typeof d.text !== "string") return;
      const line: LogLine = {
        level: d.level ?? "log",
        text: d.text,
        time: new Date().toLocaleTimeString(),
      };
      logSeq.current += 1;
      setLogs((ls) => [...ls.slice(-(MAX_LOGS - 1)), line]);
      if (line.level === "error") setConsoleOpen(true);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [open]);

  const reset = useCallback(() => {
    setEntries({});
    setName("");
    setSelPath(null);
    setRunHtml(null);
    setLogs([]);
    setFilter("");
    setConsoleOpen(false);
  }, []);

  const loadZipFile = useCallback(async (file: File) => {
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
      setSelPath(entry);
      if (!entry) {
        toast.info("No hay HTML en el proyecto", {
          description: "Puedes editar los archivos, pero no hay página que ejecutar.",
        });
      }
      toast.success("ZIP cargado", {
        description: `${paths.length} archivos. Pulsa «Ejecutar» para probarlo.`,
      });
    } catch (e) {
      toast.error("No se pudo abrir el ZIP", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  }, [reset]);

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
  const filtered = q ? paths.filter((p) => p.toLowerCase().includes(q)) : paths;
  const errorCount = logs.filter((l) => l.level === "error").length;

  const dirtyCount = useMemo(
    () => Object.values(entries).filter((e) => e.text !== null && e.text !== e.orig).length,
    [entries]
  );

  const sel = selPath ? entries[selPath] : undefined;

  const buildFilesMap = useCallback(
    (excludeDeleted: boolean): Map<string, Uint8Array> => {
      const map = new Map<string, Uint8Array>();
      for (const e of Object.values(entries)) {
        if (e.data.length === 0 && e.text === "") {
          map.set(e.path, new Uint8Array(0));
        } else if (e.text !== null && e.orig !== null && e.text !== e.orig) {
          map.set(e.path, encodeText(e.text));
        } else {
          map.set(e.path, e.data);
        }
      }
      if (excludeDeleted) return map;
      return map;
    },
    [entries]
  );

  const run = useCallback(() => {
    const map = buildFilesMap(true);
    const preferred = selPath && isHtmlPath(selPath) ? selPath : null;
    const entry = pickEntryPath([...map.keys()], preferred);
    if (!entry) {
      toast.error("No hay ningún HTML que ejecutar", {
        description: "El Sandbox corre proyectos web (index.html). Añade uno o crea un archivo.",
      });
      return;
    }
    const built = buildRunHtml(entry, map);
    setRunHtml(built.html);
    setRunKey((k) => k + 1);
    setLogs([]);
    setConsoleOpen(true);
    if (built.missing.length) {
      toast.info("Algunos recursos no estaban", {
        description: `${built.missing.length} archivo(s) referenciados no están en el ZIP: ${built.missing.slice(0, 3).join(", ")}`,
      });
    }
  }, [buildFilesMap, selPath]);

  const stopRun = () => {
    setRunHtml(null);
    setLogs([]);
  };

  const exportZip = () => {
    if (!paths.length) return;
    const files = Object.values(entries).map((e) => ({
      path: e.path,
      data: e.text !== null && e.orig !== null && e.text !== e.orig ? encodeText(e.text) : e.data,
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
    setEntries((es) => ({ ...es, [path]: { path, data: new Uint8Array(0), text: "", orig: "\u0000NUEVO\u0000" } }));
    setSelPath(path);
    setShowNewFile(false);
    setNewPath("");
  };

  const deleteFile = () => {
    if (!selPath) return;
    setEntries((es) => {
      const copy = { ...es };
      delete copy[selPath];
      return copy;
    });
    setSelPath(null);
    toast.success(`«${selPath}» eliminado del proyecto`, {
      description: "Se quitará también del ZIP al exportar.",
    });
  };

  const dragRef = useRef<HTMLDivElement | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[88vh] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:h-[700px]">
        <DialogHeader className="border-b px-5 pb-3 pt-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Box className="size-4 text-prism-cyan" /> Sandbox
            {name && <span className="truncate text-xs font-normal text-muted-foreground">· {name}</span>}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Carga un ZIP y ejecuta el software: proyectos web (HTML/CSS/JS) corren aquí mismo, en
            un marco aislado con consola. Edita, prueba y descarga el ZIP con tus cambios.
          </DialogDescription>
        </DialogHeader>

        {!paths.length ? (
          /* ------- estado vacío: zona de carga ------- */
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-6">
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
              <p className="text-xs text-muted-foreground">
                o elige el archivo desde tu dispositivo
              </p>
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
                  {loading ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
                  {loading ? "Cargando…" : "Cargar ZIP"}
                </span>
              </label>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={loadDemo} disabled={loading}>
                <Play className="size-3.5" /> Probar con una demo
              </Button>
            </div>
            <div className="max-w-md space-y-1 text-center text-[11px] leading-relaxed text-muted-foreground/80">
              <p>
                <strong className="text-foreground">Ejecuta:</strong> webs estáticas HTML + CSS +
                JS (con recursos locales inlineados automáticamente).
              </p>
              <p>
                <strong className="text-foreground">No ejecuta:</strong> Node/Python, installs de
                npm, ni módulos ES con imports entre archivos — avisa si el ZIP no es web.
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
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={stopRun}>
                  <Square className="size-3.5" /> Detener
                </Button>
              )}
              <Button
                variant={consoleOpen ? "secondary" : "outline"}
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => setConsoleOpen((v) => !v)}
                title="Consola del proyecto"
              >
                <Terminal className="size-3.5" /> Consola
                {errorCount > 0 && (
                  <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                    {errorCount}
                  </span>
                )}
              </Button>
              <div className="ml-auto flex gap-2">
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={exportZip}>
                  <Download className="size-3.5" /> ZIP
                  {dirtyCount > 0 && (
                    <span className="rounded-full bg-emerald-500/15 px-1.5 text-[10px] font-semibold text-emerald-600">
                      {dirtyCount}
                    </span>
                  )}
                </Button>
                <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={reset} title="Vaciar y cargar otro ZIP">
                  <Trash2 className="size-3.5" /> Vaciar
                </Button>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 sm:grid-cols-[minmax(0,210px)_minmax(0,1fr)]">
              {/* Lista de archivos */}
              <div className="flex min-h-0 flex-col border-b sm:border-b-0 sm:border-r">
                <div className="flex items-center gap-1.5 border-b px-3 py-2">
                  <Search className="size-3.5 shrink-0 text-muted-foreground" />
                  <input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Filtrar…"
                    className="h-7 w-full bg-transparent text-xs outline-none"
                    aria-label="Filtrar archivos del proyecto"
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
                        placeholder="pagina.html"
                        className="h-7 text-xs"
                      />
                      <Button size="sm" className="h-7 px-2 text-xs" onClick={createFile} disabled={!newPath.trim()}>
                        Crear
                      </Button>
                    </div>
                  </div>
                )}
                <ul className="min-h-0 flex-1 overflow-y-auto p-1.5" style={{ maxHeight: "180px" }}>
                  {filtered.length === 0 ? (
                    <li className="px-2 py-4 text-center text-xs text-muted-foreground">Sin resultados</li>
                  ) : (
                    filtered.map((p) => {
                      const e = entries[p];
                      const dirty = e.text !== null && e.text !== e.orig;
                      return (
                        <li key={p}>
                          <button
                            onClick={() => setSelPath(p)}
                            className={cn(
                              "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition",
                              selPath === p
                                ? "bg-primary/10 font-medium text-foreground ring-1 ring-inset ring-primary/25"
                                : "hover:bg-accent/60"
                            )}
                            title={p}
                          >
                            <FileText className="size-3 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate font-mono">{p}</span>
                            {dirty && <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" title="Editado" />}
                            <span className="shrink-0 text-[10px] text-muted-foreground/60">
                              {fmtSize(e.data.length)}
                            </span>
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>

              {/* Editor + vista + consola */}
              <div className="flex min-h-0 flex-col">
                {sel ? (
                  <>
                    <div className="flex items-center gap-2 border-b px-3 py-2">
                      <span className="min-w-0 flex-1 truncate font-mono text-xs" title={sel.path}>
                        {sel.path}
                      </span>
                      {sel.text !== null && sel.text !== sel.orig && (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                          sin guardar
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        onClick={() =>
                          setEntries((es) => ({ ...es, [sel.path]: { ...es[sel.path], text: es[sel.path].orig } }))
                        }
                        disabled={sel.text === sel.orig}
                      >
                        <RotateCcw className="size-3" /> Revertir
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-red-500 hover:text-red-600" onClick={deleteFile}>
                        <Trash2 className="size-3" /> Quitar
                      </Button>
                    </div>
                    {sel.text !== null ? (
                      <textarea
                        value={sel.text}
                        onChange={(e) =>
                          setEntries((es) => ({ ...es, [sel.path!]: { ...es[sel.path!], text: e.target.value } }))
                        }
                        onKeyDown={(e) => {
                          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                            e.preventDefault();
                            run();
                          }
                        }}
                        spellCheck={false}
                        className="min-h-0 flex-1 resize-none bg-muted/20 p-3 font-mono text-[12px] leading-relaxed outline-none"
                        aria-label={`Contenido de ${sel.path}`}
                        placeholder="Escribe el contenido del archivo… (Ctrl+Enter ejecuta)"
                      />
                    ) : ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp", "ico"].includes(extOf(sel.path)) ? (
                      <div className="flex flex-1 items-center justify-center overflow-auto bg-muted/20 p-4">
                        <img
                          src={(() => {
                            let bin = "";
                            const chunk = 0x8000;
                            for (let i = 0; i < sel.data.length; i += chunk)
                              bin += String.fromCharCode(...sel.data.subarray(i, i + chunk));
                            return `data:image/${extOf(sel.path) === "svg" ? "svg+xml" : extOf(sel.path)};base64,${btoa(bin)}`;
                          })()}
                          alt={sel.path}
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>
                    ) : (
                      <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-muted/20 p-6 text-center">
                        <FileText className="size-8 text-muted-foreground/40" />
                        <p className="text-xs text-muted-foreground">
                          Archivo binario ({fmtSize(sel.data.length)}) — se conserva tal cual en el
                          ZIP exportado.
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
                    <FileText className="size-8 text-muted-foreground/40" />
                    <p className="max-w-[260px] text-xs text-muted-foreground">
                      Elige un archivo para editarlo y pulsa «Ejecutar» para probar el proyecto.
                    </p>
                  </div>
                )}

                {/* Vista previa ejecutada */}
                {runHtml !== null && (
                  <div className="flex h-[38%] min-h-[180px] flex-col border-t">
                    <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5 text-[10px] text-muted-foreground">
                      <span className="inline-flex size-1.5 rounded-full bg-emerald-500" />
                      Vista previa aislada · sin acceso a tus claves
                    </div>
                    <iframe
                      key={runKey}
                      title="Vista previa del Sandbox"
                      sandbox="allow-scripts allow-modals allow-forms allow-popups allow-pointer-lock"
                      srcDoc={runHtml}
                      className="min-h-0 flex-1 bg-white"
                    />
                  </div>
                )}

                {/* Consola */}
                {consoleOpen && (
                  <div className="flex h-[26%] min-h-[120px] flex-col border-t bg-[#14101f] text-[11px]">
                    <div className="flex items-center gap-2 border-b border-white/10 px-3 py-1.5">
                      <Terminal className="size-3 text-violet-300" />
                      <span className="text-violet-200/80">Consola</span>
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
                        <p className="text-white/30">Sin mensajes todavía. Los console.log del proyecto aparecen aquí.</p>
                      ) : (
                        logs.map((l, i) => (
                          <div
                            key={`${l.time}-${i}`}
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
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
