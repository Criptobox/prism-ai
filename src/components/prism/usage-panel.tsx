"use client";
/** Prism AI — Panel de uso (analytics local, inspirado en los Insights de OmniRoute/OrcaRouter).
 * Todo se calcula en tu navegador: peticiones, OK/fallos, latencia media y p95,
 * volumen, ahorro de compresión por modelo, actividad de 7 días y registro de
 * peticiones con «Copiar como cURL» (claves siempre redactadas). */
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Activity, RotateCcw, Terminal, Trash2, Zap } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  avgMs,
  fmtChars,
  fmtMs,
  p95Ms,
  useUsage,
  type ModelUsage,
} from "@/lib/prism/usage";
import { splitModelKey } from "@/lib/prism/types";
import { PROVIDER_MAP } from "@/lib/prism/providers";
import {
  buildCurl,
  clearRecentRequests,
  getRecentRequests,
  subscribeRequests,
  type RequestLogEntry,
} from "@/lib/prism/request-log";
import { ModelLogo } from "./model-logo";
import { ABORTED } from "@/lib/prism/chat-client";

/** Etiqueta de una petición fallida. Sin código HTTP no hubo respuesta: o la
 * canceló quien pregunta, o el navegador ni llegó a salir. */
function estadoDe(status: number): string {
  if (status === ABORTED) return "cancelada";
  return status ? `error ${status}` : "sin respuesta";
}

function prettyModel(key: string): { providerId: string; modelId: string; name: string } | null {
  const split = splitModelKey(key);
  if (!split) return null;
  return {
    providerId: split.providerId,
    modelId: split.modelId,
    name: PROVIDER_MAP[split.providerId]?.name ?? split.providerId,
  };
}

/** Suscriptor del anillo de peticiones (memoria de sesión) */
function useRequestLog(): RequestLogEntry[] {
  return useSyncExternalStore(subscribeRequests, getRecentRequests, getRecentRequests);
}

/** Minibarras de los últimos 7 días (divs, sin librerías) */
function WeekSparkline({ days }: { days: Record<string, number> }) {
  const bars = useMemo(() => {
    const out: { label: string; n: number; today: boolean }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000);
      const key = d.toISOString().slice(0, 10);
      out.push({ label: ["D", "L", "M", "X", "J", "V", "S"][d.getDay()], n: days[key] ?? 0, today: i === 0 });
    }
    return out;
  }, [days]);
  const max = Math.max(1, ...bars.map((b) => b.n));
  return (
    <div className="flex h-12 items-end gap-1.5">
      {bars.map((b, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1" title={`${b.n} peticiones`}>
          <div
            className={`w-full rounded-sm ${b.today ? "bg-prism-violet/70" : "bg-muted-foreground/25"}`}
            style={{ height: `${Math.max(3, (b.n / max) * 34)}px` }}
          />
          <span className="text-[9px] text-muted-foreground">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

export function UsagePanel({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const byModel = useUsage((s) => s.byModel);
  const days = useUsage((s) => s.days);
  const reset = useUsage((s) => s.reset);
  const requests = useRequestLog();
  const [curlEntry, setCurlEntry] = useState<RequestLogEntry | null>(null);

  const rows = useMemo(() => {
    return Object.entries(byModel)
      .map(([key, u]: [string, ModelUsage]) => ({ key, u }))
      .sort((a, b) => b.u.requests - a.u.requests || b.u.lastUsed - a.u.lastUsed);
  }, [byModel]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, { u }) => ({
        requests: acc.requests + u.requests,
        ok: acc.ok + u.ok,
        fail: acc.fail + u.fail,
        charsIn: acc.charsIn + u.charsIn,
        charsOut: acc.charsOut + u.charsOut,
        savedChars: acc.savedChars + u.savedChars,
      }),
      { requests: 0, ok: 0, fail: 0, charsIn: 0, charsOut: 0, savedChars: 0 }
    );
  }, [rows]);

  const today = new Date().toISOString().slice(0, 10);
  const last7 = useMemo(() => {
    let n = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      n += days[d] ?? 0;
    }
    return n;
  }, [days]);

  const savedPct = totals.charsIn > 0 ? Math.round((totals.savedChars / totals.charsIn) * 100) : 0;

  const copyCurl = async (entry: RequestLogEntry) => {
    // El visor se abre siempre: así puedes leer la petición antes de pegarla en
    // ningún sitio, tengas o no permiso de portapapeles (que muchos navegadores
    // deniegan sin avisar).
    setCurlEntry(entry);
    try {
      await navigator.clipboard.writeText(buildCurl(entry));
      toast.success("cURL copiado", { description: "Las claves van como TU_API_KEY." });
    } catch {
      /* sin permiso: queda el visor abierto para copiarlo a mano */
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-2xl">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Activity className="size-4 text-prism-cyan" />
              Uso local
            </DialogTitle>
            <DialogDescription className="text-xs">
              Métricas de este dispositivo. Nada sale de tu navegador.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-2 px-5 py-3 sm:grid-cols-4">
            <div className="rounded-xl border bg-card/60 p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Peticiones hoy</p>
              <p className="mt-1 text-xl font-semibold">{days[today] ?? 0}</p>
            </div>
            <div className="rounded-xl border bg-card/60 p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Últimos 7 días</p>
              <p className="mt-1 text-xl font-semibold">{last7}</p>
            </div>
            <div className="rounded-xl border bg-card/60 p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Éxito</p>
              <p className="mt-1 text-xl font-semibold">
                {totals.requests ? `${Math.round((totals.ok / totals.requests) * 100)}%` : "—"}
              </p>
              <p className="text-[10px] text-muted-foreground">{totals.fail} fallos</p>
            </div>
            <div className="rounded-xl border bg-card/60 p-3">
              <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                <Zap className="size-3 text-violet-500" />
                Ahorro contexto
              </p>
              <p className="mt-1 text-xl font-semibold">{savedPct > 0 ? `−${savedPct}%` : "—"}</p>
              <p className="text-[10px] text-muted-foreground">{fmtChars(totals.savedChars)} car.</p>
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1 px-5 pb-2">
            {rows.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Aún no hay peticiones registradas. Envía tu primer mensaje y aparecerá aquí.
              </p>
            ) : (
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-2 font-medium">Modelo</th>
                    <th className="py-2 pr-2 text-right font-medium">Pet.</th>
                    <th className="py-2 pr-2 text-right font-medium">Mediana</th>
                    <th className="py-2 pr-2 text-right font-medium">p95</th>
                    <th className="py-2 pr-2 text-right font-medium">Enviado</th>
                    <th className="py-2 text-right font-medium">Ahorro</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ key, u }) => {
                    const info = prettyModel(key);
                    return (
                      <tr key={key} className="border-b last:border-0">
                        <td className="py-2 pr-2">
                          <span className="flex min-w-0 items-center gap-2">
                            {info && (
                              <ModelLogo modelId={info.modelId} providerId={info.providerId} className="size-4 shrink-0" />
                            )}
                            <span className="min-w-0">
                              <span className="block truncate">{info?.modelId ?? key}</span>
                              <span className="block text-[10px] text-muted-foreground">
                                {info?.name} · {u.fail > 0 ? `${u.ok}✓ ${u.fail}✗` : `${u.ok}✓`}
                              </span>
                            </span>
                          </span>
                        </td>
                        <td className="py-2 pr-2 text-right tabular-nums">{u.requests}</td>
                        <td className="py-2 pr-2 text-right tabular-nums">{fmtMs(avgMs(u))}</td>
                        <td className="py-2 pr-2 text-right tabular-nums">{fmtMs(p95Ms(u))}</td>
                        <td className="py-2 pr-2 text-right tabular-nums">
                          {fmtChars(u.charsIn)}
                          <span className="text-[10px] text-muted-foreground"> → {fmtChars(u.charsOut)}</span>
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {u.savedChars > 0 ? `−${Math.round((u.savedChars / Math.max(1, u.charsIn)) * 100)}%` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {/* ——— Actividad 7 días ——— */}
            {last7 > 0 && (
              <div className="mt-4 rounded-xl border bg-card/40 p-3">
                <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                  Actividad · 7 días
                </p>
                <WeekSparkline days={days} />
              </div>
            )}

            {/* ——— Peticiones recientes (memoria de sesión) ——— */}
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <Terminal className="size-3" />
                  Peticiones recientes · esta sesión
                </p>
                {requests.length > 0 && (
                  <button
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      clearRecentRequests();
                      toast.success("Registro de peticiones vaciado");
                    }}
                  >
                    <Trash2 className="size-3" />
                    Vaciar
                  </button>
                )}
              </div>
              {requests.length === 0 ? (
                <p className="rounded-xl border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                  Sin peticiones en esta sesión. Cada llamada a un proveedor quedará aquí para
                  depurar con «Copiar como cURL».
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {requests.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center gap-2 rounded-xl border bg-card/40 px-3 py-2 text-xs"
                    >
                      <span
                        className={`size-1.5 shrink-0 rounded-full ${
                          r.ok == null ? "bg-amber-400" : r.ok ? "bg-emerald-500" : "bg-red-500"
                        }`}
                        title={r.ok == null ? "en curso" : r.ok ? "OK" : estadoDe(r.status)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{r.modelId}</span>
                        <span className="block text-[10px] text-muted-foreground">
                          {new Date(r.ts).toLocaleTimeString()} ·{" "}
                          {r.ok == null ? "…" : r.ok ? `${r.status} OK` : estadoDe(r.status)}
                          {r.ms ? ` · ${r.ms < 1000 ? `${r.ms} ms` : `${(r.ms / 1000).toFixed(1)} s`}` : ""}
                          {" · "}
                          {r.url.replace(/^https?:\/\//, "").slice(0, 42)}
                        </span>
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 shrink-0 gap-1 rounded-lg text-[11px]"
                        onClick={() => void copyCurl(r)}
                      >
                        <Terminal className="size-3" />
                        Copiar cURL
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </ScrollArea>

          <div className="flex items-center justify-between border-t px-5 py-3">
            <p className="text-[11px] text-muted-foreground">
              Total histórico: {totals.requests} peticiones · {fmtChars(totals.charsIn)} car. enviados
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 rounded-lg text-xs"
              onClick={() => {
                if (confirm("¿Borrar todas las métricas de uso? Las conversaciones no se tocan.")) {
                  reset();
                }
              }}
            >
              <RotateCcw className="size-3.5" />
              Reiniciar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Visor de cURL (fallback sin permiso de portapapeles y para revisar antes de pegar) */}
      <Dialog open={!!curlEntry} onOpenChange={(v) => !v && setCurlEntry(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-base">cURL de la petición</DialogTitle>
            <DialogDescription className="text-xs">
              Las claves van sustituidas por <code className="rounded bg-muted px-1">TU_API_KEY</code>{" "}
              — pégalas tú si quieres reproducir la llamada.
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-[50vh] overflow-auto rounded-xl border bg-muted/40 p-3 text-[11px] leading-relaxed">
            {curlEntry ? buildCurl(curlEntry) : ""}
          </pre>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              className="h-8 rounded-lg text-xs"
              onClick={async () => {
                if (!curlEntry) return;
                try {
                  await navigator.clipboard.writeText(buildCurl(curlEntry));
                  toast.success("cURL copiado");
                  setCurlEntry(null);
                } catch {
                  toast.error("Sin permiso de portapapeles — selecciona el texto a mano");
                }
              }}
            >
              Copiar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
