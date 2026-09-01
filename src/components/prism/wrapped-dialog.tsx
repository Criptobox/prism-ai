"use client";
/** Prism AI — Diálogo Wrapped (U4, PLAN-V7).
 *
 * Muestra el informe semanal calculado por `lib/prism/wrapped.ts` a
 * partir de las métricas locales de `usage.ts`. Ofrece descargar el
 * informe como HTML autocontenido (estilo Prism Link) y reiniciar
 * las métricas (lo que ya hace el panel de uso).
 */
import { useMemo } from "react";
import { CalendarDays, Download, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUsage, fmtMs, fmtChars } from "@/lib/prism/usage";
import { computeWrapped, ahorroPct, wrappedToHtml } from "@/lib/prism/wrapped";
import { APP_VERSION } from "@/lib/prism/app-version";

export function WrappedDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const byModel = useUsage((s) => s.byModel);
  const days = useUsage((s) => s.days);
  const resetUsage = useUsage((s) => s.reset);

  const stats = useMemo(() => computeWrapped(byModel, days), [byModel, days]);
  const ahorro = ahorroPct(stats);
  const exito = Math.round(stats.successRate * 100);

  const desdeTxt = new Date(stats.desde).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
  });
  const hastaTxt = new Date(stats.hasta).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
  });

  const diasOrdenados = Object.entries(stats.byDay).sort((a, b) => a[0].localeCompare(b[0]));
  const maxDia = Math.max(1, ...diasOrdenados.map(([, v]) => v));

  const descargar = () => {
    const html = wrappedToHtml(stats, APP_VERSION);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prism-wrapped-${new Date().toISOString().slice(0, 10)}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Informe descargado", {
      description: "HTML autocontenido: ábrelo con doble clic o compártelo.",
    });
  };

  const reset = () => {
    resetUsage();
    toast.success("Métricas reiniciadas");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden rounded-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-prism-pink" />
            Tu Wrapped de la semana
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            <CalendarDays className="size-3" />
            {desdeTxt} – {hastaTxt} · medido en tu navegador
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[72vh] overflow-y-auto pr-1">
          {!stats.hasActivity ? (
            <div className="rounded-2xl border border-dashed border-border/60 p-10 text-center text-[13px] text-muted-foreground">
              Aún no hay actividad en esta ventana.
              <br />
              Vuelve cuando lleves unos días usando Prism. 🌱
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <StatBig value={String(stats.totalRequests)} label="Peticiones" sub={`${stats.totalOk} OK · ${stats.totalFail} fallos`} />
                <StatBig value={`${exito}%`} label="Tasa de éxito" sub="failover incluido" />
                <StatBig value={`${ahorro}%`} label="Ahorro por compresión" sub={`${fmtChars(stats.totalSaved)} chars`} />
                <StatBig value={fmtMs(stats.avgLatencyMs)} label="Latencia media" sub={`p95 ${fmtMs(stats.p95LatencyMs)}`} />
                <StatBig value={fmtChars(stats.totalCharsOut)} label="Caracteres generados" sub={`sobre ${fmtChars(stats.totalCharsIn)} de entrada`} />
                {stats.topDay && (
                  <StatBig value={stats.topDay.slice(5)} label="Día más activo" sub={`${stats.byDay[stats.topDay]} peticiones`} />
                )}
              </div>

              {diasOrdenados.length > 0 && (
                <div className="mt-5">
                  <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Actividad por día
                  </h3>
                  <div className="flex items-end gap-1.5 rounded-xl border border-border/60 bg-card/40 p-3" style={{ height: 120 }}>
                    {diasOrdenados.map(([k, v]) => (
                      <div key={k} className="flex h-full flex-1 flex-col justify-end gap-1" title={`${k}: ${v} peticiones`}>
                        <div
                          className="w-full rounded-t bg-gradient-to-t from-prism-violet to-prism-cyan"
                          style={{ height: `${Math.max(8, (v / maxDia) * 100)}%` }}
                        />
                        <span className="text-center font-mono text-[9px] text-muted-foreground">
                          {k.slice(8)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {stats.ranking.length > 0 && (
                <div className="mt-5">
                  <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Top {stats.ranking.length} modelos
                  </h3>
                  <div className="overflow-hidden rounded-xl border border-border/60">
                    <table className="w-full text-[12px]">
                      <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left">#</th>
                          <th className="px-3 py-2 text-left">Modelo</th>
                          <th className="px-3 py-2 text-right">Pet.</th>
                          <th className="px-3 py-2 text-right">OK</th>
                          <th className="px-3 py-2 text-right">Media</th>
                          <th className="px-3 py-2 text-right">p95</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.ranking.map((r, i) => (
                          <tr key={r.modelKey} className="border-t border-border/40">
                            <td className="px-3 py-2 text-muted-foreground">{i + 1}.</td>
                            <td className="px-3 py-2 font-mono text-[11px] text-prism-cyan">{r.label}</td>
                            <td className="px-3 py-2 text-right">{r.requests}</td>
                            <td className="px-3 py-2 text-right">{r.ok}</td>
                            <td className="px-3 py-2 text-right">{fmtMs(r.avgMs)}</td>
                            <td className="px-3 py-2 text-right">{fmtMs(r.p95Ms)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={reset}>
            <RotateCcw className="size-3.5" /> Reiniciar métricas
          </Button>
          <Button size="sm" onClick={descargar} disabled={!stats.hasActivity}>
            <Download className="size-3.5" /> Descargar HTML
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatBig({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-3">
      <div className="prism-gradient-text text-[22px] font-bold leading-none">{value}</div>
      <div className="mt-1.5 text-[10.5px] uppercase tracking-wider text-muted-foreground">{label}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground/80">{sub}</div>}
    </div>
  );
}
