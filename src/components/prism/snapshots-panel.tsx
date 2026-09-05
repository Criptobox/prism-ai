"use client";
/** Prism AI — Panel de puntos de restauración (Pilar 1.3 del plan de escalado).
 *
 * Los snapshots existían desde la v3.31 con persistencia y rollback completos,
 * pero solo el AGENTE podía usarlos (tool `git_snapshot`): cero UI para la
 * persona. Este panel los expone de forma trivial:
 *
 *   · lista de checkpoints de ESTA conversación (los automáticos del agente
 *     se marcan como tales, con el encargo que los originó),
 *   · diff antes/después visible ANTES de restaurar (DiffView),
 *   · restauración de UN clic, con el estado actual también guardado antes
 *     (deshacer es reversible).
 */
import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, Clock, GitCompare, History, RotateCcw, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  borrarSnapshot,
  snapshotsDe,
  type Snapshot,
} from "@/lib/prism/snapshots";
import { fileDiff, wholeFileDiff } from "@/lib/prism/diff";
import type { ChangedFile } from "./diff-view";
import { DiffView } from "./diff-view";
import { cn } from "@/lib/utils";

function fecha(ms: number): string {
  return new Date(ms).toLocaleString("es", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Diff completo entre los archivos ACTUALES y los del snapshot. */
function cambiosDe(
  actual: Record<string, string>,
  snap: Record<string, string>
): ChangedFile[] {
  const out: ChangedFile[] = [];
  const todos = Array.from(new Set([...Object.keys(actual), ...Object.keys(snap)])).sort();
  for (const path of todos) {
    const antes = actual[path];
    const despues = snap[path];
    if (antes === despues) continue;
    if (antes === undefined) {
      out.push({ path, before: null, after: despues, diff: wholeFileDiff(path, despues, "nuevo") });
    } else if (despues === undefined) {
      out.push({ path, before: antes, after: null, diff: wholeFileDiff(path, antes, "borrado") });
    } else {
      out.push({ path, before: antes, after: despues, diff: fileDiff(path, antes, despues) });
    }
  }
  return out;
}

function TarjetaSnapshot({
  s,
  actual,
  onRestaurar,
}: {
  s: Snapshot;
  /** archivos actuales del proyecto, para el diff */
  actual: Record<string, string> | null;
  onRestaurar: (s: Snapshot) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const nArchivos = Object.keys(s.files).length;

  const resumenCambio = useMemo(() => {
    if (!actual) return null;
    const todos = new Set([...Object.keys(actual), ...Object.keys(s.files)]);
    let cambiados = 0;
    for (const k of todos) {
      if (actual[k] !== s.files[k]) cambiados++;
    }
    return cambiados;
  }, [actual, s.files]);

  const cambios = useMemo(
    () => (actual ? cambiosDe(actual, s.files) : []),
    [actual, s.files]
  );

  return (
    <div className="rounded-xl border border-border/60 bg-card/60">
      <button
        type="button"
        className="flex w-full items-start gap-2 p-3 text-left"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
      >
        {abierto ? (
          <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <p className="break-words text-[12px] font-medium leading-snug">{s.mensaje}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground/70">
            <Clock className="size-3" />
            {fecha(s.fecha)} · {nArchivos} archivo(s)
            {s.origen === "agente" && (
              <span className="rounded bg-prism-violet/10 px-1.5 py-0.5 text-prism-violet">
                checkpoint automático
              </span>
            )}
            {resumenCambio !== null && (
              <span>· {resumenCambio} archivo(s) distinto(s) del proyecto actual</span>
            )}
          </p>
        </div>
      </button>

      {abierto && (
        <div className="border-t border-border/40 px-3 py-2">
          {cambios.length > 0 && (
            <div className="mb-2">
              <p className="mb-1 flex items-center gap-1.5 text-[10.5px] font-medium text-muted-foreground">
                <GitCompare className="size-3" />
                Cambios que se descartarían (proyecto actual → este punto)
              </p>
              <div className="max-h-44 overflow-auto rounded-lg border border-border/40 bg-background/60 text-[10px]">
                <DiffView changes={cambios} />
              </div>
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-red-500"
              onClick={() => borrarSnapshot(s.id)}
              title="Borrar este punto de restauración"
            >
              <Trash2 className="size-3" /> Borrar
            </Button>
            <Button
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => onRestaurar(s)}
            >
              <RotateCcw className="size-3" /> Restaurar este punto
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SnapshotsPanel({
  open,
  onOpenChange,
  sessionId,
  archivosActuales,
  onRestaurar,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sessionId: string | null;
  /** archivos del proyecto ahora mismo en el Sandbox, para el diff */
  archivosActuales: Record<string, string>;
  onRestaurar: (files: Record<string, string>) => void;
}) {
  // se recarga al abrir el panel (y en cada render mientras está abierto:
  // los checkpoints automáticos pueden llegar en cualquier momento)
  const lista = useMemo(
    () => (open && sessionId ? snapshotsDe(sessionId) : []),
    [open, sessionId]
  );

  const restaurar = (s: Snapshot) => {
    onRestaurar(s.files);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-[min(94vw,620px)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-4 text-prism-violet" /> Puntos de restauración
          </DialogTitle>
          <DialogDescription>
            Cada tarea del agente guarda un checkpoint ANTES de tocar nada. Restaurar
            un punto descarta los cambios posteriores; el estado actual también se
            guarda antes, así que deshacer es reversible.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="-mx-1 max-h-[56vh] px-1">
          <div className="space-y-2 pb-1">
            {lista.length ? (
              lista.map((s) => (
                <TarjetaSnapshot
                  key={s.id}
                  s={s}
                  actual={archivosActuales}
                  onRestaurar={restaurar}
                />
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-border/60 p-6 text-center">
                <Check className="mx-auto size-5 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">
                  Todavía no hay checkpoints en esta conversación.
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground/70">
                  Se crean solos antes de cada tarea del agente cuando el proyecto ya
                  tiene archivos. También los crea el agente con su herramienta
                  git_snapshot antes de cambios grandes.
                </p>
              </div>
            )}
          </div>
        </ScrollArea>

        <p className={cn("text-[10.5px] text-muted-foreground/70", !lista.length && "hidden")}>
          {lista.length} punto(s) · máx. 12 · viven en este dispositivo
        </p>
      </DialogContent>
    </Dialog>
  );
}
