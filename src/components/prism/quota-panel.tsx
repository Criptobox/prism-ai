"use client";
/** Prism AI — Panel de cuota por proveedor: el medidor honesto.
 *
 * Tres estados y la verdad en cada uno:
 *  · MEDIDA     — barra real con las cabeceras x-ratelimit-* que el proveedor
 *                 manda en cada respuesta (Groq, Cerebras…), con hora de reposición.
 *  · CONSULTADA — OpenRouter /api/v1/key: uso y tope de la clave. Se pregunta al
 *                 abrir el panel, NO en bucle.
 *  · SIN DATO   — no se inventa ningún porcentaje. Se enseña lo que de verdad se
 *                 mide en local: último 429, fallos seguidos y si está enfriándose.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Gauge, Info, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuota, type ProviderQuota, type QuotaWindow } from "@/lib/prism/quota";
import { providerCooldownRemaining, useHealth } from "@/lib/prism/health";
import { buildRequest, fetchOpenRouterKeyInfo } from "@/lib/prism/chat-client";
import { PROVIDER_MAP } from "@/lib/prism/providers";
import type { ProviderId } from "@/lib/prism/types";
import { usePrism } from "@/lib/prism/store";
import { ModelLogo } from "./model-logo";
import { cn } from "@/lib/utils";

/** «hace 2 min» / «hace 1 h» */
function hace(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 5) return "ahora";
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  return `hace ${Math.round(m / 60)} h`;
}

/** «se repone en 2m 40s» */
function enMs(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (m < 60) return rest ? `${m}m ${rest}s` : `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

const BUCKET_LABEL: Record<string, string> = {
  requests: "peticiones",
  tokens: "tokens",
};

/** Una barra medida: % real derivado de las cabeceras del proveedor */
function BarraMedida({ w, now }: { w: QuotaWindow; now: number }) {
  const pct = Math.max(0, Math.min(100, (w.remaining / w.limit) * 100));
  const low = pct < 20;
  const resetMs = w.resetAt > now ? w.resetAt - now : 0;
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className={cn("font-medium", low ? "text-amber-600 dark:text-amber-400" : "text-foreground")}>
          {Math.round(pct)}% disponible
        </span>
        <span className="text-muted-foreground">
          {w.remaining.toLocaleString("es")} / {w.limit.toLocaleString("es")}
          {resetMs > 0 && ` · se repone en ${enMs(resetMs)}`}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            low ? "bg-amber-500" : "bg-emerald-500"
          )}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
    </div>
  );
}

/** Fila de un proveedor con su estado honesto */
function FilaProveedor({
  providerId,
  quota,
  now,
}: {
  providerId: ProviderId;
  quota: ProviderQuota | undefined;
  now: number;
}) {
  const def = PROVIDER_MAP[providerId];
  const nombre = def?.name ?? providerId;
  const salud = useHealth((s) => s.providerEntries[providerId]);
  const enfriadoMs = providerCooldownRemaining(salud, now);

  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-3">
      <div className="flex items-center gap-2">
        <ModelLogo modelId={nombre} providerId={providerId} />
        <span className="truncate text-sm font-medium">{nombre}</span>
        {quota?.kind === "medida" && (
          <span className="ml-auto shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
            medida
          </span>
        )}
        {quota?.kind === "consultada" && (
          <span className="ml-auto shrink-0 rounded-full bg-sky-500/10 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-400">
            consultada
          </span>
        )}
        {!quota && (
          <span className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground">
            sin dato
          </span>
        )}
      </div>

      {/* 1. MEDIDA — cabeceras x-ratelimit-* */}
      {quota?.kind === "medida" && quota.windows && (
        <div className="mt-2.5 space-y-2.5">
          {Object.entries(quota.windows).map(([bucket, w]) => (
            <div key={bucket} className="flex items-start gap-2">
              <span className="w-16 shrink-0 pt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                {BUCKET_LABEL[bucket] ?? bucket}
              </span>
              <BarraMedida w={w} now={now} />
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground/70">
            Reportado por el proveedor en su última respuesta · {hace(quota.at, now)}
          </p>
        </div>
      )}

      {/* 2. CONSULTADA — endpoint de la clave (OpenRouter) */}
      {quota?.kind === "consultada" && quota.consulted && (
        <div className="mt-2.5">
          <p className="text-[11px]">
            <span className="font-medium">
              {quota.consulted.used.toLocaleString("es", { maximumFractionDigits: 2 })}
            </span>{" "}
            {quota.consulted.unit}
            {quota.consulted.limit != null
              ? ` de ${quota.consulted.limit.toLocaleString("es")} usados`
              : " usados · clave sin tope"}
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground/70">
            Consultado a la API del proveedor · {hace(quota.consulted.at, now)}
          </p>
        </div>
      )}

      {/* 3. SIN DATO — lo que sí sabemos, medido en local */}
      {!quota && (
        <div className="mt-2.5">
          {enfriadoMs > 0 ? (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              Enfriándose por cuota: {enMs(enfriadoMs)} restantes. Auto lo salta.
            </p>
          ) : salud && salud.consecutive ? (
            <p className="text-[11px] text-muted-foreground">
              Último corte: {salud.reason ?? "error"} ({salud.lastStatus || "red"}) ·{" "}
              {salud.consecutive} {salud.consecutive === 1 ? "fallo" : "fallos"} seguidos · sin enfriamiento pendiente
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Sin cortes de cuota registrados en este dispositivo.
            </p>
          )}
          <p className="mt-0.5 text-[10px] text-muted-foreground/70">
            {def?.id === "gemini"
              ? "Gemini no publica cuota restante: solo avisa con un 429."
              : "Este proveedor no reporta cuota por cabeceras ni por API: no se inventa un porcentaje."}
          </p>
        </div>
      )}
    </div>
  );
}

export function QuotaPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const byProvider = useQuota((s) => s.byProvider);
  const providers = usePrism((s) => s.providers);
  const recordConsulted = useQuota((s) => s.recordConsulted);
  const [now, setNow] = useState(() => Date.now());
  const [consultando, setConsultando] = useState(false);

  // el reloj solo corre con el panel abierto (las barras de reposición bajan en vivo)
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open]);

  /** Consulta puntual de OpenRouter al abrir el panel (no en bucle) */
  const consultarOpenRouter = useCallback(async () => {
    const st = usePrism.getState();
    const cfg = st.providers.openrouter;
    if (!cfg?.enabled || !cfg.apiKey.trim()) return;
    setConsultando(true);
    try {
      const data = await fetchOpenRouterKeyInfo("openrouter", cfg);
      if (data) {
        recordConsulted("openrouter", {
          used: data.used,
          limit: data.limit,
          unit: "créditos",
        });
      }
    } catch {
      // sin dato nuevo: lo que ya se muestra sigue siendo el último consultado
    } finally {
      setConsultando(false);
    }
  }, [recordConsulted]);

  useEffect(() => {
    if (open) void consultarOpenRouter();
  }, [open, consultarOpenRouter]);

  /** Proveedores conectados primero; luego los que tengan dato viejo. */
  const filas = useMemo(() => {
    const conectados = (Object.keys(providers) as ProviderId[]).filter(
      (id) => providers[id]?.enabled
    );
    const conDato = (Object.keys(byProvider) as ProviderId[]).filter(
      (id) => byProvider[id] && !conectados.includes(id)
    );
    return [...conectados, ...conDato];
  }, [providers, byProvider]);

  const hayConectados = filas.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-[min(94vw,560px)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gauge className="size-4 text-prism-cyan" /> Cuota por proveedor
          </DialogTitle>
          <DialogDescription>
            Medidor honesto: barras reales donde el proveedor reporta cuota, consulta puntual
            donde hay API, y «sin dato» en vez de porcentajes inventados.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => void consultarOpenRouter()}
            disabled={consultando}
            title="Vuelve a preguntar a OpenRouter el uso de tu clave"
          >
            <RefreshCw className={cn("size-3", consultando && "animate-spin")} />
            Reconsultar OpenRouter
          </Button>
        </div>

        <ScrollArea className="-mx-1 max-h-[52vh] px-1">
          <div className="space-y-2 pb-1">
            {hayConectados ? (
              filas.map((id) => (
                <FilaProveedor key={id} providerId={id} quota={byProvider[id]} now={now} />
              ))
            ) : (
              <p className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                No hay proveedores conectados. Añade una clave gratis (Groq, Gemini,
                OpenRouter…) en Ajustes y este medidor empieza a trabajar.
              </p>
            )}
          </div>
        </ScrollArea>

        <p className="flex items-start gap-1.5 rounded-lg bg-muted/50 p-2.5 text-[10.5px] leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-3 shrink-0" />
          <span>
            <b>Medida</b>: las cabeceras llegan con cada respuesta (Groq, Cerebras…).
            <b> Consultada</b>: se pregunta a la API de la clave (OpenRouter), al abrir este panel.
            <b> Sin dato</b>: se muestra el último 429 y el enfriamiento real, medidos en tu
            dispositivo. Nada sale de aquí y nada se inventa.
          </span>
        </p>
      </DialogContent>
    </Dialog>
  );
}
