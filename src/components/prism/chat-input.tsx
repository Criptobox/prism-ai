"use client";
/** Prism AI — Entrada de mensajes con adjuntos, biblioteca, skills, modo agente y dictado por voz */
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, BookOpen, ImagePlus, IterationCw, Mic, MicOff, Puzzle, Square, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { startDictation, speechToTextSupported } from "@/lib/prism/speech";
import type { Attachment } from "@/lib/prism/types";

export function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  disabled,
  placeholder = "Escribe tu mensaje…",
  attachments = [],
  onAttach,
  onRemoveAttachment,
  onOpenLibrary,
  onOpenSkills,
  agent,
  onToggleAgent,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  disabled?: boolean;
  placeholder?: string;
  attachments?: Attachment[];
  onAttach?: (files: File[]) => void;
  onRemoveAttachment?: (id: string) => void;
  onOpenLibrary?: () => void;
  onOpenSkills?: () => void;
  /** modo agente activo (bucle plan → ejecutar → revisar) */
  agent?: boolean;
  onToggleAgent?: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dictating, setDictating] = useState(false);
  const dictationRef = useRef<{ stop: () => void } | null>(null);
  /** texto del input acumulado (base + fragmentos finales reconocidos) */
  const baseRef = useRef("");

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, []);

  useEffect(resize, [value, resize]);

  useEffect(() => {
    if (!streaming) ref.current?.focus();
  }, [streaming]);

  // detiene el dictado si el componente se desmonta
  useEffect(() => () => dictationRef.current?.stop(), []);

  const toggleDictation = useCallback(() => {
    if (dictating) {
      dictationRef.current?.stop();
      return;
    }
    if (!speechToTextSupported()) {
      toast.error("Tu navegador no soporta dictado por voz", {
        description: "Prueba Chrome, Edge o Safari.",
      });
      return;
    }
    baseRef.current = value ? value.replace(/\s+$/, "") + " " : "";
    setDictating(true);
    dictationRef.current = startDictation({
      onFinal: (text) => {
        const next = (baseRef.current + text).trimStart();
        baseRef.current = next ? next.replace(/\s+$/, "") + " " : "";
        onChange(next);
      },
      onPartial: (text) => {
        if (text) onChange(baseRef.current + text);
      },
      onError: (msg) => toast.error(msg),
      onEnd: () => {
        setDictating(false);
        dictationRef.current = null;
      },
    });
  }, [dictating, value, onChange]);

  const keyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!streaming && !disabled) onSend();
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
    if (files.length && onAttach) {
      e.preventDefault();
      onAttach(files);
    }
  };

  const hasAttachments = attachments.length > 0;
  const canSend = !streaming && !disabled && (value.trim().length > 0 || hasAttachments);

  return (
    <div className="safe-bottom pointer-events-auto sticky bottom-0 z-10 px-3 pb-3 pt-2 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div
          className={cn(
            "glass flex flex-col gap-1.5 rounded-2xl border border-border/80 p-2 shadow-lg shadow-black/[0.06] transition focus-within:border-prism-violet/50 dark:shadow-black/30",
            disabled && "opacity-60"
          )}
        >
          {/* Miniaturas de imágenes adjuntas */}
          {hasAttachments && (
            <div className="flex gap-2 overflow-x-auto px-1 pb-0.5 pt-1">
              {attachments.map((a) => (
                <div key={a.id} className="group relative shrink-0">
                  <img
                    src={a.dataUrl}
                    alt={a.name}
                    className="size-16 rounded-lg border border-border/60 object-cover"
                  />
                  <button
                    onClick={() => onRemoveAttachment?.(a.id)}
                    aria-label={`Quitar ${a.name}`}
                    className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm transition hover:bg-destructive hover:text-white"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-1.5">
            {/* Adjuntar imagen */}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length) onAttach?.(files);
                e.target.value = "";
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => fileRef.current?.click()}
              disabled={streaming}
              title="Adjuntar imágenes"
              aria-label="Adjuntar imágenes"
            >
              <ImagePlus className="size-4" />
            </Button>
            {/* Biblioteca de prompts */}
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={onOpenLibrary}
              disabled={streaming}
              title="Biblioteca de prompts"
              aria-label="Abrir biblioteca de prompts"
            >
              <BookOpen className="size-4" />
            </Button>
            {/* Skills */}
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={onOpenSkills}
              disabled={streaming}
              title="Skills"
              aria-label="Abrir skills"
            >
              <Puzzle className="size-4" />
            </Button>
            {/* Dictado por voz */}
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "size-8 shrink-0 transition",
                dictating
                  ? "bg-red-500/10 text-red-500 hover:bg-red-500/15 hover:text-red-500"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={toggleDictation}
              disabled={streaming}
              title={dictating ? "Detener dictado" : "Dictar por voz (español)"}
              aria-label={dictating ? "Detener dictado" : "Dictar por voz"}
              aria-pressed={dictating}
            >
              {dictating ? <MicOff className="size-4 animate-pulse" /> : <Mic className="size-4" />}
            </Button>
            {/* Modo agente (loops) */}
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "size-8 shrink-0 transition",
                agent
                  ? "bg-prism-violet/10 text-prism-violet hover:bg-prism-violet/15 hover:text-prism-violet"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={onToggleAgent}
              disabled={streaming}
              title="Modo agente: bucle plan → ejecutar → revisar"
              aria-label="Modo agente"
              aria-pressed={!!agent}
            >
              <IterationCw className="size-4" />
            </Button>

            <textarea
              ref={ref}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={keyDown}
              onPaste={onPaste}
              placeholder={placeholder}
              rows={1}
              disabled={disabled}
              className="max-h-[200px] min-h-[40px] min-w-0 flex-1 resize-none bg-transparent px-1.5 py-2 text-[16px] leading-relaxed outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed sm:text-sm"
            />
            {streaming ? (
              <Button
                size="icon"
                onClick={onStop}
                className="size-9 shrink-0 rounded-xl border border-border bg-card text-foreground hover:bg-muted"
                title="Detener"
                aria-label="Detener generación"
              >
                <Square className="size-4 fill-current" />
              </Button>
            ) : (
              <Button
                size="icon"
                onClick={onSend}
                disabled={!canSend}
                className="prism-gradient-bg size-9 shrink-0 rounded-xl border-0 text-white shadow-md shadow-violet-500/20 hover:opacity-90 disabled:opacity-40"
                title="Enviar (Enter)"
                aria-label="Enviar mensaje"
              >
                <ArrowUp className="size-4" />
              </Button>
            )}
          </div>
        </div>
        <p className="mt-1.5 hidden text-center text-[11px] text-muted-foreground/60 sm:block">
          Enter para enviar · Shift+Enter nueva línea · Pega imágenes · El botón ⟳ activa el agente con bucles · El micrófono dicta por voz · Tus claves nunca salen de tu dispositivo
        </p>
      </div>
    </div>
  );
}
