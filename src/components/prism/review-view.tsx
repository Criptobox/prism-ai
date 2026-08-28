"use client";
/** Prism AI — Vista y puerta de la revisión de proyecto.
 *
 * Lo mismo que enseña el Sandbox se usa en los tres caminos que suben código a
 * GitHub, para que la revisión no sea un rincón donde mirar sino algo por lo
 * que se pasa siempre antes de publicar.
 *
 * - useReviewGate(): guarda el informe y decide si se puede continuar.
 * - ReviewBanner:    resumen de una línea (listo / N problemas).
 * - ReviewDiagnostics: lista agrupada por familia, con filtro por gravedad.
 * - ReviewGateCard:  banner + lista + interruptor de «subir de todas formas».
 */
import { useCallback, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  reviewProject,
  type Diagnostic,
  type ReviewFile,
  type ReviewLevel,
  type ReviewReport,
} from "@/lib/prism/sandbox-review";
import { cn } from "@/lib/utils";

export const LEVEL_META: Record<
  ReviewLevel,
  { label: string; plural: string; icon: typeof XCircle; className: string; dot: string }
> = {
  error: {
    label: "Error",
    plural: "errores",
    icon: XCircle,
    className: "text-red-600 dark:text-red-400",
    dot: "bg-red-500",
  },
  warn: {
    label: "Aviso",
    plural: "avisos",
    icon: AlertTriangle,
    className: "text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  info: {
    label: "Sugerencia",
    plural: "sugerencias",
    icon: Info,
    className: "text-sky-600 dark:text-sky-400",
    dot: "bg-sky-500",
  },
};

export const FAMILY_LABEL: Record<string, string> = {
  secreto: "Credenciales",
  privado: "Archivos privados",
  ref: "Enlaces rotos",
  sintaxis: "Sintaxis",
  html: "HTML y accesibilidad",
  riesgo: "Riesgos",
  git: "GitHub",
  proyecto: "Proyecto",
  estilo: "Limpieza",
};

/* ------------------------------------------------------------------ */
/* puerta                                                              */
/* ------------------------------------------------------------------ */

export interface ReviewGate {
  report: ReviewReport | null;
  /** true si hay errores y todavía no se han asumido a mano */
  blocked: boolean;
  acknowledged: boolean;
  setAcknowledged: (v: boolean) => void;
  /** revisa y devuelve true si se puede continuar */
  check: (files: ReviewFile[]) => boolean;
  /** vuelve a revisar sin decidir nada (para el botón «Revisar de nuevo») */
  refresh: (files: ReviewFile[]) => ReviewReport;
  reset: () => void;
}

export function useReviewGate(): ReviewGate {
  const [report, setReport] = useState<ReviewReport | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  const refresh = useCallback((files: ReviewFile[]) => {
    const r = reviewProject(files);
    setReport(r);
    if (r.ready) setAcknowledged(false); // sin errores no hay nada que asumir
    return r;
  }, []);

  const check = useCallback(
    (files: ReviewFile[]) => {
      const r = reviewProject(files);
      setReport(r);
      if (r.ready) {
        setAcknowledged(false);
        return true;
      }
      return acknowledged;
    },
    [acknowledged]
  );

  const reset = useCallback(() => {
    setReport(null);
    setAcknowledged(false);
  }, []);

  return {
    report,
    blocked: !!report && !report.ready && !acknowledged,
    acknowledged,
    setAcknowledged,
    check,
    refresh,
    reset,
  };
}

/* ------------------------------------------------------------------ */
/* banner de resumen                                                   */
/* ------------------------------------------------------------------ */

export function ReviewBanner({
  report,
  className,
}: {
  report: ReviewReport;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border p-3",
        report.ready
          ? "border-emerald-500/30 bg-emerald-500/10"
          : "border-red-500/30 bg-red-500/10",
        className
      )}
    >
      {report.ready ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <XCircle className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-400" />
      )}
      <div className="min-w-0 text-xs">
        <p className="font-medium">
          {report.ready
            ? "Listo para subir a GitHub"
            : `${report.counts.error} problema${report.counts.error === 1 ? "" : "s"} que conviene arreglar antes de subir`}
        </p>
        <p className="mt-0.5 text-muted-foreground">
          {report.scanned} de {report.total} archivos analizados · {report.counts.warn}{" "}
          {report.counts.warn === 1 ? "aviso" : "avisos"} · {report.counts.info}{" "}
          {report.counts.info === 1 ? "sugerencia" : "sugerencias"}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* lista de diagnósticos                                               */
/* ------------------------------------------------------------------ */

export function ReviewDiagnostics({
  report,
  onGoTo,
  onRecheck,
}: {
  report: ReviewReport;
  /** si se pasa, cada fila con archivo es pulsable y lleva hasta él */
  onGoTo?: (d: Diagnostic) => void;
  onRecheck?: () => void;
}) {
  const [levels, setLevels] = useState<Set<ReviewLevel>>(new Set(["error", "warn", "info"]));

  const toggleLevel = (l: ReviewLevel) =>
    setLevels((s) => {
      const next = new Set(s);
      if (next.has(l)) next.delete(l);
      else next.add(l);
      return next.size ? next : new Set<ReviewLevel>(["error", "warn", "info"]);
    });

  const shown = report.diagnostics.filter((d) => levels.has(d.level));
  const groups = new Map<string, Diagnostic[]>();
  for (const d of shown) groups.set(d.family, [...(groups.get(d.family) ?? []), d]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {(["error", "warn", "info"] as ReviewLevel[]).map((l) => {
          const meta = LEVEL_META[l];
          return (
            <button
              key={l}
              type="button"
              onClick={() => toggleLevel(l)}
              aria-pressed={levels.has(l)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                levels.has(l) ? "border-border bg-accent/60" : "border-transparent opacity-45"
              )}
            >
              <span className={cn("size-1.5 rounded-full", meta.dot)} />
              {meta.label}
              <span className="tabular-nums opacity-70">{report.counts[l]}</span>
            </button>
          );
        })}
        {onRecheck && (
          <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1.5 text-xs" onClick={onRecheck}>
            <RefreshCw className="size-3" /> Revisar de nuevo
          </Button>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          Nada que mostrar con los filtros activos.
        </p>
      ) : (
        <div className="space-y-4">
          {[...groups.entries()].map(([family, items]) => (
            <section key={family}>
              <h3 className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {FAMILY_LABEL[family] ?? family}
                <span className="ml-1.5 font-normal opacity-60">{items.length}</span>
              </h3>
              <ul className="space-y-1">
                {items.map((d, i) => {
                  const meta = LEVEL_META[d.level];
                  const Icon = meta.icon;
                  const clickable = !!onGoTo && !!d.file;
                  const Row = clickable ? "button" : "div";
                  return (
                    <li key={`${d.file}-${d.line ?? 0}-${i}`}>
                      <Row
                        {...(clickable
                          ? { type: "button" as const, onClick: () => onGoTo?.(d) }
                          : {})}
                        className={cn(
                          "flex w-full items-start gap-2 rounded-md border border-transparent px-2 py-1.5 text-left transition",
                          clickable && "hover:border-border hover:bg-accent/50"
                        )}
                      >
                        <Icon className={cn("mt-0.5 size-3.5 shrink-0", meta.className)} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs leading-snug">{d.message}</span>
                          {d.hint && (
                            <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                              {d.hint}
                            </span>
                          )}
                          {d.file && (
                            <span className="mt-1 block truncate font-mono text-[10px] text-muted-foreground/70">
                              {d.file}
                              {d.line ? `:${d.line}` : ""}
                            </span>
                          )}
                        </span>
                      </Row>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* tarjeta completa para los diálogos de subida                        */
/* ------------------------------------------------------------------ */

export function ReviewGateCard({
  gate,
  onRecheck,
  what = "subir",
}: {
  gate: ReviewGate;
  onRecheck?: () => void;
  /** verbo del botón que esta puerta protege, para el texto de asumir el riesgo */
  what?: string;
}) {
  const { report } = gate;
  if (!report) return null;
  return (
    <section className="space-y-3 rounded-xl border border-border/60 bg-card/50 p-3.5">
      <ReviewBanner report={report} />
      <ReviewDiagnostics report={report} onRecheck={onRecheck} />
      {!report.ready && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/[0.07] p-3">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label
              htmlFor="review-ack"
              className="flex cursor-pointer items-center gap-2 text-xs font-medium"
            >
              <Switch
                id="review-ack"
                checked={gate.acknowledged}
                onCheckedChange={gate.setAcknowledged}
              />
              {what === "subir" ? "Subir de todas formas" : `${what} de todas formas`}
            </Label>
            <p className="text-[11px] leading-snug text-muted-foreground">
              Si alguno de estos hallazgos es una credencial de verdad, publicarla es irreversible:
              los repositorios públicos se rastrean en segundos. Revócala antes de continuar.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
