"use client";
/** Prism AI — Repo Studio · modo DIRECTO (sin descargar).
 * Conecta con un repo de GitHub por API, edita en vivo y hace push
 * en un único commit. Nada se clona: el repo vive en GitHub.
 * Incluye sincronización automática (poll del HEAD) y puente al Sandbox.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Cloud,
  ExternalLink,
  FilePlus2,
  FileText,
  GitCompare,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  UploadCloud,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  commitBatch,
  fetchHeadSha,
  fetchRepoInfo,
  fetchTree,
  isBinaryPath,
  parseRepoInput,
  fetchRepoZip,
  readCloudFile,
  type CloudFile,
  type CloudRepoInfo,
} from "@/lib/prism/repo-cloud";
import { isHtmlPath } from "@/lib/prism/sandbox";
import { ghGetToken, ghListRepos } from "@/lib/prism/github-upload";
import { GitHubConnect } from "./github-connect";
import { publishAsNewRepo } from "@/lib/prism/repo-push";
import { ReviewGateCard, useReviewGate } from "./review-view";
import { DiffView, type ChangedFile } from "./diff-view";
import { fileDiff, wholeFileDiff } from "@/lib/prism/diff";
import type { ReviewFile } from "@/lib/prism/sandbox-review";
import { cn } from "@/lib/utils";
import type { SandboxSeed } from "@/lib/prism/sandbox";

interface StagedChange {
  content: string;
  orig: string;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KB`;
}

export function RepoCloudPanel({
  onOpenInSandbox,
  seedUrl,
}: {
  onOpenInSandbox: (seed: SandboxSeed) => void;
  /** Si viene de pegar un enlace en el chat, se rellena y se conecta solo. */
  seedUrl?: string | null;
}) {
  const [url, setUrl] = useState(seedUrl ?? "");
  const [token, setToken] = useState("");
  const [myRepos, setMyRepos] = useState<
    { owner: string; repo: string; fullName: string; isPrivate: boolean; defaultBranch: string }[]
  >([]);
  const [connecting, setConnecting] = useState(false);
  const [info, setInfo] = useState<CloudRepoInfo | null>(null);
  const [files, setFiles] = useState<CloudFile[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [filter, setFilter] = useState("");
  const [selPath, setSelPath] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [changes, setChanges] = useState<Record<string, StagedChange>>({});
  const [newPath, setNewPath] = useState("");
  const [showNewFile, setShowNewFile] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [pushing, setPushing] = useState(false);
  const [lastHead, setLastHead] = useState<string | null>(null);
  const [remoteAhead, setRemoteAhead] = useState(false);
  const [autoSync, setAutoSync] = useState(true);
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);
  const gate = useReviewGate();
  const [loadingZip, setLoadingZip] = useState(false);
  const [showDiff, setShowDiff] = useState(false);

  const changesRef = useRef(changes);
  useEffect(() => {
    changesRef.current = changes;
  }, [changes]);

  const refreshTree = useCallback(
    async (t: string, owner: string, repo: string, branch: string, silent = false) => {
      const tree = await fetchTree(t, owner, repo, branch);
      setFiles(tree.files);
      setTruncated(tree.truncated);
      setSyncedAt(new Date());
      if (!silent) toast.success("Árbol actualizado", { description: `${tree.files.length} archivos en ${branch}.` });
    },
    []
  );

  useEffect(() => {
    const t = token.trim() || ghGetToken();
    if (!t) {
      setMyRepos([]);
      return;
    }
    let cancelled = false;
    void ghListRepos(t)
      .then((list) => {
        if (!cancelled) setMyRepos(list);
      })
      .catch(() => {
        if (!cancelled) setMyRepos([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const seeded = useRef(false);
  useEffect(() => {
    if (!seedUrl || seeded.current) return;
    seeded.current = true;
    setUrl(seedUrl);
    void connectWith(seedUrl);
  }, [seedUrl]);

  const connect = () => void connectWith(url);

  const connectWith = async (raw: string) => {
    if (!raw.trim() || connecting) return;
    const parsed = parseRepoInput(raw);
    if (!parsed) {
      toast.error("URL no reconocida", {
        description: "Usa https://github.com/usuario/repo o usuario/repo.",
      });
      return;
    }
    const t = token.trim() || ghGetToken();
    setConnecting(true);
    try {
      const inf = await fetchRepoInfo(t, parsed.owner, parsed.repo);
      const tree = await fetchTree(t, inf.owner, inf.repo, inf.defaultBranch);
      setInfo(inf);
      setFiles(tree.files);
      setTruncated(tree.truncated);
      setChanges({});
      setSelPath(null);
      setContent("");
      setOriginal(null);
      setRemoteAhead(false);
      setSyncedAt(new Date());
      const head = await fetchHeadSha(t, inf.owner, inf.repo, inf.defaultBranch);
      setLastHead(head);
      toast.success(`Conectado a ${inf.owner}/${inf.repo}`, {
        description: inf.canPush
          ? `Rama ${inf.defaultBranch} · ${tree.files.length} archivos · editas y haces push directo, sin descargar.`
          : `Rama ${inf.defaultBranch} · solo lectura (publica como repo nuevo para editarlo).`,
      });
    } catch (e) {
      toast.error("No se pudo conectar", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setConnecting(false);
    }
  };

  // Sincronización automática: poll del HEAD cada 60 s mientras el panel está abierto
  useEffect(() => {
    if (!info || !autoSync) return;
    const t = token.trim() || ghGetToken();
    if (!t) return;
    const id = window.setInterval(async () => {
      const head = await fetchHeadSha(t, info.owner, info.repo, info.defaultBranch);
      if (!head || head === lastHead) return;
      setLastHead(head);
      if (Object.keys(changesRef.current).length === 0) {
        try {
          await refreshTree(t, info.owner, info.repo, info.defaultBranch, true);
          toast.info("El repo se actualizó desde GitHub", {
            description: "Lista de archivos refrescada automáticamente.",
          });
        } catch {
          /* silencioso */
        }
      } else {
        setRemoteAhead(true);
      }
    }, 60000);
    return () => window.clearInterval(id);
  }, [info, autoSync, token, lastHead, refreshTree]);

  const manualRefresh = async () => {
    if (!info) return;
    const t = token.trim() || ghGetToken();
    try {
      await refreshTree(t, info.owner, info.repo, info.defaultBranch, true);
      const head = await fetchHeadSha(t, info.owner, info.repo, info.defaultBranch);
      setLastHead(head);
      setRemoteAhead(false);
      toast.success("Sincronizado con GitHub");
    } catch (e) {
      toast.error("No se pudo actualizar", {
        description: e instanceof Error ? e.message : String(e),
      });
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
    const t = token.trim() || ghGetToken();
    setLoadingFile(true);
    try {
      const f = await readCloudFile(t, info.owner, info.repo, info.defaultBranch, path);
      setSelPath(path);
      setContent(f.content);
      setOriginal(f.content);
    } catch (e) {
      toast.error("No se pudo leer el archivo", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoadingFile(false);
    }
  };

  const stageFile = () => {
    if (!info || !selPath) return;
    setChanges((c) => ({ ...c, [selPath]: { content, orig: original ?? "" } }));
    toast.success("Guardado en la sesión", {
      description: `${selPath} · se incluirá en el próximo commit.`,
    });
  };

  const createFile = () => {
    if (!info || !newPath.trim()) return;
    const path = newPath.trim().replace(/^\/+/, "");
    if (!path) return;
    if (files.some((f) => f.path === path)) {
      toast.error("Ya existe un archivo con esa ruta");
      return;
    }
    setFiles((fs) => [...fs, { path, size: 0, sha: "" }].sort((a, b) => a.path.localeCompare(b.path)));
    setChanges((c) => ({ ...c, [path]: { content: "", orig: "\u0000NUEVO\u0000" } }));
    setSelPath(path);
    setContent("");
    setOriginal("");
    setShowNewFile(false);
    setNewPath("");
    toast.success("Archivo nuevo creado", { description: path });
  };

  /** Lo que ve la revisión de un repo en la nube: el contenido de lo que has
   * tocado, más la ruta y el tamaño de todo lo demás (que no está descargado).
   * Así las comprobaciones por ruta —.env, node_modules, colisiones— valen para
   * el repo entero, y las de contenido para lo que estás a punto de subir. */
  const reviewInput = useCallback((): ReviewFile[] => {
    const edited = new Map<string, string>(
      Object.entries(changes)
        .filter(([, ch]) => ch.content !== ch.orig)
        .map(([path, ch]) => [path, ch.content])
    );
    const out: ReviewFile[] = files.map((f) => {
      const text = edited.get(f.path);
      return text !== undefined
        ? { path: f.path, text, size: text.length }
        : { path: f.path, text: null, size: f.size };
    });
    // archivos nuevos que aún no están en el árbol remoto
    const known = new Set(files.map((f) => f.path));
    for (const [path, text] of edited) {
      if (!known.has(path)) out.push({ path, text, size: text.length });
    }
    return out;
  }, [changes, files]);

  /** El diff de lo que va a viajar en el commit. */
  const diffs = useMemo<ChangedFile[]>(
    () =>
      Object.entries(changes)
        .filter(([, ch]) => ch.content !== ch.orig)
        .map(([path, ch]) =>
          ch.orig === ""
            ? { path, before: null, after: ch.content, diff: wholeFileDiff(path, ch.content, "nuevo") }
            : { path, before: ch.orig, after: ch.content, diff: fileDiff(path, ch.orig, ch.content) }
        )
        .sort((a, b) => a.path.localeCompare(b.path)),
    [changes]
  );

  const pushCommit = async () => {
    if (!info || pushing) return;
    const t = token.trim() || ghGetToken();
    if (!t) {
      toast.error("Conecta GitHub primero", {
        description: "Pulsa «Conectar GitHub» arriba. Luego subes a main de un clic.",
      });
      return;
    }
    const upserts = Object.entries(changes)
      .filter(([, ch]) => ch.content !== ch.orig)
      .map(([path, ch]) => ({ path, content: ch.content }));
    if (!upserts.length) {
      toast.info("No hay cambios reales que subir", {
        description: "Guarda tus ediciones con «Guardar» antes de hacer commit.",
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
    const id = "repo-cloud-push";
    toast.loading(`Haciendo 1 commit con ${upserts.length} archivo${upserts.length > 1 ? "s" : ""}…`, { id });
    try {
      const r = await commitBatch(
        t,
        info.owner,
        info.repo,
        info.defaultBranch,
        upserts,
        [],
        commitMsg.trim() || "Cambios desde Prism AI"
      );
      toast.success("¡Push hecho — 1 solo commit!", {
        id,
        description:
          "Si el repo está conectado a Vercel/Netlify se despliega solo: no tienes que hacer nada más.",
        action: { label: "Ver commit", onClick: () => window.open(r.url, "_blank") },
      });
      setChanges({});
      setCommitMsg("");
      await refreshTree(t, info.owner, info.repo, info.defaultBranch, true);
      const head = await fetchHeadSha(t, info.owner, info.repo, info.defaultBranch);
      setLastHead(head);
      setRemoteAhead(false);
      setSyncedAt(new Date());
    } catch (e) {
      toast.error("No se pudo hacer el push", {
        id,
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setPushing(false);
    }
  };

  const publishNew = async () => {
    if (!info) return;
    const entries = Object.entries(changes).filter(([, ch]) => ch.content !== ch.orig);
    if (!entries.length) {
      toast.info("No hay cambios para publicar");
      return;
    }
    const t = token.trim() || ghGetToken();
    if (!t) {
      toast.error("Conecta GitHub primero");
      return;
    }
    if (!gate.check(reviewInput())) {
      toast.error("La revisión ha encontrado problemas", {
        description: "Míralos abajo antes de publicar el repositorio.",
      });
      return;
    }
    setPushing(true);
    try {
      const r = await publishAsNewRepo(
        t,
        `${info.repo}-editado`.slice(0, 90),
        false,
        entries.map(([path, ch]) => ({ path, content: ch.content })),
        (p) => toast.loading(p.message, { id: "repo-publish" })
      );
      toast.success("Publicado como repo nuevo", {
        id: "repo-publish",
        description: r.url,
        action: { label: "Abrir", onClick: () => window.open(r.url, "_blank") },
      });
    } catch (e) {
      toast.error("No se pudo publicar", {
        id: "repo-publish",
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setPushing(false);
    }
  };

  /** Manda el repositorio ENTERO al Sandbox: una sola petición (el zipball) en
   * vez de un archivo por llamada. Los cambios que tengas sin subir van dentro,
   * para que el Sandbox revise lo que de verdad estás a punto de publicar. */
  const wholeRepoToSandbox = async () => {
    if (!info || loadingZip) return;
    const t = token.trim() || ghGetToken();
    if (!t) {
      toast.error("Conecta GitHub primero");
      return;
    }
    setLoadingZip(true);
    const id = "repo-to-sandbox";
    toast.loading("Descargando el repositorio…", { id });
    try {
      const { files: zipFiles, skipped } = await fetchRepoZip(
        t,
        info.owner,
        info.repo,
        info.defaultBranch
      );
      // lo editado y sin subir pisa a lo que hay en GitHub
      const byPath = new Map(zipFiles.map((f) => [f.path, f.content]));
      for (const [path, ch] of Object.entries(changes)) {
        if (ch.content !== ch.orig) byPath.set(path, ch.content);
      }
      const files = [...byPath].map(([path, content]) => ({ path, content }));
      if (!files.length) {
        toast.error("El repositorio no tiene archivos de texto que abrir", { id });
        return;
      }
      onOpenInSandbox({ name: `${info.owner}/${info.repo}`, files });
      toast.success("Repositorio abierto en el Sandbox", {
        id,
        description: `${files.length} archivos${skipped ? ` · ${skipped} binarios o muy grandes omitidos` : ""}. Pulsa «Revisar» para analizarlo entero.`,
      });
    } catch (e) {
      toast.error("No se pudo abrir el repositorio en el Sandbox", {
        id,
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoadingZip(false);
    }
  };

  const tryInSandbox = () => {
    if (!info || !selPath || !isHtmlPath(selPath)) return;
    onOpenInSandbox({
      name: `${info.repo} · ${selPath}`,
      files: [{ path: selPath, content }],
    });
    toast.info("Solo este archivo en el Sandbox", {
      description:
        "Para revisar el proyecto entero usa «Todo el repo al Sandbox»: los enlaces locales y el resto de archivos solo se ven así.",
    });
  };

  const changeCount = Object.values(changes).filter((c) => c.content !== c.orig).length;
  const q = filter.trim().toLowerCase();
  const filtered = q ? files.filter((f) => f.path.toLowerCase().includes(q)) : files;

  if (!info) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Formulario de conexión */}
        <div className="space-y-3 border-b px-5 py-4">
          <GitHubConnect compact onChange={(a) => setToken(a?.token ?? ghGetToken())} />
          <div className="flex gap-2">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && connect()}
              placeholder="https://github.com/usuario/repo  ·  o  usuario/repo"
              className="h-9 flex-1 text-sm"
              aria-label="URL del repositorio de GitHub"
            />
            <Button onClick={connect} disabled={!url.trim() || connecting} className="h-9 gap-1.5">
              {connecting ? <Loader2 className="size-4 animate-spin" /> : <Cloud className="size-4" />}
              {connecting ? "Abriendo…" : "Abrir repo"}
            </Button>
          </div>
          {myRepos.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Tus repositorios</p>
              <ul className="max-h-40 space-y-0.5 overflow-y-auto">
                {myRepos.map((r) => (
                  <li key={r.fullName}>
                    <button
                      type="button"
                      onClick={() => {
                        setUrl(r.fullName);
                        void connectWith(r.fullName);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent/60"
                    >
                      <span className="min-w-0 flex-1 truncate font-mono">{r.fullName}</span>
                      {r.isPrivate && (
                        <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-600">privado</span>
                      )}
                      <span className="text-[10px] text-muted-foreground">{r.defaultBranch}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <Cloud className="size-10 text-muted-foreground/40" />
          <p className="max-w-md text-sm text-muted-foreground">
            <strong className="text-foreground">Directo, sin descargar nada:</strong> conecta el
            repo, edita los archivos aquí mismo y haz push en 1 solo commit. Si el repo está
            conectado a Vercel, Netlify o GitHub Pages, <strong className="text-foreground">cada push se
            publica solo</strong> — no tienes que hacer nada más.
          </p>
          <p className="max-w-md text-xs text-muted-foreground/70">
            Repos privados: pulsa «Conectar GitHub» una vez. Luego subes a main al terminar.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Barra de estado del repo */}
      <div className="flex flex-wrap items-center gap-2 border-b bg-prism-violet/5 px-5 py-2 text-xs">
        <Zap className="size-3.5 shrink-0 text-prism-violet" />
        <span className="font-medium">
          {info.owner}/{info.repo}
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{info.defaultBranch}</span>
        {info.isPrivate && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-600">privado</span>}
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px]",
            info.canPush ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground"
          )}
        >
          {info.canPush ? "push permitido" : "solo lectura"}
        </span>
        {syncedAt && (
          <span className="text-[10px] text-muted-foreground/70">
            sinc. {syncedAt.toLocaleTimeString()}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-[11px]"
            onClick={() => void wholeRepoToSandbox()}
            disabled={loadingZip}
            title="Descarga el repositorio entero y lo abre en el Sandbox para revisarlo"
          >
            {loadingZip ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Box className="size-3" />
            )}
            Todo el repo al Sandbox
          </Button>
          <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            Auto-sinc.
            <Switch checked={autoSync} onCheckedChange={setAutoSync} aria-label="Sincronización automática" />
          </label>
          <button
            onClick={manualRefresh}
            title="Actualizar desde GitHub"
            aria-label="Actualizar desde GitHub"
            className={cn(
              "rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground",
              remoteAhead && "animate-pulse bg-amber-500/20 text-amber-600"
            )}
          >
            <RefreshCw className="size-3.5" />
          </button>
          <a
            href={info.htmlUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 underline underline-offset-2"
          >
            GitHub <ExternalLink className="size-3" />
          </a>
        </div>
      </div>
      {!(token.trim() || ghGetToken()) && (
        <div className="border-b px-5 py-2">
          <GitHubConnect compact onChange={(a) => setToken(a?.token ?? ghGetToken())} />
        </div>
      )}
      {remoteAhead && (
        <p className="border-b bg-amber-500/10 px-5 py-1.5 text-[11px] text-amber-600">
          Hay cambios nuevos en GitHub. Pulsa ⟳ para traerlos (tus cambios locales no se pierden).
        </p>
      )}

      {/* Contenido: lista + editor */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 sm:grid-cols-[minmax(0,230px)_minmax(0,1fr)]">
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
              <Label htmlFor="new-cloud-file" className="text-[10px] text-muted-foreground">
                Ruta del archivo nuevo
              </Label>
              <div className="flex gap-1.5">
                <Input
                  id="new-cloud-file"
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createFile()}
                  placeholder="carpeta/archivo.js"
                  className="h-7 text-xs"
                />
                <Button size="sm" className="h-7 px-2 text-xs" onClick={createFile} disabled={!newPath.trim()}>
                  Crear
                </Button>
              </div>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5" style={{ maxHeight: "200px" }}>
            {filtered.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">Sin resultados</p>
            ) : (
              <ul className="space-y-0.5">
                {filtered.map((f) => (
                  <li key={f.path}>
                    <button
                      onClick={() => loadFile(f.path)}
                      disabled={isBinaryPath(f.path)}
                      className={cn(
                        "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition",
                        isBinaryPath(f.path) && "opacity-40",
                        selPath === f.path
                          ? "bg-primary/10 font-medium text-foreground ring-1 ring-inset ring-primary/25"
                          : "hover:bg-accent/60"
                      )}
                      title={isBinaryPath(f.path) ? "Binario: no editable" : f.path}
                    >
                      <FileText className="size-3 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate font-mono" title={f.path}>
                        {f.path}
                      </span>
                      {changes[f.path] && changes[f.path].content !== changes[f.path].orig && (
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
            {truncated && (
              <p className="px-2 py-1 text-[10px] text-muted-foreground/60">
                Repo muy grande: lista recortada a 6000 archivos.
              </p>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-col">
          {selPath ? (
            <>
              <div className="flex items-center gap-2 border-b px-3 py-2">
                <span className="min-w-0 flex-1 truncate font-mono text-xs" title={selPath}>
                  {selPath}
                </span>
                {loadingFile && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
                {content !== original && (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                    sin guardar
                  </span>
                )}
                {isHtmlPath(selPath) && (
                  <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={tryInSandbox}>
                    <Play className="size-3" /> Probar en Sandbox
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => original !== null && setContent(original)}
                  disabled={content === original}
                >
                  <RotateCcw className="size-3" /> Revertir
                </Button>
                <Button size="sm" className="h-7 gap-1 text-xs" onClick={stageFile} disabled={content === original}>
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
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
              <FileText className="size-8 text-muted-foreground/40" />
              <p className="max-w-[280px] text-xs text-muted-foreground">
                Elige un archivo de la lista para editarlo en vivo sobre GitHub. «Guardar» lo deja
                listo para el commit; el push agrupa todos tus cambios en 1 solo commit.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Qué cambia exactamente en este commit */}
      {showDiff && changeCount > 0 && (
        <div className="flex max-h-[38%] min-h-0 shrink-0 flex-col border-t">
          <DiffView changes={diffs} onOpenFile={(p) => void loadFile(p)} />
        </div>
      )}

      {/* Revisión previa: solo aparece cuando ya se ha intentado subir algo */}
      {gate.report && (
        <div className="max-h-[38%] shrink-0 overflow-y-auto border-t px-5 py-3">
          <ReviewGateCard gate={gate} onRecheck={() => gate.refresh(reviewInput())} />
        </div>
      )}

      {/* Pie: commit */}
      <div className="space-y-2 border-t px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {changeCount > 0
              ? `${changeCount} archivo${changeCount > 1 ? "s" : ""} listos para el commit`
              : "Sin cambios pendientes"}
          </span>
          {changeCount > 0 && (
            <Button
              variant={showDiff ? "secondary" : "ghost"}
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setShowDiff((v) => !v)}
              title="Ver línea a línea qué va en el commit"
            >
              <GitCompare className="size-3" /> {showDiff ? "Ocultar cambios" : "Ver cambios"}
            </Button>
          )}
          {info.canPush ? (
            <div className="ml-auto flex w-full flex-wrap gap-2 sm:w-auto">
              <Input
                value={commitMsg}
                onChange={(e) => setCommitMsg(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && pushCommit()}
                placeholder="Mensaje del commit"
                className="h-8 min-w-0 flex-1 text-xs sm:w-48"
                aria-label="Mensaje del commit"
              />
              <Button
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={pushCommit}
                disabled={pushing || changeCount === 0 || gate.blocked}
                title={
                  gate.blocked
                    ? "La revisión ha encontrado problemas: míralos arriba"
                    : "Un único commit con todos tus cambios"
                }
              >
                {pushing ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : gate.blocked ? (
                  <ShieldCheck className="size-3.5" />
                ) : (
                  <UploadCloud className="size-3.5" />
                )}
                {gate.blocked ? "Revisa antes de subir" : `Subir a ${info.defaultBranch}`}
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto h-8 gap-1.5 text-xs"
              onClick={publishNew}
              disabled={pushing || changeCount === 0 || gate.blocked}
              title={
                gate.blocked
                  ? "La revisión ha encontrado problemas: míralos arriba"
                  : "El original no es tuyo: publica tus cambios como repo nuevo"
              }
            >
              {gate.blocked ? (
                <ShieldCheck className="size-3.5" />
              ) : (
                <UploadCloud className="size-3.5" />
              )}
              {gate.blocked ? "Revisa antes de publicar" : "Publicar como repo nuevo"}
            </Button>
          )}
        </div>
        <p className="text-[10px] leading-relaxed text-muted-foreground/70">
          Push directo por API — sin git, sin clonar, sin descargar. Con Vercel/Netlify conectados
          al repo, cada push se despliega y publica automáticamente.
        </p>
      </div>
    </div>
  );
}
