"use client";
/** Prism AI — Repo Studio: da un repo de GitHub y edítalo.
 * Si ya lo tienes descargado localmente se abre; si no, se clona automáticamente.
 * Incluye editor de archivos, «Corregir con IA» y subida de cambios a GitHub.
 */
import { useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  FileText,
  FolderGit2,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Sparkles,
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
import { streamChat } from "@/lib/prism/chat-client";
import { splitModelKey, DEFAULT_SETTINGS } from "@/lib/prism/types";
import { PROVIDER_MAP } from "@/lib/prism/providers";
import { usePrism } from "@/lib/prism/store";
import { ghGetToken, GH_TOKEN_URL } from "@/lib/prism/github-upload";
import { publishAsNewRepo, pushFilesToRepo } from "@/lib/prism/repo-push";
import { cn } from "@/lib/utils";

interface RepoFileInfo {
  path: string;
  size: number;
}
interface RepoInfo {
  repoKey: string;
  owner: string;
  repo: string;
  status: "exists" | "cloned";
}

/** Quita un único bloque de código markdown por si el modelo envuelve el archivo */
function stripOuterFence(text: string): string {
  const t = text.trim();
  const m = t.match(/^```[a-zA-Z0-9]*\n([\s\S]*?)\n?```$/);
  return m ? m[1] : t;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KB`;
}

export function RepoStudioDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [opening, setOpening] = useState(false);
  const [info, setInfo] = useState<RepoInfo | null>(null);
  const [files, setFiles] = useState<RepoFileInfo[]>([]);
  const [filter, setFilter] = useState("");
  const [selPath, setSelPath] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState<string | null>(null);
  const [changes, setChanges] = useState<Record<string, string>>({});
  const [instruction, setInstruction] = useState("");
  const [fixing, setFixing] = useState(false);
  const [pushing, setPushing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) setToken(ghGetToken());
  }, [open]);

  const repoUrl = info ? `https://github.com/${info.owner}/${info.repo}` : "";

  const api = async (payload: Record<string, unknown>) => {
    const res = await fetch("/api/repos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = (await res.json()) as Record<string, unknown>;
    if (!res.ok) throw new Error(String(j.error ?? `Error ${res.status}`));
    return j;
  };

  const refreshList = async (repoKey: string) => {
    const j = await api({ action: "list", repoKey });
    setFiles((j.files as RepoFileInfo[]) ?? []);
  };

  const openRepo = async () => {
    if (!url.trim() || opening) return;
    setOpening(true);
    try {
      const j = await api({ action: "open", url: url.trim(), token: token.trim() || undefined });
      const r = j as unknown as RepoInfo & { message: string };
      setInfo({ repoKey: r.repoKey, owner: r.owner, repo: r.repo, status: r.status });
      setChanges({});
      closeFile();
      await refreshList(r.repoKey);
      if (r.status === "exists") {
        toast.success("Ya lo tenías descargado", { description: "Abierto para editar." });
      } else {
        toast.success("Repositorio clonado", {
          description: `${r.owner}/${r.repo} está listo para editar.`,
        });
      }
    } catch (e) {
      toast.error("No se pudo abrir el repositorio", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setOpening(false);
    }
  };

  const closeFile = () => {
    setSelPath(null);
    setContent("");
    setOriginal(null);
  };

  const loadFile = async (path: string) => {
    if (!info) return;
    if (original !== null && content !== original) {
      const ok = window.confirm(
        `«${selPath}» tiene cambios sin guardar. ¿Abrir otro archivo y descartarlos?`
      );
      if (!ok) return;
    }
    try {
      const j = await api({ action: "read", repoKey: info.repoKey, path });
      setSelPath(path);
      setContent(String(j.content ?? ""));
      setOriginal(String(j.content ?? ""));
    } catch (e) {
      toast.error("No se pudo leer el archivo", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const saveFile = async () => {
    if (!info || !selPath) return;
    try {
      await api({ action: "write", repoKey: info.repoKey, path: selPath, content });
      setOriginal(content);
      setChanges((c) => ({ ...c, [selPath]: content }));
      toast.success("Guardado en tu disco", {
        description: `${selPath} · se añadió a la lista de cambios para subir a GitHub.`,
      });
    } catch (e) {
      toast.error("No se pudo guardar", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  /** Corrige el archivo abierto con el modelo gratis activo */
  const fixWithAi = async () => {
    if (!selPath || fixing) return;
    const st = usePrism.getState();
    const key = st.settings.defaultModelKey;
    const split = key ? splitModelKey(key) : null;
    if (!split) {
      toast.error("Elige primero un modelo gratis", {
        description: "Selecciónalo arriba, en la barra del chat.",
      });
      return;
    }
    const cfg = st.providers[split.providerId];
    const def = PROVIDER_MAP[split.providerId];
    if (!cfg || (!cfg.apiKey.trim() && split.providerId !== "ollama")) {
      toast.error(`${def?.name ?? split.providerId} necesita tu API key`, {
        description: "Configúrala en Ajustes → Proveedores.",
      });
      return;
    }
    setFixing(true);
    const controller = new AbortController();
    abortRef.current = controller;
    let out = "";
    try {
      await streamChat({
        providerId: split.providerId,
        config: cfg,
        modelId: split.modelId,
        messages: [
          {
            role: "user",
            content: `Archivo: ${selPath}
Instrucción: ${instruction.trim() || "Revisa el archivo y corrige errores de bugs, sintaxis o lógica sin cambiar el comportamiento correcto. Mantén el estilo y el idioma del código original."}

Contenido actual del archivo:
${content}`,
          },
        ],
        settings: {
          ...DEFAULT_SETTINGS,
          systemPrompt:
            "Eres un ingeniero de software experto. Devuelve ÚNICAMENTE el contenido completo y corregido del archivo, sin explicaciones, sin comentarios añadidos sobre el cambio y SIN envolverlo en bloques de código markdown. Conserva el formato y la codificación original.",
        },
        signal: controller.signal,
        onDelta: (t) => {
          out = t;
        },
        onDone: () => {},
      });
      const fixed = stripOuterFence(out);
      if (!fixed.trim()) throw new Error("El modelo devolvió una respuesta vacía");
      setContent(fixed);
      toast.success("Corrección lista", {
        description: "Revisa el resultado y pulsa «Guardar» para aplicarlo.",
      });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        toast.error("No se pudo corregir con IA", {
          description: e instanceof Error ? e.message : String(e),
        });
      }
    } finally {
      setFixing(false);
      abortRef.current = null;
    }
  };

  const pushChanges = async (mode: "push" | "publish") => {
    if (!info) return;
    const entries = Object.entries(changes);
    if (!entries.length) {
      toast.info("No hay cambios guardados todavía", {
        description: "Guarda tus ediciones con «Guardar» antes de subir.",
      });
      return;
    }
    const t = token.trim() || ghGetToken();
    if (!t) {
      toast.error("Falta tu token de GitHub", {
        description: "Pégalo arriba (scope repo) o créalo con el enlace.",
      });
      return;
    }
    setPushing(true);
    try {
      if (mode === "push") {
        const r = await pushFilesToRepo(t, info.owner, info.repo, entries.map(([path, content]) => ({ path, content })), (done, total, path) => {
          if (done < total) toast.loading(`Subiendo ${path} (${done + 1}/${total})…`, { id: "repo-push" });
        });
        toast.success(`¡${r.commits} commit${r.commits > 1 ? "s" : ""} subido${r.commits > 1 ? "s" : ""}!`, {
          id: "repo-push",
          description: `${info.owner}/${info.repo} actualizado en GitHub.`,
          action: { label: "Abrir", onClick: () => window.open(repoUrl, "_blank") },
        });
      } else {
        const name = `${info.repo}-editado`.slice(0, 90);
        const r = await publishAsNewRepo(
          t,
          name,
          false,
          entries.map(([path, content]) => ({ path, content })),
          (p) => toast.loading(p.message, { id: "repo-push" })
        );
        toast.success("Publicado como repo nuevo", {
          id: "repo-push",
          description: r.url,
          action: { label: "Abrir", onClick: () => window.open(r.url, "_blank") },
        });
      }
      setChanges({});
    } catch (e) {
      toast.error("No se pudo subir a GitHub", {
        id: "repo-push",
        description:
          (e instanceof Error ? e.message : String(e)) +
          " Si el repo original no es tuyo, usa «Publicar como repo nuevo».",
      });
    } finally {
      setPushing(false);
    }
  };

  const changeCount = Object.keys(changes).length;
  const filtered = filter.trim()
    ? files.filter((f) => f.path.toLowerCase().includes(filter.trim().toLowerCase()))
    : files;

  // detiene la corrección si se cierra el diálogo
  const handleClose = (v: boolean) => {
    if (!v) abortRef.current?.abort();
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex h-[88vh] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:h-[660px]">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FolderGit2 className="size-4 text-prism-violet" /> Repo Studio
          </DialogTitle>
          <DialogDescription className="text-xs">
            Pega un repo de GitHub: si ya lo descargaste se abre; si no, se clona solo. Edita,
            corrige con IA y sube los cambios.
          </DialogDescription>
        </DialogHeader>

        {/* Apertura */}
        <div className="space-y-2 border-b px-5 py-3">
          <div className="flex gap-2">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && openRepo()}
              placeholder="https://github.com/usuario/repo  ·  o  usuario/repo"
              className="h-9 flex-1 text-sm"
              aria-label="URL del repositorio de GitHub"
            />
            <Button onClick={openRepo} disabled={!url.trim() || opening} className="h-9 gap-1.5">
              {opening ? <Loader2 className="size-4 animate-spin" /> : <FolderGit2 className="size-4" />}
              {opening ? "Abriendo…" : "Abrir o clonar"}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Token de GitHub (opcional · repos privados)"
              type="password"
              className="h-8 min-w-0 flex-1 text-xs"
              aria-label="Token de GitHub"
            />
            <a
              href={GH_TOKEN_URL}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-prism-violet underline underline-offset-2"
            >
              Crear token
            </a>
          </div>
          {info && (
            <div
              className={cn(
                "flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs",
                info.status === "exists"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : "border-prism-violet/40 bg-prism-violet/10 text-prism-violet"
              )}
            >
              <FileText className="size-3.5 shrink-0" />
              <span className="font-medium">
                {info.status === "exists"
                  ? "Ya lo tenías descargado → abierto para editar"
                  : "Clonado correctamente"}
              </span>
              <a
                href={repoUrl}
                target="_blank"
                rel="noreferrer"
                className="ml-auto inline-flex items-center gap-1 underline underline-offset-2"
              >
                {info.owner}/{info.repo} <ExternalLink className="size-3" />
              </a>
            </div>
          )}
        </div>

        {/* Contenido */}
        {info ? (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 sm:grid-cols-[minmax(0,230px)_minmax(0,1fr)]">
            {/* Lista de archivos */}
            <div className="flex min-h-0 flex-col border-b sm:border-b-0 sm:border-r">
              <div className="flex items-center gap-1.5 border-b px-3 py-2">
                <Search className="size-3.5 shrink-0 text-muted-foreground" />
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filtrar archivos…"
                  className="h-7 w-full bg-transparent text-xs outline-none"
                  aria-label="Filtrar archivos del repositorio"
                />
                <button
                  onClick={() => void refreshList(info.repoKey)}
                  title="Actualizar lista"
                  aria-label="Actualizar lista de archivos"
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <RefreshCw className="size-3.5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-1.5" style={{ maxHeight: "160px" }}>
                {filtered.length === 0 ? (
                  <p className="px-2 py-4 text-center text-xs text-muted-foreground">Sin resultados</p>
                ) : (
                  <ul className="space-y-0.5">
                    {filtered.map((f) => (
                      <li key={f.path}>
                        <button
                          onClick={() => void loadFile(f.path)}
                          className={cn(
                            "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition",
                            selPath === f.path
                              ? "bg-primary/10 font-medium text-foreground ring-1 ring-inset ring-primary/25"
                              : "hover:bg-accent/60"
                          )}
                        >
                          <FileText className="size-3 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate font-mono" title={f.path}>
                            {f.path}
                          </span>
                          {changes[f.path] !== undefined && (
                            <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" title="Con cambios guardados" />
                          )}
                          <span className="shrink-0 text-[10px] text-muted-foreground/60">
                            {fmtSize(f.size)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Editor */}
            <div className="flex min-h-0 flex-col">
              {selPath ? (
                <>
                  <div className="flex items-center gap-2 border-b px-3 py-2">
                    <span className="min-w-0 flex-1 truncate font-mono text-xs" title={selPath}>
                      {selPath}
                    </span>
                    {content !== original && (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                        sin guardar
                      </span>
                    )}
                    <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => original !== null && setContent(original)} disabled={content === original}>
                      <RotateCcw className="size-3" /> Revertir
                    </Button>
                    <Button size="sm" className="h-7 gap-1 text-xs" onClick={saveFile}>
                      <Save className="size-3" /> Guardar
                    </Button>
                  </div>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    spellCheck={false}
                    className="min-h-0 flex-1 resize-none bg-muted/20 p-3 font-mono text-[12px] leading-relaxed outline-none"
                    aria-label={`Contenido de ${selPath}`}
                  />
                  <div className="space-y-1.5 border-t px-3 py-2">
                    <Label htmlFor="fix-instruction" className="text-[11px] text-muted-foreground">
                      Corregir con IA (opcional: di qué corregir)
                    </Label>
                    <div className="flex gap-1.5">
                      <Input
                        id="fix-instruction"
                        value={instruction}
                        onChange={(e) => setInstruction(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && fixWithAi()}
                        placeholder="Ej: corrige los errores de TypeScript"
                        className="h-8 flex-1 text-xs"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 border-prism-violet/40 text-xs text-prism-violet hover:bg-prism-violet/10 hover:text-prism-violet"
                        onClick={fixWithAi}
                        disabled={fixing}
                      >
                        {fixing ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                        {fixing ? "Corrigiendo…" : "Corregir"}
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
                  <FileText className="size-8 text-muted-foreground/40" />
                  <p className="max-w-[260px] text-xs text-muted-foreground">
                    Elige un archivo de la lista para verlo, editarlo o corregirlo con IA. Los
                    binarios y archivos muy grandes no se pueden editar.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <FolderGit2 className="size-10 text-muted-foreground/40" />
            <p className="max-w-sm text-sm text-muted-foreground">
              Ejemplos: <span className="font-mono text-xs">facebook/react</span>,{" "}
              <span className="font-mono text-xs">https://github.com/vercel/next.js</span>… El repo
              queda en <span className="font-mono text-xs">workspace/repos/</span> de tu equipo y la
              segunda vez se abre al instante.
            </p>
          </div>
        )}

        {/* Pie: subir cambios */}
        {info && (
          <div className="flex flex-wrap items-center gap-2 border-t px-5 py-3">
            <span className="text-xs text-muted-foreground">
              {changeCount > 0
                ? `${changeCount} archivo${changeCount > 1 ? "s" : ""} con cambios guardados`
                : "Sin cambios pendientes de subir"}
            </span>
            <div className="ml-auto flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => pushChanges("publish")}
                disabled={pushing || changeCount === 0}
                title="Publica los archivos editados como un repo nuevo de tu cuenta"
              >
                <UploadCloud className="size-3.5" /> Publicar como repo nuevo
              </Button>
              <Button
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => pushChanges("push")}
                disabled={pushing || changeCount === 0}
                title="Hace commit de los cambios en el repo original (si es tuyo)"
              >
                {pushing ? <Loader2 className="size-3.5 animate-spin" /> : <UploadCloud className="size-3.5" />}
                Subir cambios a GitHub
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
