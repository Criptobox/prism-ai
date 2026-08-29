"use client";
/** Prism AI — Barra lateral de conversaciones */
import { useMemo, useState } from "react";
import {
  BookOpen,
  Box,
  Check,
  Download,
  FolderGit2,
  Github,
  GraduationCap,
  MessageSquarePlus,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Puzzle,
  Radar,
  Search,
  Settings,
  Swords,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PrismLogo } from "./logo";
import { InstallButton } from "./pwa";
import { ThemeToggle } from "./theme-toggle";
import { Activity } from "lucide-react";
import { sortSessions, usePrism } from "@/lib/prism/store";
import { tiempoRelativo, tituloVisible, vistaPrevia } from "@/lib/prism/session-list";
import { unseenRadarCount } from "@/lib/prism/free-radar";
import { cn } from "@/lib/utils";

export function Sidebar({
  onOpenSettings,
  onOpenLibrary,
  onOpenSkills,
  onOpenRadar,
  onOpenGithub,
  onOpenArena,
  onOpenGuide,
  onOpenRepos,
  onOpenSandbox,
  onOpenUsage,
  onClose,
}: {
  onOpenSettings: () => void;
  onOpenLibrary?: () => void;
  onOpenSkills?: () => void;
  onOpenRadar?: () => void;
  onOpenGithub?: () => void;
  onOpenArena?: () => void;
  onOpenGuide?: () => void;
  onOpenRepos?: () => void;
  onOpenSandbox?: () => void;
  onOpenUsage?: () => void;
  onClose?: () => void;
}) {
  const sessions = usePrism((s) => s.sessions);
  const radarSeenIds = usePrism((s) => s.radarSeenIds);
  const activeId = usePrism((s) => s.activeSessionId);
  const setActive = usePrism((s) => s.setActiveSession);
  const createSession = usePrism((s) => s.createSession);
  const deleteSession = usePrism((s) => s.deleteSession);
  const renameSession = usePrism((s) => s.renameSession);
  const togglePin = usePrism((s) => s.togglePin);
  const exportData = usePrism((s) => s.exportData);

  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const sorted = useMemo(() => sortSessions(sessions), [sessions]);
  const radarUnseen = useMemo(() => unseenRadarCount(radarSeenIds), [radarSeenIds]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.messages.some((m) => m.content.toLowerCase().includes(q))
    );
  }, [sorted, query]);

  const downloadExport = () => {
    const blob = new Blob([exportData()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prism-ai-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const newChat = () => {
    createSession();
    onClose?.();
  };

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Cabecera */}
      <div className="flex items-center gap-2 px-4 pb-2 pt-4">
        <PrismLogo size={26} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-semibold tracking-tight">
            Prism <span className="prism-gradient-text">AI</span>
          </h1>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" className="size-8 lg:hidden" onClick={onClose}>
            <X className="size-4" />
          </Button>
        )}
      </div>

      {/* Nueva conversación */}
      <div className="px-3 pt-2">
        <Button
          onClick={newChat}
          className="prism-gradient-bg w-full justify-start gap-2 rounded-xl border-0 text-white shadow-md shadow-violet-500/15 hover:opacity-90"
        >
          <MessageSquarePlus className="size-4" />
          Nueva conversación
        </Button>
      </div>

      {/* Buscador */}
      <div className="px-3 pb-1 pt-3">
        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/50 px-2.5">
          <Search className="size-3.5 shrink-0 text-muted-foreground/70" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar conversaciones…"
            className="h-8 w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/60"
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label="Limpiar búsqueda">
              <X className="size-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Lista de sesiones */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {filtered.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-muted-foreground">
            {query ? "Sin resultados" : "Aún no hay conversaciones"}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map((s) => (
              <li key={s.id}>
                <div
                  className={cn(
                    "group flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 transition",
                    activeId === s.id
                      ? "bg-primary/10 text-foreground ring-1 ring-inset ring-primary/25"
                      : "hover:bg-accent/60"
                  )}
                >
                  {s.pinned && <Pin className="mt-1 size-3 shrink-0 text-prism-cyan" />}
                  {editingId === s.id ? (
                    <div className="flex min-w-0 flex-1 items-center gap-1">
                      <Input
                        value={draft}
                        autoFocus
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && draft.trim()) {
                            renameSession(s.id, draft.trim());
                            setEditingId(null);
                          }
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="h-7 text-[13px]"
                      />
                      <button
                        aria-label="Guardar nombre"
                        onClick={() => {
                          if (draft.trim()) renameSession(s.id, draft.trim());
                          setEditingId(null);
                        }}
                      >
                        <Check className="size-4 text-emerald-500" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setActive(s.id);
                        onClose?.();
                      }}
                      className="min-w-0 flex-1 text-left"
                      title={s.title}
                    >
                      <span className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate text-[13px]">
                          {tituloVisible(s)}
                        </span>
                        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
                          {tiempoRelativo(s.updatedAt)}
                        </span>
                      </span>
                      {/* Lo último que se dijo: con varias conversaciones que
                          empiezan igual, el título solo no distingue ninguna. */}
                      {vistaPrevia(s) && (
                        <span className="mt-0.5 block truncate text-[11px] leading-snug text-muted-foreground/70">
                          {vistaPrevia(s)}
                        </span>
                      )}
                    </button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        aria-label="Opciones de conversación"
                        className="touch-actions mt-0.5 rounded p-1 opacity-0 transition hover:bg-muted focus:opacity-100 group-hover:opacity-100"
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem
                        onClick={() => {
                          setDraft(s.title);
                          setEditingId(s.id);
                        }}
                      >
                        <Pencil className="size-3.5" /> Renombrar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => togglePin(s.id)}>
                        {s.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                        {s.pinned ? "Desfijar" : "Fijar arriba"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => deleteSession(s.id)}
                      >
                        <Trash2 className="size-3.5" /> Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Pie: acciones */}
      <div className="safe-bottom border-t border-border/60 px-3 py-2.5">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-8 flex-1 justify-start gap-2 text-xs" onClick={onOpenSettings}>
            <Settings className="size-3.5" /> Ajustes
          </Button>
          <InstallButton compact />
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={downloadExport}
            title="Exportar todos los datos"
          >
            <Download className="size-4" />
          </Button>
        </div>
        <div className="mt-1 flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 flex-1 justify-start gap-2 text-xs"
            onClick={onOpenUsage}
            title="Métricas locales de uso"
          >
            <Activity className="size-3.5" /> Uso
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 flex-1 justify-start gap-2 text-xs"
            onClick={onOpenLibrary}
          >
            <BookOpen className="size-3.5" /> Biblioteca
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 flex-1 justify-start gap-2 text-xs"
            onClick={onOpenSkills}
          >
            <Puzzle className="size-3.5" /> Skills
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 flex-1 justify-start gap-2 text-xs",
              radarUnseen > 0 && "text-emerald-600 dark:text-emerald-400"
            )}
            onClick={onOpenRadar}
            title="Radar de modelos gratis"
          >
            <Radar className="size-3.5" /> Radar
            {radarUnseen > 0 && (
              <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[9px] font-bold text-white">
                {radarUnseen}
              </span>
            )}
          </Button>
        </div>
        <p className="mt-1.5 px-1 text-[10px] leading-relaxed text-muted-foreground/60">
          Sin cuentas · Datos solo en tu dispositivo
        </p>
        {(onOpenGuide || onOpenGithub || onOpenRepos || onOpenArena || onOpenSandbox) && (
          <div className="mt-1 flex flex-wrap items-center gap-1 gap-y-1">
            {onOpenArena && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 flex-1 justify-start gap-1.5 text-xs"
                onClick={onOpenArena}
                title="Arena: compara 2-3 modelos gratis con el mismo prompt"
              >
                <Swords className="size-3.5" /> Arena
              </Button>
            )}
            {onOpenGuide && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 flex-1 justify-start gap-1.5 text-xs"
                onClick={onOpenGuide}
                title="Repetir la guía inicial"
              >
                <GraduationCap className="size-3.5" /> Guía
              </Button>
            )}
            {onOpenRepos && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 flex-1 justify-start gap-1.5 text-xs"
                onClick={onOpenRepos}
                title="Repo Studio: conecta un repo de GitHub (directo sin descargar), edítalo y haz push"
              >
                <FolderGit2 className="size-3.5" /> Repos
              </Button>
            )}
            {onOpenSandbox && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 flex-1 justify-start gap-1.5 text-xs"
                onClick={onOpenSandbox}
                title="Sandbox: carga un ZIP y ejecuta el software (proyectos web), como Spck"
              >
                <Box className="size-3.5" /> Sandbox
              </Button>
            )}
            {onOpenGithub && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 flex-1 justify-start gap-1.5 text-xs"
                onClick={onOpenGithub}
                title="Subir carpeta a GitHub sin límite de 100 archivos"
              >
                <Github className="size-3.5" /> GitHub
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
