"use client";
/** Prism AI — Vista del mapa del proyecto (memoria compacta), edición Obsidian:
 * pestañas Lista | Grafo, backlinks y huérfanos por archivo, notas de memoria
 * e historial de versiones con restauración. Grafo en project-graph.tsx.
 */
import { useEffect, useState } from "react";
import {
  FileCode2,
  FolderTree,
  History,
  ListChecks,
  Network,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { fileRelations } from "@/lib/prism/project-map";
import type { ProjectMap } from "@/lib/prism/types";
import { cn } from "@/lib/utils";
import { ProjectGraph } from "./project-graph";
import { ProjectPassportCard } from "./project-passport";

const VIEW_KEY = "prism-map-view-v1";

function fmtRel(at: number): string {
  const s = Math.max(1, Math.round((Date.now() - at) / 1000));
  if (s < 60) return "hace un momento";
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  return new Date(at).toLocaleDateString("es", { day: "numeric", month: "short" });
}

function kindIcon(_kind: string) {
  return <FileCode2 className="size-3.5 shrink-0 text-prism-cyan" />;
}

export function ProjectMapView({
  map,
  onClear,
  onAddNote,
  onRemoveNote,
  onRestoreSnapshot,
}: {
  map: ProjectMap | null;
  onClear?: () => void;
  onAddNote?: (text: string) => void;
  onRemoveNote?: (index: number) => void;
  onRestoreSnapshot?: (index: number) => void;
}) {
  const [view, setView] = useState<"list" | "graph">("graph");
  const [noteDraft, setNoteDraft] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === "list" || saved === "graph") setView(saved);
    } catch {
      /* ignorar */
    }
  }, []);

  const switchView = (v: "list" | "graph") => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignorar */
    }
  };

  if (!map || (!map.files.length && !map.features.length)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <Network className="size-8 text-muted-foreground/40" />
        <p className="text-sm font-medium">Aún no hay mapa del proyecto</p>
        <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
          Cuando la IA cree una página o proyecto, aquí aparecerá su estructura:
          archivos, funcionalidades y decisiones. Ese mapa se inyecta en el contexto
          para que la IA revise el proyecto gastando muchos menos tokens.
        </p>
      </div>
    );
  }

  const submitNote = () => {
    const t = noteDraft.trim();
    if (!t || !onAddNote) return;
    onAddNote(t);
    setNoteDraft("");
  };

  const notes = map.notes ?? [];
  const history = map.history ?? [];

  return (
    <div className="flex h-full flex-col">
      {/* cabecera */}
      <div className="flex items-start gap-3 border-b border-border/60 p-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl prism-gradient-bg text-white">
          <FolderTree className="size-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{map.name}</p>
          {map.description && (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{map.description}</p>
          )}
        </div>
        {/* toggle Lista | Grafo */}
        <div className="flex shrink-0 rounded-lg border border-border/60 p-0.5">
          <button
            onClick={() => switchView("list")}
            className={cn(
              "rounded-md px-2 py-1 text-[10.5px] font-medium transition",
              view === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
            title="Vista lista"
            aria-label="Vista lista"
          >
            Lista
          </button>
          <button
            onClick={() => switchView("graph")}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-medium transition",
              view === "graph" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
            title="Grafo de relaciones (como Obsidian)"
            aria-label="Vista grafo"
          >
            <Network className="size-3" /> Grafo
          </button>
        </div>
        {onClear && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={onClear}
            title="Borrar mapa de esta conversación"
            aria-label="Borrar mapa"
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>

      {/* Ficha del proyecto (Project Passport): pila, entrada, núcleo y huérfanos */}
      <div className="shrink-0 pt-3">
        <ProjectPassportCard map={map} />
      </div>

      {view === "graph" ? (
        <div className="min-h-0 flex-1">
          <ProjectGraph map={map} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="mx-auto max-w-md space-y-3">
            {/* Archivos con backlinks */}
            {map.files.length > 0 && (
              <div className="rounded-xl border border-border/60 bg-card/40 p-3">
                <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Archivos del proyecto ({map.files.length})
                </p>
                <ul className="space-y-1.5">
                  {map.files.map((f) => {
                    const rel = fileRelations(map, f.name);
                    const orphan =
                      !(rel.outgoing.length + rel.incoming.length) && !(f.features?.length || f.tech?.length);
                    return (
                      <li key={f.name} className="rounded-lg bg-muted/40 px-2.5 py-2">
                        <div className="flex items-start gap-2">
                          {kindIcon(f.kind)}
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-mono text-[11.5px] font-medium">{f.name}</p>
                            {f.summary && (
                              <p className="truncate text-[11px] text-muted-foreground">{f.summary}</p>
                            )}
                          </div>
                          {orphan && (
                            <span
                              className="shrink-0 rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400"
                              title="Sin conexiones con otros archivos"
                            >
                              huérfano
                            </span>
                          )}
                          <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 font-mono text-[9.5px] uppercase text-muted-foreground">
                            {f.kind}
                          </span>
                        </div>
                        {(rel.outgoing.length > 0 || rel.incoming.length > 0) && (
                          <div className="mt-1.5 space-y-0.5 pl-6 font-mono text-[10px] leading-relaxed text-muted-foreground">
                            {rel.outgoing.length > 0 && (
                              <p className="truncate">
                                <span className="text-prism-cyan">→</span> {rel.outgoing.join(", ")}
                              </p>
                            )}
                            {rel.incoming.length > 0 && (
                              <p className="truncate">
                                <span className="text-emerald-500">←</span> {rel.incoming.join(", ")}
                              </p>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Funcionalidades */}
            {map.features.length > 0 && (
              <div className="rounded-xl border border-border/60 bg-card/40 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <ListChecks className="size-3.5" /> Funcionalidades
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {map.features.map((f) => (
                    <span
                      key={f}
                      className="rounded-full border border-emerald-500/25 bg-emerald-500/[0.08] px-2 py-0.5 text-[11px] text-emerald-700 dark:text-emerald-400"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Notas de memoria (estilo Obsidian) */}
            <div className="rounded-xl border border-border/60 bg-card/40 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Network className="size-3.5" /> Notas de memoria
              </p>
              {notes.length > 0 ? (
                <ul className="mb-2 space-y-1">
                  {notes.map((n, i) => (
                    <li
                      key={`${i}-${n.slice(0, 12)}`}
                      className="flex items-start gap-2 rounded-lg bg-pink-500/[0.07] px-2.5 py-1.5"
                    >
                      <p className="min-w-0 flex-1 break-words text-[11px] leading-relaxed">{n}</p>
                      {onRemoveNote && (
                        <button
                          onClick={() => onRemoveNote(i)}
                          className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive"
                          title="Quitar nota"
                          aria-label={`Quitar nota ${i + 1}`}
                        >
                          <X className="size-3" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
                  Guarda aquí decisiones o reglas del proyecto («el tema principal es azul»,
                  «las sesiones van en localStorage») y la IA las respetará en cada respuesta.
                </p>
              )}
              {onAddNote && (
                <div className="flex gap-1.5">
                  <input
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitNote()}
                    placeholder="Añadir nota de memoria…"
                    maxLength={140}
                    className="h-7 min-w-0 flex-1 rounded-lg border border-border/60 bg-background px-2.5 text-[11px] outline-none placeholder:text-muted-foreground/60 focus:border-pink-400/60"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 shrink-0 gap-1 px-2 text-[11px]"
                    onClick={submitNote}
                    disabled={!noteDraft.trim()}
                    title="Añadir nota al mapa"
                  >
                    <Plus className="size-3" /> Añadir
                  </Button>
                </div>
              )}
            </div>

            {/* Historial del mapa */}
            {history.length > 0 && (
              <div className="rounded-xl border border-border/60 bg-card/40 p-3">
                <button
                  onClick={() => setShowHistory((s) => !s)}
                  className="flex w-full items-center gap-1.5 text-left text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                >
                  <History className="size-3.5" /> Historial del mapa ({history.length})
                </button>
                {showHistory && (
                  <ul className="mt-2 space-y-1.5">
                    {history.map((s, i) => (
                      <li
                        key={`${s.at}-${i}`}
                        className="flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11px] font-medium">{s.label}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {fmtRel(s.at)} · {s.files.length} archivos
                          </p>
                        </div>
                        {onRestoreSnapshot && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 shrink-0 gap-1 px-1.5 text-[10px]"
                            onClick={() => onRestoreSnapshot(i)}
                            title="Restaurar esta versión del mapa"
                          >
                            <RotateCcw className="size-3" /> Restaurar
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <p className="px-1 text-center text-[10.5px] leading-relaxed text-muted-foreground/70">
              Este mapa viaja como contexto compacto en cada mensaje — la IA revisa el
              proyecto sin releer todo el código y ahorra tokens.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
