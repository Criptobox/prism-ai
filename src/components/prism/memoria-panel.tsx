"use client";
/** Prism AI — Panel de la memoria del proyecto (Pilar 3 del plan de escalado).
 *
 * El «cerebro» del proyecto hecho visible y editable:
 *   · decisiones tomadas (usuario / agente / modelo)
 *   · errores con su causa y solución
 *   · Task DNA: encargos, modelo usado, reintentos (alimenta la recomendación)
 *   · direcciones de diseño usadas (variación forzada entre proyectos)
 *   · reglas «no tocar» (puente con la memoria negativa de la sesión)
 *
 * Y la pieza que lo ata al repo: exportar a los cinco JSON de `.prism/` para
 * que la memoria viaje con el proyecto a GitHub (decisions.json, errors.json,
 * tasks.json, design-tokens.json, negative-rules.json).
 */
import { useMemo, useState } from "react";
import {
  Brain,
  CheckCircle2,
  Copy,
  Download,
  FileCode2,
  ListChecks,
  Palette,
  ShieldBan,
  Trash2,
  Wrench,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  aArchivosPrism,
  addDecision as addDecisionMemoria,
  borrarMemoria,
  guardarMemoria,
  leerMemoria,
  type MemoriaProyecto,
} from "@/lib/prism/memoria-proyecto";
import { toast } from "sonner";

function fecha(ms: number): string {
  return new Date(ms).toLocaleString("es", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const TABS = [
  { id: "decisiones", label: "Decisiones" },
  { id: "errores", label: "Errores" },
  { id: "tareas", label: "Tareas" },
  { id: "disenos", label: "Diseño" },
  { id: "reglas", label: "Reglas" },
] as const;

export function MemoriaPanel({
  open,
  onOpenChange,
  sessionId,
  sesionTitulo,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sessionId: string | null;
  sesionTitulo?: string;
  /** los archivos actuales del Sandbox se pasan para los commits .prism/ */
  sandboxFiles?: Record<string, string>;
}) {
  const [tab, setTab] = useState<string>("decisiones");
  // se lee en cada render mientras está abierto: la memoria cambia en vivo
  const memoria: MemoriaProyecto = useMemo(
    () => (open && sessionId ? leerMemoria(sessionId) : { decisiones: [], errores: [], tareas: [], disenos: [], reglas: [] }),
    [open, sessionId]
  );

  const exportar = () => {
    if (!sessionId) return;
    const archivos = aArchivosPrism(memoria);
    const nombres = Object.keys(archivos);
    if (!nombres.length) {
      toast.info("La memoria está vacía todavía", {
        description: "Se llena sola con las tareas, decisiones y errores del proyecto.",
      });
      return;
    }
    // Copia al portapapeles el JSON concatenado con separadores de archivo:
    // Repo Studio acepta pegarlo; y cada archivo se puede crear a mano.
    const texto = nombres
      .map((n) => `===== ${n} =====\n${archivos[n]}`)
      .join("\n\n");
    void navigator.clipboard
      .writeText(texto)
      .then(() =>
        toast.success("Memoria copiada", {
          description: `${nombres.length} archivo(s) .prism/ listos para el repo: ${nombres.join(", ")}`,
        })
      )
      .catch(() => toast.error("No se pudo copiar"));
  };

  const addDecision = (contenido: string) => {
    if (!sessionId || !contenido.trim()) return;
    guardarMemoria(
      sessionId,
      addDecisionMemoria(leerMemoria(sessionId), contenido, "usuario", "global")
    );
  };

  const total =
    memoria.decisiones.length +
    memoria.errores.length +
    memoria.tareas.length +
    memoria.disenos.length +
    memoria.reglas.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-[min(94vw,620px)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="size-4 text-prism-violet" /> Memoria del proyecto
          </DialogTitle>
          <DialogDescription>
            {sesionTitulo ? `«${sesionTitulo}» — ` : ""}Lo que Prism sabe de este
            proyecto: decisiones, errores con su solución, tareas hechas y estilos
            ya usados. Viaja con el proyecto si exportas la memoria a `.prism/`.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-5">
            {TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="text-[11px]">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <ScrollArea className="mt-2 max-h-[44vh]">
            <TabsContent value="decisiones" className="mt-0 space-y-2">
              {memoria.decisiones.length ? (
                memoria.decisiones.map((d) => (
                  <div key={d.id} className="rounded-lg border border-border/60 bg-card/60 p-2.5 text-[12px]">
                    <p className="break-words">{d.contenido}</p>
                    <p className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground/70">
                      <span className="rounded bg-muted px-1.5 py-0.5">{d.origen}</span>
                      {fecha(d.creadoEl)}
                    </p>
                  </div>
                ))
              ) : (
                <Vacio texto="Sin decisiones guardadas. Las notas del mapa y las decisiones del agente entran solas." />
              )}
            </TabsContent>

            <TabsContent value="errores" className="mt-0 space-y-2">
              {memoria.errores.length ? (
                memoria.errores.map((e) => (
                  <div key={e.id} className="rounded-lg border border-border/60 bg-card/60 p-2.5 text-[12px]">
                    <p className="flex items-start gap-1.5 break-words">
                      <Wrench className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                      {e.que}
                    </p>
                    {e.solucion && (
                      <p className="mt-1 flex items-start gap-1.5 break-words pl-5 text-[11px] text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
                        {e.solucion}
                      </p>
                    )}
                    <p className="mt-1 pl-5 text-[10px] text-muted-foreground/70">{fecha(e.creadoEl)}</p>
                  </div>
                ))
              ) : (
                <Vacio texto="Sin errores registrados. Los que corrija el agente se apuntan aquí con su solución." />
              )}
            </TabsContent>

            <TabsContent value="tareas" className="mt-0 space-y-2">
              {memoria.tareas.length ? (
                memoria.tareas.map((t) => (
                  <div key={t.id} className="rounded-lg border border-border/60 bg-card/60 p-2.5 text-[12px]">
                    <p className="break-words">{t.objetivo}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground/70">
                      <ListChecks className="size-3" />
                      <span
                        className={
                          t.estado === "failed"
                            ? "text-red-500"
                            : t.estado === "done"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : ""
                        }
                      >
                        {t.estado}
                      </span>
                      {t.modelo && <code className="font-mono">{t.modelo}</code>}
                      {(t.reintentos ?? 0) > 0 && <span>· {t.reintentos} reintento(s)</span>}
                      <span>· {fecha(t.creadoEl)}</span>
                    </p>
                  </div>
                ))
              ) : (
                <Vacio texto="Sin tareas todavía. Cada encargo del agente se guarda aquí: qué se pidió, con qué modelo y cómo acabó." />
              )}
            </TabsContent>

            <TabsContent value="disenos" className="mt-0 space-y-2">
              {memoria.disenos.length ? (
                memoria.disenos.map((d) => (
                  <div key={d.id} className="rounded-lg border border-border/60 bg-card/60 p-2.5 text-[12px]">
                    <p className="flex items-center gap-1.5 font-medium">
                      <Palette className="size-3.5 text-prism-violet" />
                      {d.direccion}
                    </p>
                    <p className="mt-1 break-words text-[11px] text-muted-foreground">
                      {d.resumen}
                    </p>
                  </div>
                ))
              ) : (
                <Vacio texto="Sin direcciones de diseño usadas. La primera web que generes registrará su estilo aquí para no repetirse después." />
              )}
            </TabsContent>

            <TabsContent value="reglas" className="mt-0 space-y-2">
              {memoria.reglas.length ? (
                memoria.reglas.map((r, i) => (
                  <div key={`${r.patron}-${i}`} className="rounded-lg border border-border/60 bg-card/60 p-2.5 text-[12px]">
                    <p className="flex items-center gap-1.5 font-medium">
                      <ShieldBan className="size-3.5 text-red-500" />
                      <code className="font-mono">{r.patron}</code>
                    </p>
                    <p className="mt-1 break-words text-[11px] text-muted-foreground">{r.motivo}</p>
                  </div>
                ))
              ) : (
                <Vacio texto="Sin reglas «no tocar». Se crean desde el mapa del proyecto o desde Ajustes del agente." />
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={exportar}>
              <FileCode2 className="size-3" /> Exportar .prism/
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-muted-foreground"
              title="Copiar un ejemplo de decisión para pegarla en el chat"
              onClick={() => {
                const ejemplo = "Decisión: la paleta del proyecto es cálida (crema + terracota) y la tipografía principal es serif editorial.";
                void navigator.clipboard?.writeText(ejemplo);
                addDecision("La paleta del proyecto es cálida (crema + terracota)");
                toast.success("Decisión añadida a la memoria");
              }}
            >
              <Copy className="size-3" />
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-red-500"
            onClick={() => {
              if (!sessionId) return;
              borrarMemoria(sessionId);
              toast.success("Memoria del proyecto borrada");
            }}
          >
            <Trash2 className="size-3" /> Olvidar todo
          </Button>
        </div>
        <p className="text-[10.5px] text-muted-foreground/70">
          {total} elemento(s) · vive en este dispositivo y se exporta a los archivos
          .prism/ del repo (Download arriba)
        </p>
      </DialogContent>
    </Dialog>
  );
}

function Vacio({ texto }: { texto: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border/60 p-5 text-center">
      <Download className="mx-auto size-4 text-muted-foreground/40" />
      <p className="mt-2 text-[12px] text-muted-foreground">{texto}</p>
    </div>
  );
}
