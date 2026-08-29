"use client";
/** Prism AI — Hilos: varios temas dentro de una misma conversación.
 *
 * Antes, para cambiar de tema había dos opciones malas: seguir en la misma
 * conversación —arrastrando un contexto que ya no viene a cuento y pagándolo en
 * tokens— o abrir otra y perder de vista lo relacionado.
 *
 * Un hilo archiva lo hablado hasta ahora y deja el lienzo limpio SIN salir de
 * la conversación. Vuelves a él cuando quieras y sigue entero.
 */
import { useState } from "react";
import { Check, ChevronDown, Layers, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Session } from "@/lib/prism/types";
import { threadNameFrom } from "@/lib/prism/branches";
import { cn } from "@/lib/utils";

export function ThreadBar({
  session,
  onStartThread,
  onSwitchThread,
  onRemoveThread,
  onRenameThread,
}: {
  session: Session;
  onStartThread: () => void;
  onSwitchThread: (threadId: string) => void;
  onRemoveThread: (threadId: string) => void;
  onRenameThread: (threadId: string | null, name: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState("");

  const hilos = session.threads ?? [];
  const hayMensajes = session.messages.length > 0;

  // Sin nada que archivar ni archivado, la barra solo estorbaría.
  if (!hayMensajes && hilos.length === 0) return null;

  const nombreActual =
    session.threadName?.trim() || (hayMensajes ? threadNameFrom(session.messages) : "Hilo nuevo");

  const guardar = () => {
    if (borrador.trim()) onRenameThread(null, borrador.trim());
    setEditando(false);
  };

  return (
    <div className="flex items-center gap-1.5 border-b border-border/60 bg-muted/20 px-3 py-1.5 text-xs sm:px-4">
      <Layers className="size-3.5 shrink-0 text-prism-cyan" />

      {editando ? (
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <Input
            value={borrador}
            autoFocus
            onChange={(e) => setBorrador(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") guardar();
              if (e.key === "Escape") setEditando(false);
            }}
            className="h-6 text-xs"
            aria-label="Nombre del hilo"
          />
          <button onClick={guardar} aria-label="Guardar nombre del hilo">
            <Check className="size-3.5 text-emerald-500" />
          </button>
          <button onClick={() => setEditando(false)} aria-label="Cancelar">
            <X className="size-3.5 text-muted-foreground" />
          </button>
        </div>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate text-muted-foreground" title={nombreActual}>
            {nombreActual}
          </span>
          {hayMensajes && (
            <button
              onClick={() => {
                setBorrador(nombreActual);
                setEditando(true);
              }}
              aria-label="Renombrar hilo"
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Pencil className="size-3" />
            </button>
          )}
        </>
      )}

      {hilos.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 shrink-0 gap-1 px-1.5 text-[11px]">
              {hilos.length} {hilos.length === 1 ? "hilo" : "hilos"}
              <ChevronDown className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="text-[11px]">
              Hilos archivados de esta conversación
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {hilos
              .slice()
              .reverse()
              .map((t) => (
                <DropdownMenuItem
                  key={t.id}
                  className="flex items-center gap-2"
                  onSelect={(e) => {
                    e.preventDefault();
                    onSwitchThread(t.id);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{t.name}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {t.messages.length}
                  </span>
                  <button
                    aria-label={`Borrar el hilo ${t.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveThread(t.id);
                    }}
                    className={cn(
                      "shrink-0 rounded p-0.5 text-muted-foreground",
                      "hover:bg-destructive/10 hover:text-destructive"
                    )}
                  >
                    <Trash2 className="size-3" />
                  </button>
                </DropdownMenuItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {hayMensajes && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 shrink-0 gap-1 px-1.5 text-[11px]"
          onClick={onStartThread}
          title="Archiva este tema y empieza otro sin salir de la conversación"
        >
          <Plus className="size-3" /> Nuevo hilo
        </Button>
      )}
    </div>
  );
}
