"use client";
/** Prism AI — Panel del sistema (T3, plan V6).
 *
 * Los datos ya existían, repartidos en tres paneles: Uso, Cuota y Arena. Esto
 * no los reescribe — monta los CUERPOS de esos mismos componentes en pestañas;
 * si aquí hay lógica nueva, es solo la fila de cabecera.
 *
 * La fila de cabecera enseña lo que respondía a «¿por qué no está usando el
 * modelo que elegí?»: el modelo activo, cuántos están en enfriamiento (lo sabe
 * health.ts) y el último fallo. Los cooldowns no se veían en ninguna parte.
 *
 * «Sin dato» se mantiene tal cual: un hueco en un panel no se rellena con una
 * estimación porque quede feo.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { Activity, Coins, Gauge, LayoutDashboard, Snowflake, Swords, Zap } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UsagePanelBody } from "./usage-panel";
import { QuotaPanelBody } from "./quota-panel";
import { ModelArenaBody } from "./model-arena";
import { GastoPanelBody } from "./gasto-panel";
import { usePrism } from "@/lib/prism/store";
import { cooldownRemaining, useHealth } from "@/lib/prism/health";
import { getRecentRequests, subscribeRequests, type RequestLogEntry } from "@/lib/prism/request-log";
import { isAutoKey, splitModelKey } from "@/lib/prism/types";
import { PROVIDER_MAP } from "@/lib/prism/providers";
import { cn } from "@/lib/utils";

/** Suscriptor del anillo de peticiones (para el último fallo) */
function useRequestLog(): RequestLogEntry[] {
  return useSyncExternalStore(subscribeRequests, getRecentRequests, getRecentRequests);
}

/** «hace 2 min» / «hace 1 h», igual que el panel de cuota */
function hace(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 5) return "ahora";
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  return `hace ${Math.round(m / 60)} h`;
}

/** Un fallo sin código HTTP no tuvo respuesta: la canceló quien pregunta o la
 * red ni salió. Etiquetarlo «error 0» sería inventar un código. */
function etiquetaFallo(status: number): string {
  return status ? `error ${status}` : "sin respuesta";
}

/** La fila de cabecera: lo único que este panel AÑADE a los tres paneles que
 *  reúne. Modelo activo, enfriamientos ahora mismo y último fallo. */
function FilaCabecera() {
  // el modelo de la conversación abierta (o el predeterminado), igual que el
  // selector de la cabecera del chat
  const modelKey = usePrism(
    (s) => s.sessions.find((x) => x.id === s.activeSessionId)?.modelKey ?? s.settings.defaultModelKey
  );
  const entries = useHealth((s) => s.entries);
  const providerEntries = useHealth((s) => s.providerEntries);
  const requests = useRequestLog();
  // reloj de 1 s (como el panel de cuota): un enfriamiento que expira mientras
  // miras no puede seguir contándose
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const activo = (() => {
    if (!modelKey || isAutoKey(modelKey)) return { providerId: null, modelId: null, esAuto: true };
    const split = splitModelKey(modelKey);
    if (!split) return { providerId: null, modelId: null, esAuto: false };
    return { providerId: split.providerId, modelId: split.modelId, esAuto: false };
  })();

  const enEnfriamiento = Object.values(entries).filter((e) => cooldownRemaining(e, now) > 0).length;
  const proveedoresEnfriados = Object.values(providerEntries).filter(
    (e) => cooldownRemaining(e, now) > 0
  ).length;

  // el anillo va de más reciente a más viejo: el primer fallo ES el último
  const ultimoFallo = requests.find((r) => r.ok === false) ?? null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      <span
        className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-2.5 py-1"
        title="El modelo que está resolviendo la conversación abierta"
      >
        <Zap className="size-3 text-prism-violet" />
        {activo.esAuto ? (
          <span className="font-medium">Auto</span>
        ) : activo.modelId ? (
          <>
            <span className="max-w-[200px] truncate font-mono">{activo.modelId}</span>
            <span className="text-muted-foreground">
              · {PROVIDER_MAP[activo.providerId ?? ""]?.name ?? "sin proveedor"}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">sin modelo elegido</span>
        )}
      </span>

      <span
        className={cn(
          "flex items-center gap-1.5 rounded-full border px-2.5 py-1",
          enEnfriamiento > 0
            ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
            : "border-border/60 bg-card/60 text-muted-foreground"
        )}
        title={
          enEnfriamiento > 0
            ? "Estos modelos están en cooldown y Auto los salta: por eso puede no usar el que elegiste"
            : "Ningún modelo en cooldown ahora mismo"
        }
      >
        <Snowflake className="size-3" />
        {enEnfriamiento === 0
          ? "sin enfriamientos"
          : `${enEnfriamiento} ${enEnfriamiento === 1 ? "modelo" : "modelos"} en enfriamiento`}
        {proveedoresEnfriados > 0 && ` · ${proveedoresEnfriados} ${proveedoresEnfriados === 1 ? "proveedor" : "proveedores"}`}
      </span>

      <span
        className={cn(
          "flex min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-1",
          ultimoFallo
            ? "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"
            : "border-border/60 bg-card/60 text-muted-foreground"
        )}
        title="La última petición que falló, de esta sesión"
      >
        <Activity className="size-3 shrink-0" />
        {ultimoFallo ? (
          <span className="min-w-0 truncate">
            <span className="font-mono">{ultimoFallo.modelId}</span>
            <span className="text-muted-foreground">
              {" "}
              · {etiquetaFallo(ultimoFallo.status)} · {hace(ultimoFallo.ts, now)}
            </span>
          </span>
        ) : (
          "sin fallos en esta sesión"
        )}
      </span>
    </div>
  );
}

/** El panel unificado: Gasto, Uso, Cuota y Arena en pestañas, más la cabecera. */
export function SystemPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[86vh] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:h-[680px]">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <LayoutDashboard className="size-4 text-prism-cyan" /> Panel del sistema
          </DialogTitle>
          <DialogDescription className="text-xs">
            En qué se te va el gasto, uso, cuota y salud de tus modelos. Los importes salen de los
            tokens que reporta tu proveedor por un catálogo de precios con fecha: nunca de una
            estimación nuestra.
          </DialogDescription>
          <FilaCabecera />
        </DialogHeader>

        {/* «Gasto» abre por defecto: con una clave de pago conectada es la
            primera pregunta, y las otras tres pestañas siguen a un toque. */}
        <Tabs defaultValue="gasto" className="flex min-h-0 flex-1 flex-col gap-0">
          <TabsList className="mx-3 mt-2 grid h-auto w-[calc(100%-1.5rem)] grid-cols-4 gap-1 p-1">
            <TabsTrigger value="gasto" className="flex-col gap-0.5 py-1.5 text-[11px] sm:flex-row sm:text-sm">
              <Coins className="size-3.5" /> Gasto
            </TabsTrigger>
            <TabsTrigger value="uso" className="flex-col gap-0.5 py-1.5 text-[11px] sm:flex-row sm:text-sm">
              <Activity className="size-3.5" /> Uso
            </TabsTrigger>
            <TabsTrigger value="cuota" className="flex-col gap-0.5 py-1.5 text-[11px] sm:flex-row sm:text-sm">
              <Gauge className="size-3.5" /> Cuota
            </TabsTrigger>
            <TabsTrigger value="arena" className="flex-col gap-0.5 py-1.5 text-[11px] sm:flex-row sm:text-sm">
              <Swords className="size-3.5" /> Arena
            </TabsTrigger>
          </TabsList>

          {/* Cada pestaña monta el CUERPO del panel que ya existe: la lógica no
              se duplica ni se reescribe. Cambiar de pestaña desmonta el cuerpo
              (radix), igual que cerrar su diálogo propio. */}
          {/* `overflow-hidden` y no `overflow-y-auto`: el cuerpo de Uso trae su
              propio ScrollArea con un pie fijo debajo. Con la pestaña también
              desplazándose había dos scrolls anidados y el pie acababa pintado
              sobre las filas. Manda uno solo, y es el de dentro. */}
          <TabsContent value="gasto" className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <GastoPanelBody />
          </TabsContent>
          <TabsContent value="uso" className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <UsagePanelBody />
          </TabsContent>
          <TabsContent value="cuota" className="min-h-0 flex-1 overflow-y-auto">
            <QuotaPanelBody />
          </TabsContent>
          <TabsContent value="arena" className="min-h-0 flex-1">
            <ModelArenaBody />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
