"use client";
/** Prism AI — Diálogo del Modo Repaso.
 *
 * Dos pestañas: «Estudiar» (la cola de tarjetas vencidas de hoy, con volteo y
 * las cuatro calificaciones SM-2) y «Biblioteca» (lo que hay guardado, con
 * vencimientos, borrado y reinicio de progreso).
 *
 * La cola vive en el estado LOCAL del diálogo, no en el store: es la cola de
 * ESTA sesión de estudio. Lo que el store recuerda entre visitas es el
 * calendario (vencimientos, facilidad, intervalos), que es lo que SM-2 decide.
 * Si «otra vez» devuelve una tarjeta, reaparece al final de esta cola; el
 * store solo anota que su vencimiento vuelve a ser hoy.
 */
import { useEffect, useMemo, useState } from "react";
import { Brain, GraduationCap, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRepaso } from "@/lib/prism/repaso-store";
import {
  CALIFICACIONES,
  etiquetaIntervalo,
  fechaHoy,
  programar,
  resumenRepaso,
  tarjetasVencidas,
  type Calificacion,
} from "@/lib/prism/repaso";

export function RepasoDialog({
  open,
  onOpenChange,
  onPreparar,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Pone el encargo de examen en el compositor (y cierra este diálogo). */
  onPreparar: () => void;
}) {
  const tarjetas = useRepaso((s) => s.tarjetas);
  const calificar = useRepaso((s) => s.calificar);
  const borrar = useRepaso((s) => s.borrar);
  const reiniciar = useRepaso((s) => s.reiniciar);

  // El «hoy» se fija al abrir: si la sesión cruza la medianoche, la cola no
  // cambia de debajo de tus pies a mitad de repaso.
  const [hoy, setHoy] = useState<string>("");
  // La cola de esta sesión: ids por calificar; «otra vez» empuja al final.
  const [cola, setCola] = useState<string[]>([]);
  const [hechas, setHechas] = useState(0);
  const [revelada, setRevelada] = useState(false);

  useEffect(() => {
    if (open) {
      const d = fechaHoy();
      setHoy(d);
      setCola(tarjetasVencidas(useRepaso.getState().tarjetas, d).map((t) => t.id));
      setHechas(0);
      setRevelada(false);
    }
  }, [open]);

  const resumen = useMemo(
    () => resumenRepaso(tarjetas, hoy || fechaHoy()),
    [tarjetas, hoy]
  );

  const actual = useMemo(
    () => tarjetas.find((t) => t.id === cola[0]) ?? null,
    [tarjetas, cola]
  );

  const calificarTarjeta = (q: Calificacion) => {
    if (!actual) return;
    calificar(actual.id, q);
    setHechas((h) => h + 1);
    setRevelada(false);
    // Suspende (q<3): al final de la cola, que reaparezca hoy mismo.
    const resto = cola.slice(1);
    setCola(q < 3 ? [...resto, actual.id] : resto);
  };

  // La sesión termina cuando la COLA se vacía, no cuando el total llega a
  // cero: el total (hechas + cola) es el contador de la pizarra y solo crece
  // con las «otra vez». Con `totalSesion === 0` el Día completado era
  // inalcanzable y el panel se quedaba en blanco — lo cazó el E2E.
  const totalSesion = hechas + cola.length;
  const completado = cola.length === 0 && hechas > 0;
  const alDia = cola.length === 0 && hechas === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="size-4 text-prism-violet" /> Modo Repaso
          </DialogTitle>
          <DialogDescription>
            Tus conversaciones convertidas en tarjetas de estudio. El calendario
            (SM-2) se calcula en tu navegador: nada sale del dispositivo.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="estudiar">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="estudiar">
              Estudiar{resumen.vencidas > 0 ? ` · ${resumen.vencidas}` : ""}
            </TabsTrigger>
            <TabsTrigger value="biblioteca">Biblioteca · {resumen.total}</TabsTrigger>
          </TabsList>

          {/* ——— Estudiar ——— */}
          <TabsContent value="estudiar" className="mt-3">
            {resumen.total === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/60 px-4 py-8 text-center">
                <GraduationCap className="size-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  Todavía no hay tarjetas. Pídele a Prism que te examine de lo
                  que acabáis de hablar: él prepara el examen y aquí lo repases
                  el día que toca.
                </p>
                <Button size="sm" onClick={onPreparar}>
                  <Sparkles className="size-3.5" /> Preparar petición
                </Button>
              </div>
            ) : completado ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-8 text-center">
                <p className="text-2xl">🎉</p>
                <p className="text-sm font-medium">Día completado</p>
                <p className="text-xs text-muted-foreground">
                  {hechas === 1 ? "1 tarjeta repasada" : `${hechas} tarjetas repasadas`}. Lo
                  que fallaste vuelve hoy; lo que acertaste, el día que toque.
                </p>
              </div>
            ) : alDia ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/60 px-4 py-8 text-center">
                <p className="text-2xl">☕</p>
                <p className="text-sm font-medium">Todo al día</p>
                <p className="text-xs text-muted-foreground">
                  {resumen.proxima
                    ? `La próxima tarjeta vence el ${resumen.proxima}.`
                    : "Nada pendiente."}{" "}
                  Puedes hacer más tarjetas desde cualquier conversación.
                </p>
              </div>
            ) : (
              actual && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="tabular-nums">
                      {hechas + 1} / {totalSesion}
                    </span>
                    {actual.origen && (
                      <span className="max-w-[60%] truncate" title={actual.origen}>
                        de «{actual.origen}»
                      </span>
                    )}
                  </div>
                  <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-5 text-center">
                    <p className="text-[15px] font-medium leading-snug">{actual.frente}</p>
                    {revelada && (
                      <p className="mt-3 border-t border-border/50 pt-3 text-[13.5px] leading-relaxed text-muted-foreground">
                        {actual.dorso}
                      </p>
                    )}
                  </div>
                  {!revelada ? (
                    <Button onClick={() => setRevelada(true)}>Mostrar respuesta</Button>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {CALIFICACIONES.map(({ q, label }) => {
                        const prox = programar(actual, q, hoy || fechaHoy());
                        const vence = q < 3 ? "hoy" : etiquetaIntervalo(prox.intervaloDias);
                        return (
                          <Button
                            key={q}
                            variant={q === 1 ? "outline" : q === 4 ? "default" : "secondary"}
                            size="sm"
                            className={
                              q === 1
                                ? "border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                : "flex-col gap-0"
                            }
                            onClick={() => calificarTarjeta(q)}
                          >
                            <span>{label}</span>
                            <span className="text-[9.5px] opacity-70">{vence}</span>
                          </Button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )
            )}
          </TabsContent>

          {/* ——— Biblioteca ——— */}
          <TabsContent value="biblioteca" className="mt-3">
            <div className="grid grid-cols-4 gap-1.5 text-center">
              <MiniStat valor={resumen.total} etiqueta="total" />
              <MiniStat valor={resumen.vencidas} etiqueta="vencidas" />
              <MiniStat valor={resumen.frescas} etiqueta="frescas" />
              <MiniStat valor={resumen.aprendidas} etiqueta="aprendidas" />
            </div>
            {resumen.total === 0 ? (
              <p className="rounded-xl border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
                La biblioteca está vacía. Estudia primero y las tarjetas aparecerán aquí.
              </p>
            ) : (
              <ScrollArea className="mt-3 h-64 rounded-xl border border-border/60">
                <ul className="divide-y divide-border/40">
                  {tarjetas.map((t) => (
                    <li key={t.id} className="flex items-start gap-2 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium" title={t.frente}>
                          {t.frente}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                          <span
                            className={
                              t.vencimiento <= (hoy || fechaHoy())
                                ? "font-medium text-prism-violet"
                                : undefined
                            }
                          >
                            {t.vencimiento <= (hoy || fechaHoy())
                              ? t.vencimiento < (hoy || fechaHoy())
                                ? "vencida"
                                : "vence hoy"
                              : `vence ${t.vencimiento}`}
                          </span>
                          <span>·</span>
                          <span>
                            {t.repeticiones === 0
                              ? "sin repasar"
                              : t.repeticiones === 1
                                ? "1 acierto"
                                : `${t.repeticiones} aciertos`}
                          </span>
                        </p>
                      </div>
                      <button
                        aria-label={`Borrar tarjeta: ${t.frente}`}
                        className="rounded p-1 text-muted-foreground/60 transition hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => borrar(t.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
            <div className="mt-3 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                disabled={resumen.total === 0}
                onClick={() => {
                  reiniciar();
                  toast.success("Progreso reiniciado", {
                    description: "Todas las tarjetas vuelven a estar por repasar.",
                  });
                }}
              >
                <RotateCcw className="size-3.5" /> Reiniciar progreso
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function MiniStat({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 px-2 py-2">
      <p className="text-[15px] font-semibold tabular-nums">{valor}</p>
      <p className="text-[9.5px] uppercase tracking-wider text-muted-foreground">{etiqueta}</p>
    </div>
  );
}
