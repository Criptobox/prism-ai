"use client";
/** Prism AI — Menú de comandos slash sobre el compositor.
 *
 * Solo pinta: qué comandos salen, cuál está marcado y cómo se mueve la
 * selección lo decide lib/prism/slash.ts (probado en Node).
 */
import { useEffect, useRef } from "react";
import {
  CornerDownLeft,
  ImageIcon,
  IterationCw,
  LayoutTemplate,
  LineChart,
  MessageSquarePlus,
  Presentation,
  Quote,
  ScrollText,
  Swords,
  type LucideIcon,
  Users,
} from "lucide-react";
import type { SlashCommand, SlashId } from "@/lib/prism/slash";
import { cn } from "@/lib/utils";

const ICONS: Record<SlashId, LucideIcon> = {
  imagen: ImageIcon,
  agente: IterationCw,
  resumen: ScrollText,
  orquesta: Users,
  arena: Swords,
  html: LayoutTemplate,
  nuevo: MessageSquarePlus,
  snip: Quote,
  plantillas: LayoutTemplate,
  wrapped: LineChart,
  presentar: Presentation,
};

const TINTS: Record<SlashId, string> = {
  imagen: "bg-prism-pink/12 text-prism-pink",
  agente: "bg-prism-violet/12 text-prism-violet",
  resumen: "bg-prism-cyan/12 text-prism-cyan",
  orquesta: "bg-prism-violet/12 text-prism-violet",
  arena: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
  html: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  nuevo: "bg-muted text-muted-foreground",
  snip: "bg-prism-violet/12 text-prism-violet",
  plantillas: "bg-prism-cyan/12 text-prism-cyan",
  wrapped: "bg-prism-pink/12 text-prism-pink",
  presentar: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
};

export function SlashMenu({
  commands,
  index,
  onPick,
  onHover,
}: {
  commands: SlashCommand[];
  index: number;
  onPick: (cmd: SlashCommand) => void;
  onHover: (i: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  // La selección con flechas tiene que seguir viéndose aunque la lista scrollee
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-slash-index="${index}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [index]);

  if (!commands.length) {
    return (
      <div className="panel-in mb-1.5 rounded-xl border border-border/70 bg-popover/95 px-3 py-2.5 text-[12px] text-muted-foreground shadow-lg backdrop-blur-md">
        Ningún comando coincide. Sigue escribiendo para mandar el mensaje tal cual.
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      id="prism-slash-menu"
      role="listbox"
      aria-label="Comandos"
      className="panel-in mb-1.5 max-h-[16rem] overflow-y-auto rounded-xl border border-border/70 bg-popover/95 p-1 shadow-lg backdrop-blur-md"
    >
      {commands.map((c, i) => {
        const Icon = ICONS[c.id];
        const active = i === index;
        return (
          <button
            key={c.id}
            type="button"
            role="option"
            aria-selected={active}
            data-slash-index={i}
            onMouseEnter={() => onHover(i)}
            // mousedown, no click: el textarea no debe perder el foco antes de tiempo
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(c);
            }}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition",
              active ? "bg-accent" : "hover:bg-accent/60"
            )}
          >
            <span
              className={cn(
                "inline-flex size-7 shrink-0 items-center justify-center rounded-lg",
                TINTS[c.id]
              )}
            >
              <Icon className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-1.5">
                <span className="font-mono text-[12.5px] font-medium leading-tight text-foreground">
                  {c.cmd}
                </span>
                <span className="truncate text-[12px] leading-tight text-foreground/80">
                  {c.title}
                </span>
              </span>
              <span className="block truncate text-[11px] leading-tight text-muted-foreground">
                {c.hint}
              </span>
            </span>
            {active && (
              <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            )}
          </button>
        );
      })}
      <p className="px-2 pb-0.5 pt-1 text-[10px] leading-none text-muted-foreground/70">
        ↑↓ para moverte · Enter para elegir · Esc para cerrar
      </p>
    </div>
  );
}
