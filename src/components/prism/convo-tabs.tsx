"use client";
/** Prism AI — Barra de pestañas de conversación (idea D2 del PLAN-V7).
 *
 * Como en un navegador: cada conversación abierta es una pestaña, cambias
 * de proyecto sin pasar por la barra lateral ni perder el hilo. Cerrar
 * con la X (o clic central) quita la pestaña, NO borra la conversación:
 * sigue en la barra lateral y puede reabrirse.
 *
 * Solo escritorio (md+): en el móvil la barra lateral con hoja ya cumple
 * ese papel y el espacio vertical es oro. Patrón ARIA de pestañas real
 * (tablist/tab), no botones: así ningún test que busque botones por
 * nombre tropieza con los títulos de las conversaciones.
 */
import { MessageSquare, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function ConvoTabs({
  sessions,
  tabs,
  activeId,
  onSelect,
  onClose,
  onNew,
}: {
  /** conversaciones conocidas (id → título), para pintar el nombre */
  sessions: { id: string; title: string }[];
  /** ids de las pestañas abiertas, en orden */
  tabs: string[];
  /** conversación activa (su pestaña va resaltada) */
  activeId: string | null;
  /** activar la conversación de esa pestaña */
  onSelect: (id: string) => void;
  /** cerrar SOLO la pestaña (la conversación no se borra) */
  onClose: (id: string) => void;
  /** lienzo limpio: conversación nueva sin crearla aún */
  onNew: () => void;
}) {
  if (!tabs.length) return null;
  const titulo = (id: string) =>
    sessions.find((s) => s.id === id)?.title ?? "conversación";

  return (
    <div
      role="tablist"
      aria-label="Conversaciones abiertas"
      className="hidden items-center gap-1 overflow-x-auto border-b border-border/60 bg-background/40 px-3 pt-1.5 backdrop-blur-md md:flex"
    >
      {tabs.map((id) => {
        const activa = id === activeId;
        return (
          <div
            key={id}
            role="tab"
            aria-selected={activa}
            tabIndex={activa ? 0 : -1}
            onClick={() => onSelect(id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(id);
              }
            }}
            onAuxClick={(e) => {
              // clic central = cerrar, como en cualquier navegador
              if (e.button === 1) {
                e.preventDefault();
                onClose(id);
              }
            }}
            title={titulo(id)}
            className={cn(
              "group flex max-w-[190px] shrink-0 cursor-pointer select-none items-center gap-1.5 rounded-t-lg border border-b-0 px-2.5 py-1.5 text-[12px] font-medium transition-colors",
              activa
                ? "border-border/70 bg-card/80 text-foreground shadow-[inset_0_2px_0_0_var(--prism-violet)]"
                : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
          >
            <MessageSquare
              className={cn("size-3 shrink-0", activa ? "text-prism-violet" : "opacity-50")}
            />
            <span className="min-w-0 flex-1 truncate">{titulo(id)}</span>
            <button
              type="button"
              aria-label={`Cerrar pestaña ${titulo(id)}`}
              title="Cerrar pestaña (la conversación sigue en la barra lateral)"
              onClick={(e) => {
                e.stopPropagation();
                onClose(id);
              }}
              className="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground/60 opacity-0 transition hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
            >
              <X className="size-3" />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        aria-label="Abrir conversación en pestaña nueva"
        title="Empezar otra conversación"
        onClick={onNew}
        className="ml-1 flex size-6 shrink-0 items-center justify-center rounded-md border border-dashed border-border/70 text-muted-foreground/70 transition hover:border-prism-cyan/60 hover:text-prism-cyan"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
