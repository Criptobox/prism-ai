"use client";
/** Prism AI — Subir una carpeta entera a GitHub (sin límite de 100 archivos).
 * Token guardado solo en tu dispositivo; subida por lotes con 1 commit por lote. */
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ExternalLink, FolderUp, Github, KeyRound, Loader2, ShieldCheck, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  GH_TOKEN_URL,
  ghGetToken,
  ghSetToken,
  prepareFiles,
  uploadToGithub,
  type GhItem,
  type GhProgress,
} from "@/lib/prism/github-upload";

function fmtBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

export function GitHubDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [token, setToken] = useState("");
  const [repoName, setRepoName] = useState("prism-ai");
  const [isPrivate, setIsPrivate] = useState(true);
  const [items, setItems] = useState<GhItem[]>([]);
  const [ignored, setIgnored] = useState(0);
  const [tooBig, setTooBig] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<GhProgress | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const folderRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setToken(ghGetToken());
      // webkitdirectory no es un prop estándar en React: se asigna por atributo
      folderRef.current?.setAttribute("webkitdirectory", "");
      folderRef.current?.setAttribute("directory", "");
    }
  }, [open]);

  const totalBytes = useMemo(() => items.reduce((n, it) => n + it.file.size, 0), [items]);

  const pickFiles = (list: FileList | null) => {
    if (!list) return;
    const files = Array.from(list);
    const { keep, ignored: ign, tooBig: big } = prepareFiles(files);
    setItems(keep);
    setIgnored(ign);
    setTooBig(big.length);
    toast.success(`${keep.length} archivos listos para subir`, {
      description: ign + big.length > 0 ? `${ign} ignorados (node_modules, .env…) · ${big.length} demasiado grandes` : undefined,
    });
  };

  const upload = async () => {
    const t = token.trim();
    if (!t) {
      toast.error("Pega tu token de GitHub primero", {
        description: "Créalo con el botón «Crear token» (scope repo).",
      });
      return;
    }
    if (!items.length) {
      toast.error("Elige la carpeta del proyecto");
      return;
    }
    const name = repoName.trim() || "prism-ai";
    ghSetToken(t);
    setUploading(true);
    setResultUrl(null);
    setProgress(null);
    try {
      const r = await uploadToGithub(t, {
        repoName: name,
        isPrivate,
        items,
        onProgress: setProgress,
      });
      setResultUrl(r.url);
      toast.success(`Subido a GitHub en ${r.commits} commit(s)`, { description: r.url });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("La subida falló", { description: msg.slice(0, 220) });
    } finally {
      setUploading(false);
    }
  };

  const pct = progress ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[88vh] max-w-xl flex-col gap-0 overflow-hidden p-0 sm:h-[620px]">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Github className="size-4" /> Subir a GitHub
            {items.length > 0 && (
              <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                {items.length} archivos
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Sube la carpeta del proyecto completa — sin el límite de 100 archivos de la web de GitHub
            (se sube por lotes con commits automáticos). El token nunca sale de tu dispositivo.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* Paso 1: token */}
          <section className="space-y-2">
            <Label className="flex items-center gap-1.5 text-xs">
              <KeyRound className="size-3.5 text-prism-violet" /> Paso 1 · Token de acceso personal
            </Label>
            <div className="flex gap-2">
              <Input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="ghp_… (se guarda solo en este dispositivo)"
                className="h-9 font-mono text-xs"
              />
              <a href={GH_TOKEN_URL} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm" className="h-9 shrink-0 gap-1 text-[11px]">
                  <ExternalLink className="size-3" /> Crear token
                </Button>
              </a>
            </div>
            <p className="flex items-center gap-1 text-[10.5px] text-muted-foreground">
              <ShieldCheck className="size-3 text-emerald-500" />
              Necesita el scope «repo». Se guarda en localStorage y viaja solo a api.github.com.
            </p>
          </section>

          {/* Paso 2: repo */}
          <section className="space-y-2">
            <Label className="text-xs">Paso 2 · Repositorio</Label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">github.com/tu-usuario/</span>
              <Input
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                placeholder="prism-ai"
                className="h-9 flex-1 text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isPrivate} onCheckedChange={setIsPrivate} id="gh-private" />
              <Label htmlFor="gh-private" className="text-xs text-muted-foreground">
                Repositorio privado (recomendado)
              </Label>
            </div>
          </section>

          {/* Paso 3: carpeta */}
          <section className="space-y-2">
            <Label className="text-xs">Paso 3 · Carpeta a subir</Label>
            <input
              ref={folderRef}
              type="file"
              multiple
              onChange={(e) => pickFiles(e.target.files)}
              className="hidden"
              aria-hidden
            />
            <button
              onClick={() => folderRef.current?.click()}
              className="flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed border-border/70 bg-muted/30 px-4 py-6 transition hover:border-prism-violet/50 hover:bg-prism-violet/[0.04]"
            >
              <FolderUp className="size-6 text-prism-violet" />
              <span className="text-[13px] font-medium">Elige la carpeta del proyecto</span>
              <span className="text-[10.5px] text-muted-foreground">
                se ignoran node_modules, .next, .env, logs y zip · sin límite de cantidad
              </span>
            </button>

            {items.length > 0 && (
              <div className="rounded-xl border border-border/60 bg-card/50 px-3.5 py-3 text-xs">
                <p className="flex items-center gap-1.5 font-medium">
                  <Check className="size-3.5 text-emerald-500" />
                  {items.length} archivos · {fmtBytes(totalBytes)}
                </p>
                {(ignored > 0 || tooBig > 0) && (
                  <p className="mt-1 text-[10.5px] text-muted-foreground">
                    {ignored} ignorados por seguridad/tamaño{tooBig > 0 ? ` · ${tooBig} demasiado grandes (>95 MB)` : ""}
                  </p>
                )}
              </div>
            )}
          </section>

          {/* Progreso / resultado */}
          {(uploading || progress) && (
            <section className="space-y-1.5">
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-prism-violet to-prism-cyan transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                {uploading && <Loader2 className="size-3 animate-spin" />}
                {progress?.message ?? "Preparando…"} {pct > 0 && `(${pct}%)`}
              </p>
            </section>
          )}

          {resultUrl && (
            <a
              href={resultUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/[0.06] px-3.5 py-3 text-xs font-medium text-emerald-600 dark:text-emerald-400"
            >
              <Check className="size-4" /> ¡Listo! Abrir tu repositorio en GitHub
              <ExternalLink className="size-3.5" />
            </a>
          )}
        </div>

        <div className="border-t px-5 py-3.5">
          <Button
            onClick={() => void upload()}
            disabled={uploading || !items.length}
            className={cn(
              "h-10 w-full gap-2 text-sm",
              !uploading && items.length > 0 && "prism-gradient-bg border-0 text-white hover:opacity-90"
            )}
          >
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
            {uploading ? "Subiendo…" : `Subir ${items.length || ""} archivos a GitHub`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
