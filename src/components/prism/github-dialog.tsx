"use client";
/** Prism AI — Subir una carpeta entera a GitHub (sin límite de 100 archivos).
 * Token guardado solo en tu dispositivo; subida por lotes con 1 commit por lote. */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ExternalLink,
  FolderUp,
  Github,
  KeyRound,
  Loader2,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
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
  ghGetToken,
  ghSetToken,
  prepareFiles,
  toReviewFiles,
  uploadToGithub,
  type GhItem,
  type GhProgress,
} from "@/lib/prism/github-upload";
import { aArchivosPrism, leerMemoria } from "@/lib/prism/memoria-proyecto";
import { usePrism } from "@/lib/prism/store";
import { GitHubConnect } from "./github-connect";
import { ReviewGateCard, useReviewGate } from "./review-view";
import type { PublishSeed } from "@/lib/prism/sandbox";

function fmtBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

export function GitHubDialog({
  open,
  onOpenChange,
  initial,
  onInitialConsumed,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Proyecto ya en memoria (por ejemplo desde el Sandbox) en vez de una carpeta
   * del disco. Van los bytes, no el texto: así los binarios —imágenes, fuentes,
   * PDF— llegan intactos a GitHub. */
  initial?: PublishSeed | null;
  onInitialConsumed?: () => void;
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
  const [reviewing, setReviewing] = useState(false);
  const gate = useReviewGate();

  const folderRef = useRef<HTMLInputElement>(null);
  const reviewRef = useRef<HTMLElement>(null);

  /** Carga un proyecto que llega ya en memoria (Sandbox) y lo revisa igual que
   * si fuera una carpeta elegida a mano. */
  useEffect(() => {
    if (!open || !initial?.files.length) return;
    const list: GhItem[] = initial.files.map((f) => ({
      path: f.path,
      file: new File([f.data as BlobPart], f.path.split("/").pop() || f.path),
    }));
    // ——— Memoria del proyecto (.prism/) viaja con el repo (Pilar 3.1) ———
    // Si la conversación activa tiene memoria (decisiones, errores, tareas,
    // diseño, reglas), se añade como archivos .prism/*.json al commit: al
    // clonar el repo en otra máquina, el contexto se recupera del propio repo.
    try {
      const st = usePrism.getState();
      const sid = st.activeSessionId;
      if (sid) {
        const prismFiles = aArchivosPrism(leerMemoria(sid));
        for (const [path, content] of Object.entries(prismFiles)) {
          list.push({
            path,
            file: new File([content], path.split("/").pop() || path),
          });
        }
      }
    } catch {
      /* sin memoria no pasa nada: el proyecto se sube igual */
    }
    setItems(list);
    setIgnored(0);
    setTooBig(0);
    setResultUrl(null);
    gate.reset();
    if (initial.name) setRepoName(initial.name.replace(/[^\w.-]+/g, "-").slice(0, 90));
    onInitialConsumed?.();
    void reviewItems(list);
  }, [open, initial]);

  useEffect(() => {
    if (open) {
      setToken(ghGetToken());
      // webkitdirectory no es un prop estándar en React: se asigna por atributo
      folderRef.current?.setAttribute("webkitdirectory", "");
      folderRef.current?.setAttribute("directory", "");
    }
  }, [open]);

  const totalBytes = useMemo(() => items.reduce((n, it) => n + it.file.size, 0), [items]);

  /** Revisa lo que se va a subir. Devuelve el informe para decidir en el acto. */
  const reviewItems = async (list: GhItem[]) => {
    setReviewing(true);
    try {
      const rep = gate.refresh(await toReviewFiles(list));
      if (!rep.ready) verHallazgos();
      return rep;
    } finally {
      setReviewing(false);
    }
  };

  /** Un botón que dice «revisa los problemas» no sirve de nada si los problemas
   * están fuera de pantalla: se baja hasta ellos. */
  const verHallazgos = () => {
    requestAnimationFrame(() =>
      reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  };

  const pickFiles = async (list: FileList | null) => {
    if (!list) return;
    const files = Array.from(list);
    const { keep, ignored: ign, tooBig: big } = prepareFiles(files);
    setItems(keep);
    setIgnored(ign);
    setTooBig(big.length);
    setResultUrl(null);
    gate.reset();
    toast.success(`${keep.length} archivos listos para subir`, {
      description:
        ign + big.length > 0
          ? `${ign} ignorados (node_modules, .env…) · ${big.length} demasiado grandes`
          : undefined,
    });
    if (!keep.length) return;
    const rep = await reviewItems(keep);
    if (!rep.ready) {
      toast.error(
        `La revisión encontró ${rep.counts.error} ${rep.counts.error === 1 ? "problema" : "problemas"}`,
        { description: "Míralos abajo antes de subir nada a GitHub." }
      );
    }
  };

  const upload = async () => {
    const t = token.trim();
    if (!t) {
      toast.error("Conecta GitHub primero", {
        description: "Pulsa «Conectar GitHub» arriba. No hace falta un token.",
      });
      return;
    }
    if (!items.length) {
      toast.error("Elige la carpeta del proyecto");
      return;
    }
    // La revisión es la puerta: sin pasarla no se sube nada.
    if (!gate.check(await toReviewFiles(items))) {
      verHallazgos();
      toast.error("La revisión ha encontrado problemas", {
        description:
          "Corrígelos, o activa «Subir de todas formas» si sabes que son falsas alarmas.",
      });
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
            (se sube por lotes a main). Conecta tu cuenta; no hace falta pegar un token.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* Paso 1: cuenta */}
          <section className="space-y-2">
            <Label className="flex items-center gap-1.5 text-xs">
              <KeyRound className="size-3.5 text-prism-violet" /> Paso 1 · Tu cuenta de GitHub
            </Label>
            <GitHubConnect onChange={(a) => setToken(a?.token ?? ghGetToken())} />
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
              onChange={(e) => void pickFiles(e.target.files)}
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
                se ignoran node_modules, .next, .env, logs y zip (el .env.example sí se sube) ·
                sin límite de cantidad
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

          {/* Paso 4: revisión previa */}
          {(items.length > 0 || reviewing) && (
            <section ref={reviewRef} className="scroll-mt-2 space-y-2">
              <Label className="flex items-center gap-1.5 text-xs">
                <ShieldCheck className="size-3.5 text-prism-cyan" /> Paso 4 · Revisión antes de subir
              </Label>
              {reviewing ? (
                <p className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-card/50 px-3.5 py-3 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> Buscando credenciales, archivos
                  privados y enlaces rotos…
                </p>
              ) : (
                <ReviewGateCard gate={gate} onRecheck={() => void reviewItems(items)} />
              )}
            </section>
          )}

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
            onClick={() => (gate.blocked ? verHallazgos() : void upload())}
            variant={gate.blocked ? "outline" : "default"}
            disabled={uploading || reviewing || !items.length}
            className={cn(
              "h-10 w-full gap-2 text-sm",
              gate.blocked &&
                "border-amber-500/50 bg-amber-500/[0.07] text-amber-600 hover:bg-amber-500/[0.12] dark:text-amber-400",
              !uploading &&
                !gate.blocked &&
                items.length > 0 &&
                "prism-gradient-bg border-0 text-white hover:opacity-90"
            )}
          >
            {uploading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : gate.blocked ? (
              <ShieldCheck className="size-4" />
            ) : (
              <UploadCloud className="size-4" />
            )}
            {uploading
              ? "Subiendo…"
              : gate.blocked
                ? "Ver los problemas antes de subir"
                : items.length
                  ? `Subir ${items.length} ${items.length === 1 ? "archivo" : "archivos"} a GitHub`
                  : "Elige primero la carpeta del proyecto"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
