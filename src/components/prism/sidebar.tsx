"use client";
/** Prism AI — Barra lateral de conversaciones */
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BookOpen,
  Box,
  Check,
  FolderGit2,
  Github,
  GraduationCap,
  HardDriveDownload,
  MessageSquarePlus,
  Monitor,
  Moon,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Puzzle,
  Radar,
  Search,
  Settings,
  Sun,
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
import { useTheme } from "next-themes";
import { PrismLogo } from "./logo";
import { InstallButton } from "./pwa";
import { ThemeToggle } from "./theme-toggle";
import { sortSessions, usePrism } from "@/lib/prism/store";
import { tiempoRelativo, tituloVisible, vistaPrevia } from "@/lib/prism/session-list";
import { unseenRadarCount } from "@/lib/prism/free-radar";
import { APP_VERSION, type VersionStatus } from "@/lib/prism/app-version";
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
                        className="touch-actions mt-0.5 rounded p-1 opacity-100 transition hover:bg-muted md:opacity-0 md:focus:opacity-100 md:group-hover:opacity-100"
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

      {/* Pie: tira de ajustes + 4 atajos densos + Más. Evita la cuadrícula
          3×3 (9 celdas) que se veía rala y con GitHub colgando. */}
      <div className="safe-bottom border-t border-border/60 px-2 py-2">
        <div className="flex items-center gap-0.5 rounded-lg bg-muted/40 p-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 min-w-0 flex-1 justify-start gap-2 px-2 text-xs"
            onClick={onOpenSettings}
          >
            <Settings className="size-3.5 shrink-0" />
            <span className="truncate">Ajustes</span>
          </Button>
          <InstallButton compact />
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={downloadExport}
            title="Exportar todos los datos"
            aria-label="Exportar todos los datos"
          >
            <HardDriveDownload className="size-4" />
          </Button>
        </div>
        {/* Tema en tres opciones, visible sin abrir menús. Por defecto
            «Sistema»: la app sigue al dispositivo. */}
        <ThemeSegmented />
        <div className="mt-1.5 grid grid-cols-3 gap-0.5">
          {onOpenSandbox && (
            <PieBtn
              icon={<Box className="size-4" />}
              onClick={onOpenSandbox}
              title="Sandbox: carga un ZIP y ejecuta el software (proyectos web), como Spck"
            >
              Sandbox
            </PieBtn>
          )}
          {onOpenRepos && (
            <PieBtn
              icon={<FolderGit2 className="size-4" />}
              onClick={onOpenRepos}
              title="Repo Studio: conecta un repo de GitHub (directo sin descargar), edítalo y haz push"
            >
              Repos
            </PieBtn>
          )}
          <PieBtn
            icon={<Radar className="size-4" />}
            onClick={onOpenRadar}
            title="Radar de modelos gratis"
            className={radarUnseen > 0 ? "text-emerald-600 dark:text-emerald-400" : undefined}
            badge={
              radarUnseen > 0 ? (
                <span className="absolute -right-2 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-emerald-500 px-0.5 text-[8px] font-bold text-white">
                  {radarUnseen}
                </span>
              ) : null
            }
          >
            Radar
          </PieBtn>
          {onOpenGithub && (
            <PieBtn
              icon={<Github className="size-4" />}
              onClick={onOpenGithub}
              title="Subir carpeta a GitHub sin límite de 100 archivos"
            >
              GitHub
            </PieBtn>
          )}
          {onOpenUsage && (
            <PieBtn
              icon={<Activity className="size-4" />}
              onClick={onOpenUsage}
              title="Uso: peticiones, latencia y ahorro de contexto por modelo (todo local)"
            >
              Uso
            </PieBtn>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="mt-0.5 h-8 w-full gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              <MoreHorizontal className="size-3.5" /> Más
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-44">
            <DropdownMenuItem onClick={onOpenLibrary}>
              <BookOpen className="size-3.5" /> Biblioteca
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenSkills}>
              <Puzzle className="size-3.5" /> Skills
            </DropdownMenuItem>
            {onOpenArena && (
              <DropdownMenuItem onClick={onOpenArena}>
                <Swords className="size-3.5" /> Arena
              </DropdownMenuItem>
            )}
            {onOpenGuide && (
              <DropdownMenuItem onClick={onOpenGuide}>
                <GraduationCap className="size-3.5" /> Guía
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <p className="mt-1.5 text-center text-[10px] leading-none text-muted-foreground/55">
          Sin cuentas · solo en tu dispositivo
        </p>
      </div>
    </div>
  );
}

/** Claro / Oscuro / Sistema como tira de tres, para verlo de un vistazo. */
function ThemeSegmented() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const current = theme ?? "system";

  const OPTS = [
    { value: "light", label: "Claro", icon: Sun },
    { value: "dark", label: "Oscuro", icon: Moon },
    { value: "system", label: "Sistema", icon: Monitor },
  ] as const;

  return (
    <div
      className="mt-1.5 flex items-center gap-0.5 rounded-lg bg-muted/40 p-0.5"
      role="radiogroup"
      aria-label="Tema de la aplicación"
    >
      {OPTS.map((o) => {
        const active = mounted && current === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(o.value)}
            title={
              o.value === "system"
                ? "Sigue el tema de tu dispositivo"
                : `Siempre en ${o.label.toLowerCase()}`
            }
            className={cn(
              "flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-1.5 py-1.5 text-[11px] font-medium transition",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <o.icon className="size-3.5 shrink-0" />
            <span className="truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function VersionLine() {
  const [info, setInfo] = useState<{
    version: string;
    latest: string | null;
    status: VersionStatus;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/version")
      .then((r) => r.json())
      .then((j: { version?: string; latest?: string | null; status?: VersionStatus }) => {
        if (cancelled || !j?.version) return;
        setInfo({
          version: j.version,
          latest: j.latest ?? null,
          status: j.status ?? "unknown",
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const v = info?.version ?? APP_VERSION;
  const label =
    info?.status === "ok"
      ? "al día"
      : info?.status === "outdated" && info.latest
        ? `hay v${info.latest}`
        : null;
  return (
    <p
      className="mt-1.5 text-center text-[10px] leading-tight text-muted-foreground/55"
      title={
        info?.status === "outdated"
          ? `Esta copia es v${v}. En GitHub está v${info.latest}.`
          : `Prism AI v${v}`
      }
    >
      v{v}
      {label ? ` · ${label}` : ""}
    </p>
  );
}

function PieBtn({
  children,
  icon,
  onClick,
  title,
  className,
  badge,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  onClick?: () => void;
  title?: string;
  className?: string;
  badge?: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      title={title}
      onClick={onClick}
      className={cn(
        "!h-auto min-w-0 w-full flex-col !gap-1 rounded-lg px-1 py-2 text-[11px] font-medium text-muted-foreground hover:text-foreground",
        className
      )}
    >
      <span className="relative inline-flex">
        {icon}
        {badge}
      </span>
      <span className="w-full truncate text-center leading-none">{children}</span>
    </Button>
  );
}
