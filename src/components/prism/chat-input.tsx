"use client";
/** Prism AI — Entrada de mensajes con adjuntos, documentos, modo imagen, biblioteca, skills, modo agente y dictado por voz */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  BookOpen,
  FileText,
  ImagePlus,
  ImageIcon,
  IterationCw,
  Mic,
  MicOff,
  Puzzle,
  Square,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { startDictation, speechToTextSupported } from "@/lib/prism/speech";
import type { Attachment, DocText } from "@/lib/prism/types";

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
  imageMode,
  onToggleImageMode,
  docs = [],
  onRemoveDoc,
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
  /** modo imagen: genera imágenes en vez de chatear */
  imageMode?: boolean;
  onToggleImageMode?: () => void;
  /** documentos adjuntos con texto extraído */
  docs?: DocText[];
  onRemoveDoc?: (id: string) => void;
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
  const hasDocs = docs.length > 0;
  const canSend = !streaming && !disabled && (value.trim().length > 0 || hasAttachments || hasDocs);

  return (
    <div className="safe-bottom pointer-events-auto sticky bottom-0 z-10 px-3 pb-3 pt-2 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div
          className={cn(
            "glass flex flex-col gap-1.5 rounded-2xl border border-border/80 p-2 shadow-lg shadow-black/[0.06] transition focus-within:border-prism-violet/50 dark:shadow-black/30",
            disabled && "opacity-60"
          )}
        >
          {/* Documentos adjuntos (PDF/TXT con texto extraído) */}
          {hasDocs && (
            <div className="flex gap-2 overflow-x-auto px-1 pb-0.5 pt-1">
              {docs.map((d) => (
                <div
                  key={d.id}
                  className="group relative flex shrink-0 items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-2.5 py-2"
                  title={`${d.name} · ${d.chars.toLocaleString("es")} caracteres extraídos`}
                >
                  <FileText className="size-4 text-prism-cyan" />
                  <div className="min-w-0">
                    <p className="max-w-[140px] truncate text-[11.5px] font-medium">{d.name}</p>
                    <p className="text-[10px] text-muted-foreground">{d.chars.toLocaleString("es")} car.</p>
                  </div>
                  <button
                    onClick={() => onRemoveDoc?.(d.id)}
                    aria-label={`Quitar ${d.name}`}
                    className="-mr-1 -mt-6 flex size-5 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm transition hover:bg-destructive hover:text-white"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

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

          {/* En pantallas estrechas el campo se lleva su propia línea: con seis
              botones al lado no le quedaba ancho y el texto se partía letra a letra. */}
          <div className="flex flex-wrap items-end gap-1.5">
            {/* Adjuntar imagen o PDF */}
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
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
              disabled={streaming || disabled}
              title="Adjuntar imágenes o PDF"
              aria-label="Adjuntar imágenes o PDF"
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
            {/* Modo imagen (generación con Pollinations, gratis y sin clave) */}
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "size-8 shrink-0 transition",
                imageMode
                  ? "bg-prism-pink/10 text-prism-pink hover:bg-prism-pink/15 hover:text-prism-pink"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={onToggleImageMode}
              disabled={streaming}
              title="Modo imagen: describe lo que quieres ver y se generará (gratis, sin clave)"
              aria-label="Modo imagen"
              aria-pressed={!!imageMode}
            >
              <ImageIcon className="size-4" />
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
              className="order-first max-h-[200px] min-h-[40px] w-full min-w-0 basis-full resize-none bg-transparent px-1.5 py-2 text-[16px] leading-relaxed outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed sm:order-none sm:w-auto sm:flex-1 sm:basis-auto sm:text-sm"
            />
            {streaming ? (
              <Button
                size="icon"
                onClick={onStop}
                className="ml-auto size-9 shrink-0 rounded-xl border border-border bg-card text-foreground hover:bg-muted sm:ml-0"
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
                className="prism-gradient-bg ml-auto size-9 shrink-0 rounded-xl border-0 text-white shadow-md shadow-violet-500/20 hover:opacity-90 disabled:opacity-40 sm:ml-0"
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
