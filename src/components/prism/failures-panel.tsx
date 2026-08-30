"use client";
/** Prism AI — Panel de la memoria de fallos.
 * Lista de `{ resultado, regla }` aprendidas de errores VERIFICABLES (revisión
 * del Sandbox, trabajo del agente a medias, desbordes medidos en la vista
 * previa). Cada entrada se borra de una en una — quien decide qué se le enseña
 * al agente es el usuario — y todas caducan solas a los 14 días.
 */
import { useEffect } from "react";
import { AlertTriangle, Bot, BrainCircuit, Eye, Trash2, Wrench } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { caducaEn, useFailures, type FailureEntry, type FailureScope } from "@/lib/prism/failures";
import { cn } from "@/lib/utils";

const SCOPE_META: Record<FailureScope, { icon: typeof Bot; label: string }> = {
  sandbox: { icon: Wrench, label: "Sandbox" },
  agente: { icon: Bot, label: "Agente" },
  vista: { icon: Eye, label: "Vista previa" },
};

function TarjetaFallo({ e, now }: { e: FailureEntry; now: number }) {
  const remove = useFailures((s) => s.remove);
  const meta = SCOPE_META[e.scope] ?? SCOPE_META.sandbox;
  const Icon = meta.icon;
  return (
    <div className="group rounded-xl border border-border/60 bg-card/60 p-3">
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md",
            e.nivel === "error"
              ? "bg-red-500/10 text-red-600 dark:text-red-400"
              : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
          )}
          title={`${meta.label} · ${e.nivel}`}
        >
          <Icon className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="break-words text-[12px] leading-snug text-foreground">
            {e.resultado}
          </p>
          <p className="mt-1.5 break-words border-l-2 border-border pl-2 text-[11px] leading-snug text-muted-foreground">
            <span className="font-medium text-foreground/80">Regla:</span> {e.regla}
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground/70">
            <span>{meta.label}</span>
            <span>· {e.usos} {e.usos === 1 ? "vez" : "veces"}</span>
            <span>· {caducaEn(e.expiresAt, now)}</span>
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-muted-foreground hover:text-red-500"
          onClick={() => remove(e.id)}
          title="Borrar esta regla (deja de condicionar al agente)"
          aria-label={`Borrar regla: ${e.regla.slice(0, 40)}`}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function FailuresPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const entries = useFailures((s) => s.entries);
  const clearAll = useFailures((s) => s.clearAll);
  const sweep = useFailures((s) => s.sweep);
  const now = open ? Date.now() : 0;

  // housekeeping al abrir: fuera caducadas antes de mostrar
  useEffect(() => {
    if (open) sweep();
  }, [open, sweep]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-[min(94vw,560px)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BrainCircuit className="size-4 text-prism-violet" /> Memoria de fallos
          </DialogTitle>
          <DialogDescription>
            Reglas aprendidas de errores verificados — lo que falló de verdad, no lo
            que «sonó raro». El agente las consulta antes de actuar; caducan solas a
            los 14 días y se borran de una en una.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="-mx-1 max-h-[52vh] px-1">
          <div className="space-y-2 pb-1">
            {entries.length ? (
              entries.map((e) => <TarjetaFallo key={e.id} e={e} now={now || Date.now()} />)
            ) : (
              <div className="rounded-xl border border-dashed border-border/60 p-6 text-center">
                <AlertTriangle className="mx-auto size-5 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">
                  Todavía no hay fallos aprendidos.
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground/70">
                  Se apuntan solos: la revisión del Sandbox, un trabajo del agente que
                  se queda a medias o una página que se rompe en móvil.
                </p>
              </div>
            )}
          </div>
        </ScrollArea>

        {entries.length > 0 && (
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10.5px] text-muted-foreground/70">
              {entries.length} {entries.length === 1 ? "regla" : "reglas"} activas · máx. 40
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs hover:text-red-500"
              onClick={clearAll}
            >
              <Trash2 className="size-3" /> Borrar todo
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
