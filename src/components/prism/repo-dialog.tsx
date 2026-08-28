"use client";
/** Prism AI — Repo Studio: dos formas de trabajar con un repo de GitHub.
 *  · Directo (recomendado): API de GitHub, sin descargar nada, push en 1 commit.
 *  · Descargado: clona el repo en workspace/repos, edita en disco y sube cambios.
 * Incluye editor de archivos, «Corregir con IA» y puente al Sandbox.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Cloud,
  ExternalLink,
  FileText,
  FolderGit2,
  GitCompare,
  HardDrive,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
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
import { accessCodeHeaders } from "@/lib/prism/chat-client";
import { ReviewGateCard, useReviewGate } from "./review-view";
import { DiffView, type ChangedFile } from "./diff-view";
import { fileDiff, wholeFileDiff } from "@/lib/prism/diff";
import type { ReviewFile } from "@/lib/prism/sandbox-review";
import { isHtmlPath, type SandboxSeed } from "@/lib/prism/sandbox";
import { RepoCloudPanel } from "./repo-cloud-panel";
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

/* ============================ MODO DESCARGADO ============================ */

function LocalRepoPanel({ onOpenInSandbox }: { onOpenInSandbox: (seed: SandboxSeed) => void }) {
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
  /** Contenido de cada archivo la PRIMERA vez que se abrió, para poder enseñar
   * el diff: «Guardar» escribe en disco, así que después ya no hay original. */
  const [baselines, setBaselines] = useState<Record<string, string>>({});
  const [showDiff, setShowDiff] = useState(false);
  const gate = useReviewGate();
  const [loadingAll, setLoadingAll] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [fixing, setFixing] = useState(false);
  const [pushing, setPushing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setToken(ghGetToken());
  }, []);

  const repoUrl = info ? `https://github.com/${info.owner}/${info.repo}` : "";

  const api = async (payload: Record<string, unknown>) => {
    const res = await fetch("/api/repos", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...accessCodeHeaders() },
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
      setBaselines({});
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
      const leido = String(j.content ?? "");
      setSelPath(path);
      setContent(leido);
      setOriginal(leido);
      setBaselines((b) => (path in b ? b : { ...b, [path]: leido }));
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

  /** Igual que en el repo en la nube: contenido de lo editado y, del resto,
   * ruta y tamaño (que es lo que hace falta para las comprobaciones por ruta). */
  const reviewInput = useCallback((): ReviewFile[] => {
    const out: ReviewFile[] = files.map((f) =>
      changes[f.path] !== undefined
        ? { path: f.path, text: changes[f.path], size: changes[f.path].length }
        : { path: f.path, text: null, size: f.size }
    );
    const known = new Set(files.map((f) => f.path));
    for (const [path, text] of Object.entries(changes)) {
      if (!known.has(path)) out.push({ path, text, size: text.length });
    }
    return out;
  }, [changes, files]);

  /** El diff de lo que se va a subir, contra el contenido de partida. */
  const diffs = useMemo<ChangedFile[]>(
    () =>
      Object.entries(changes)
        .map(([path, content]) => {
          const base = baselines[path];
          return base === undefined
            ? { path, before: null, after: content, diff: wholeFileDiff(path, content, "nuevo") }
            : { path, before: base, after: content, diff: fileDiff(path, base, content) };
        })
        .filter((c) => !c.diff.unchanged)
        .sort((a, b) => a.path.localeCompare(b.path)),
    [changes, baselines]
  );

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
    if (!gate.check(reviewInput())) {
      toast.error("La revisión ha encontrado problemas", {
        description: "Míralos abajo, o activa «Subir de todas formas» si son falsas alarmas.",
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
          description: `${info.owner}/${info.repo} actualizado en GitHub. Si está conectado a Vercel, se despliega solo.`,
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

  /** Manda el proyecto ENTERO al Sandbox (una sola llamada), con lo que tengas
   * editado sin guardar por encima de lo que hay en disco. */
  const wholeRepoToSandbox = async () => {
    if (!info || loadingAll) return;
    setLoadingAll(true);
    const id = "repo-to-sandbox";
    toast.loading("Leyendo el proyecto…", { id });
    try {
      const j = await api({ action: "readAll", repoKey: info.repoKey });
      const list = (j.files as { path: string; content: string }[]) ?? [];
      const skipped = Number(j.skipped ?? 0);
      const byPath = new Map(list.map((f) => [f.path, f.content]));
      for (const [path, text] of Object.entries(changes)) byPath.set(path, text);
      const files = [...byPath].map(([path, content]) => ({ path, content }));
      if (!files.length) {
        toast.error("El proyecto no tiene archivos de texto que abrir", { id });
        return;
      }
      onOpenInSandbox({ name: `${info.owner}/${info.repo}`, files });
      toast.success("Proyecto abierto en el Sandbox", {
        id,
        description: `${files.length} archivos${skipped ? ` · ${skipped} binarios o muy grandes omitidos` : ""}. Pulsa «Revisar» para analizarlo entero.`,
      });
    } catch (e) {
      toast.error("No se pudo abrir el proyecto en el Sandbox", {
        id,
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoadingAll(false);
    }
  };

  const tryInSandbox = () => {
    if (!selPath || !isHtmlPath(selPath)) return;
    onOpenInSandbox({
      name: `${info?.repo ?? "repo"} · ${selPath}`,
      files: [{ path: selPath, content }],
    });
    toast.info("Solo este archivo en el Sandbox", {
      description:
        "Para revisar el proyecto entero usa «Todo el repo al Sandbox»: los enlaces locales y el resto de archivos solo se ven así.",
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-[11px]"
                onClick={() => void wholeRepoToSandbox()}
                disabled={loadingAll}
                title="Abre el proyecto entero en el Sandbox para revisarlo"
              >
                {loadingAll ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Box className="size-3" />
                )}
                Todo el repo al Sandbox
              </Button>
              <a
                href={repoUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 underline underline-offset-2"
              >
                {info.owner}/{info.repo} <ExternalLink className="size-3" />
              </a>
            </div>
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
                        onClick={() => loadFile(f.path)}
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
                  {isHtmlPath(selPath) && (
                    <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={tryInSandbox}>
                      <Play className="size-3" /> Probar
                    </Button>
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
            El repo queda en <span className="font-mono text-xs">workspace/repos/</span> de tu
            equipo y la segunda vez se abre al instante. Ideal para repos grandes o si prefieres
            tocar el disco.
          </p>
        </div>
      )}

      {/* Qué cambia exactamente */}
      {info && showDiff && diffs.length > 0 && (
        <div className="flex max-h-[38%] min-h-0 shrink-0 flex-col border-t">
          <DiffView changes={diffs} onOpenFile={(p) => void loadFile(p)} />
        </div>
      )}

      {/* Revisión previa */}
      {info && gate.report && (
        <div className="max-h-[38%] shrink-0 overflow-y-auto border-t px-5 py-3">
          <ReviewGateCard gate={gate} onRecheck={() => gate.refresh(reviewInput())} />
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
          {changeCount > 0 && (
            <Button
              variant={showDiff ? "secondary" : "ghost"}
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setShowDiff((v) => !v)}
              title="Ver línea a línea qué se va a subir"
            >
              <GitCompare className="size-3" /> {showDiff ? "Ocultar cambios" : "Ver cambios"}
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => pushChanges("publish")}
              disabled={pushing || changeCount === 0 || gate.blocked}
              title={
                gate.blocked
                  ? "La revisión ha encontrado problemas: míralos arriba"
                  : "Publica los archivos editados como un repo nuevo de tu cuenta"
              }
            >
              {gate.blocked ? (
                <ShieldCheck className="size-3.5" />
              ) : (
                <UploadCloud className="size-3.5" />
              )}
              {gate.blocked ? "Revisa antes de publicar" : "Publicar como repo nuevo"}
            </Button>
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => pushChanges("push")}
              disabled={pushing || changeCount === 0 || gate.blocked}
              title={
                gate.blocked
                  ? "La revisión ha encontrado problemas: míralos arriba"
                  : "Hace commit de los cambios en el repo original (si es tuyo)"
              }
            >
              {pushing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : gate.blocked ? (
                <ShieldCheck className="size-3.5" />
              ) : (
                <UploadCloud className="size-3.5" />
              )}
              {gate.blocked ? "Revisa antes de subir" : "Subir cambios a GitHub"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================ DIÁLOGO CON PESTAÑAS ============================ */

export function RepoStudioDialog({
  open,
  onOpenChange,
  onOpenInSandbox,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onOpenInSandbox?: (seed: SandboxSeed) => void;
}) {
  const [mode, setMode] = useState<"directo" | "descargado">("directo");
  const noopSandbox = () => {
    toast.error("El Sandbox no está disponible ahora mismo");
  };
  const bridge = onOpenInSandbox ?? noopSandbox;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[88vh] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:h-[680px]">
        <DialogHeader className="border-b px-5 pb-3 pt-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FolderGit2 className="size-4 text-prism-violet" /> Repo Studio
          </DialogTitle>
          <DialogDescription className="text-xs">
            Trabaja con un repo de GitHub sin salir de Prism: edita en vivo y haz push directo.
          </DialogDescription>
          <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            <button
              onClick={() => setMode("directo")}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition",
                mode === "directo" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
              aria-pressed={mode === "directo"}
            >
              <Cloud className="size-3.5" /> Directo · sin descargar
            </button>
            <button
              onClick={() => setMode("descargado")}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition",
                mode === "descargado" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
              aria-pressed={mode === "descargado"}
            >
              <HardDrive className="size-3.5" /> Descargado
            </button>
          </div>
        </DialogHeader>

        {mode === "directo" ? (
          <RepoCloudPanel onOpenInSandbox={bridge} />
        ) : (
          <LocalRepoPanel onOpenInSandbox={bridge} />
        )}
      </DialogContent>
    </Dialog>
  );
}
