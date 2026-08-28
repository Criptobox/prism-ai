"use client";
/** Prism AI — Cheat sheet de atajos de teclado (se abre con ?) */
import { Keyboard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SHORTCUTS: { keys: string[]; action: string }[] = [
  { keys: ["Ctrl", "K"], action: "Cambiar de modelo" },
  { keys: ["Ctrl", "Shift", "E"], action: "Exportar conversación (Markdown)" },
  { keys: ["Ctrl", "Shift", "A"], action: "Arena: comparar modelos A/B" },
  { keys: ["Ctrl", "Shift", "N"], action: "Nueva conversación" },
  { keys: ["?"], action: "Mostrar esta ayuda" },
  { keys: ["Esc"], action: "Cerrar diálogos · detener lectura" },
  { keys: ["Enter"], action: "Enviar mensaje" },
  { keys: ["Shift", "Enter"], action: "Nueva línea en el mensaje" },
];

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Keyboard className="size-4 text-prism-violet" /> Atajos de teclado
          </DialogTitle>
          <DialogDescription className="text-xs">
            En Mac usa ⌘ en lugar de Ctrl.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-1.5">
          {SHORTCUTS.map((s) => (
            <li
              key={s.action}
              className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-card/50 px-3 py-2"
            >
              <span className="text-[13px]">{s.action}</span>
              <span className="flex shrink-0 gap-1">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground"
                  >
                    {k === "Ctrl" && isMac ? "⌘" : k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
