"use client";
/** Prism AI — Barra lateral de conversaciones */
import { useMemo, useState } from "react";
import {
  BookOpen,
  Check,
  Download,
  MessageSquarePlus,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Puzzle,
  Search,
  Settings,
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
import { sortSessions, usePrism } from "@/lib/prism/store";
import { cn } from "@/lib/utils";

export function Sidebar({
  onOpenSettings,
  onOpenLibrary,
  onOpenSkills,
  onClose,
}: {
  onOpenSettings: () => void;
  onOpenLibrary?: () => void;
  onOpenSkills?: () => void;
  onClose?: () => void;
}) {
  const sessions = usePrism((s) => s.sessions);
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
                    "group flex items-center gap-1.5 rounded-lg px-2.5 py-2 transition",
                    activeId === s.id
                      ? "bg-primary/10 text-foreground ring-1 ring-inset ring-primary/25"
                      : "hover:bg-accent/60"
                  )}
                >
                  {s.pinned && <Pin className="size-3 shrink-0 text-prism-cyan" />}
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
                      className="min-w-0 flex-1 truncate text-left text-[13px]"
                      title={s.title}
                    >
                      {s.title}
                    </button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        aria-label="Opciones de conversación"
                        className="rounded p-1 opacity-0 transition hover:bg-muted focus:opacity-100 group-hover:opacity-100"
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
        </div>
        <p className="mt-1.5 px-1 text-[10px] leading-relaxed text-muted-foreground/60">
          Sin cuentas · Datos solo en tu dispositivo
        </p>
      </div>
    </div>
  );
}
