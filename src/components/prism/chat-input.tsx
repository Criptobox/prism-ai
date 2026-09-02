"use client";
/** Prism AI — Entrada de mensajes con adjuntos, documentos, hojas de cálculo,
 * comandos slash, modo imagen, biblioteca, skills, modo agente y dictado por voz.
 *
 * Las seis herramientas extra no caben al lado del texto: en el móvil el campo
 * se partía («Escribe tu men…») y el botón de enviar desaparecía. Van detrás
 * de una presilla (+) a la izquierda: al tocarla salen adjuntar, prompts,
 * skills, voz, agente e imagen.
 *
 * Escribe «/» al principio y sale el menú de comandos (filtra en vivo, se
 * maneja con flechas + Enter + Esc). */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  BookOpen,
  FileText,
  ImagePlus,
  ImageIcon,
  IterationCw,
  Mic,
  MicOff,
  Plus,
  Puzzle,
  Square,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { startDictation, speechToTextSupported } from "@/lib/prism/speech";
import { usePrism } from "@/lib/prism/store";
import { calcularHud, fmtTokens, type NivelCtx } from "@/lib/prism/ctx-hud";
import { SlashMenu } from "./slash-menu";
import {
  filterSlash,
  moveSlashIndex,
  slashQuery,
  type SlashCommand,
} from "@/lib/prism/slash";
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
  consensus,
  onToggleConsensus,
  imageMode,
  onToggleImageMode,
  docs = [],
  onRemoveDoc,
  onSlashCommand,
  hudCtx,
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
  /** Consenso: varios modelos responden y uno combina lo mejor */
  consensus?: boolean;
  onToggleConsensus?: () => void;
  /** modo imagen: genera imágenes en vez de chatear */
  imageMode?: boolean;
  onToggleImageMode?: () => void;
  /** documentos adjuntos con texto extraído (PDF, TXT, CSV, XLSX…) */
  docs?: DocText[];
  onRemoveDoc?: (id: string) => void;
  /** el usuario eligió un comando del menú de «/» */
  onSlashCommand?: (cmd: SlashCommand) => void;
  /** HUD de contexto (v3.32): tokens estimados de la conversación y
   * ventana de referencia, para verlo ANTES de enviar y no después
   * de gastarlo. Sin valor, no se pinta. */
  hudCtx?: { tokens: number; ventana: number };
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dictating, setDictating] = useState(false);
  const dictationRef = useRef<{ stop: () => void } | null>(null);
  /** texto del input acumulado (base + fragmentos finales reconocidos) */
  const baseRef = useRef("");
  const [toolsOpen, setToolsOpen] = useState(false);

  // ——— Comandos slash ———
  /** se cierra con Esc sin borrar el texto: reabre al volver a tocar la barra */
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);

  const slashRaw = slashQuery(value);
  const slashMatches = useMemo(
    () => (slashRaw === null ? [] : filterSlash(slashRaw)),
    [slashRaw]
  );
  const slashOpen = slashRaw !== null && !slashDismissed && !streaming && !disabled;

  // al cambiar lo tecleado, la selección vuelve arriba
  useEffect(() => {
    setSlashIndex(0);
  }, [slashRaw]);

  // en cuanto deja de haber barra, el Esc previo se olvida
  useEffect(() => {
    if (slashRaw === null) setSlashDismissed(false);
  }, [slashRaw]);

  const runSlash = useCallback(
    (cmd: SlashCommand) => {
      setSlashDismissed(false);
      if (cmd.kind === "plantilla" && cmd.template) {
        onChange(cmd.template);
      } else {
        onChange("");
      }
      onSlashCommand?.(cmd);
      requestAnimationFrame(() => ref.current?.focus());
    },
    [onChange, onSlashCommand]
  );

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
    setToolsOpen(true);
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
    // Con el menú de comandos abierto, las flechas y Enter son suyos
    if (slashOpen && slashMatches.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIndex((i) => moveSlashIndex(i, e.key === "ArrowDown" ? 1 : -1, slashMatches.length));
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing)) {
        e.preventDefault();
        runSlash(slashMatches[Math.min(slashIndex, slashMatches.length - 1)]);
        return;
      }
    }
    if (slashOpen && e.key === "Escape") {
      e.preventDefault();
      setSlashDismissed(true);
      return;
    }
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
  const hayModo = !!(agent || imageMode || dictating || consensus);

  const outputStyle = usePrism((st) => st.settings.outputStyle);
  const setSettings = usePrism((st) => st.setSettings);
  const ESTILOS = [
    { v: "normal" as const, label: "Normal", hint: "Equilibrado" },
    { v: "conciso" as const, label: "Conciso", hint: "Sin relleno ni preámbulos" },
    { v: "detallado" as const, label: "Detallado", hint: "Explica el razonamiento paso a paso" },
  ];

  return (
    <div className="safe-bottom pointer-events-auto sticky bottom-0 z-10 px-3 pb-3 pt-2 sm:px-6">
      <div className="mx-auto max-w-3xl">
        {slashOpen && (
          <SlashMenu
            commands={slashMatches}
            index={Math.min(slashIndex, Math.max(0, slashMatches.length - 1))}
            onPick={runSlash}
            onHover={setSlashIndex}
          />
        )}
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

          {/* Miniaturas de imágenes adjuntas.
              Estas son imágenes recién añadidas que aún no se han enviado:
              `fileToAttachment` las devuelve con `dataUrl` ya relleno, así
              que no hace falta resolverlas desde IndexedDB aquí. */}
          {hasAttachments && (
            <div className="flex gap-2 overflow-x-auto px-1 pb-0.5 pt-1">
              {attachments.map((a) => (
                <div key={a.id} className="group relative shrink-0">
                  {a.dataUrl ? (
                    <img
                      src={a.dataUrl}
                      alt={a.name}
                      className="size-16 rounded-lg border border-border/60 object-cover"
                    />
                  ) : (
                    <div
                      className="size-16 animate-pulse rounded-lg border border-border/60 bg-muted/60"
                      aria-label={a.name}
                    />
                  )}
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

          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf,.zip,.txt,.md,.csv,.tsv,.xlsx,.xls,.js,.mjs,.cjs,.ts,.tsx,.jsx,.html,.htm,.css,.scss,.json,.xml,.yml,.yaml,.toml,.ini,.py,.rb,.php,.java,.kt,.go,.rs,.c,.h,.cpp,.cs,.swift,.sh,.sql,.vue,.svelte,.log,.diff,.patch,text/csv,text/tab-separated-values,application/zip,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) onAttach?.(files);
              e.target.value = "";
            }}
          />

          {toolsOpen && (
            <div
              id="prism-chat-tools"
              className="flex gap-0.5 overflow-x-auto px-0.5"
              role="toolbar"
              aria-label="Opciones del chat"
            >
              <Tool
                caption="Adjuntar"
                label="Adjuntar archivos, código o un ZIP"
                title="Imágenes, PDF, código, hojas de cálculo y ZIP (un ZIP se abre entero aquí; nada sale de tu dispositivo)"
                disabled={streaming || disabled}
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlus className="size-4" />
              </Tool>
              <Tool
                caption="Prompts"
                label="Abrir biblioteca de prompts"
                title="Biblioteca de prompts"
                disabled={streaming}
                onClick={onOpenLibrary}
              >
                <BookOpen className="size-4" />
              </Tool>
              <Tool
                caption="Skills"
                label="Abrir skills"
                title="Skills"
                disabled={streaming}
                onClick={onOpenSkills}
              >
                <Puzzle className="size-4" />
              </Tool>
              <Tool
                caption={dictating ? "Parar" : "Voz"}
                label={dictating ? "Detener dictado" : "Dictar por voz"}
                title={dictating ? "Detener dictado" : "Dictar por voz (español)"}
                disabled={streaming}
                pressed={dictating}
                activeClass="bg-red-500/10 text-red-500 hover:bg-red-500/15 hover:text-red-500"
                onClick={toggleDictation}
              >
                {dictating ? <MicOff className="size-4 animate-pulse" /> : <Mic className="size-4" />}
              </Tool>
              <Tool
                caption="Agente"
                label="Modo agente"
                title="Modo agente: bucle plan → ejecutar → revisar"
                disabled={streaming}
                pressed={!!agent}
                activeClass="bg-prism-violet/10 text-prism-violet hover:bg-prism-violet/15 hover:text-prism-violet"
                onClick={onToggleAgent}
              >
                <IterationCw className="size-4" />
              </Tool>
              <Tool
                caption="Consenso"
                label="Modo consenso"
                title="Consenso: varios modelos responden a la vez y uno combina lo mejor de todos"
                disabled={streaming}
                pressed={!!consensus}
                activeClass="bg-prism-cyan/10 text-prism-cyan hover:bg-prism-cyan/15 hover:text-prism-cyan"
                onClick={onToggleConsensus}
              >
                <Users className="size-4" />
              </Tool>
              <Tool
                caption="Imagen"
                label="Modo imagen"
                title="Modo imagen: describe lo que quieres ver y se generará (gratis, sin clave)"
                disabled={streaming}
                pressed={!!imageMode}
                activeClass="bg-prism-pink/10 text-prism-pink hover:bg-prism-pink/15 hover:text-prism-pink"
                onClick={onToggleImageMode}
              >
                <ImageIcon className="size-4" />
              </Tool>
            </div>
          )}

          <div className="flex items-end gap-1.5">
            {/* Presilla: un toque y salen el resto de opciones. */}
            <button
              type="button"
              onClick={() => setToolsOpen((v) => !v)}
              aria-expanded={toolsOpen}
              aria-controls="prism-chat-tools"
              title={toolsOpen ? "Ocultar opciones" : "Más opciones: adjuntar, voz, agente, imagen…"}
              aria-label={toolsOpen ? "Ocultar opciones" : "Más opciones"}
              className={cn(
                "relative mb-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-card text-muted-foreground transition hover:bg-muted hover:text-foreground",
                toolsOpen && "border-prism-violet/40 bg-muted text-foreground",
                hayModo && "ring-2 ring-prism-violet/35"
              )}
            >
              <Plus className={cn("size-4 transition-transform duration-200", toolsOpen && "rotate-45")} />
              {hayModo && (
                <span className="absolute right-1 top-1 flex gap-0.5">
                  {agent && <span className="size-1.5 rounded-full bg-prism-violet" />}
                  {imageMode && <span className="size-1.5 rounded-full bg-prism-pink" />}
                  {consensus && <span className="size-1.5 rounded-full bg-prism-cyan" />}
                  {dictating && <span className="size-1.5 animate-pulse rounded-full bg-red-500" />}
                </span>
              )}
            </button>
            <textarea
              ref={ref}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={keyDown}
              onPaste={onPaste}
              placeholder={placeholder}
              rows={1}
              disabled={disabled}
              aria-controls={slashOpen ? "prism-slash-menu" : undefined}
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
        {/* Estilo de salida, aquí y no en Ajustes.
         *
         * Es lo que más se cambia sobre la marcha —una respuesta la quieres
         * corta y la siguiente explicada—, y estaba en un diálogo a tres
         * clics. Aquí se cambia sin salir de lo que estás escribiendo. */}
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <p className="hidden min-w-0 flex-1 truncate text-[11px] text-muted-foreground/60 sm:block">
              Enter envía · «/» abre los comandos · Pega un enlace de GitHub para abrirlo
            </p>
            {/* HUD de contexto (v3.32): estimación honesta (≈, chars/4) contra
             * una ventana de REFERENCIA ajustable en Ajustes — no un dato del
             * proveedor. Se pinta con la conversación ya empezada. */}
            {hudCtx && hudCtx.tokens > 0 && (
              <HudCtx tokens={hudCtx.tokens} ventana={hudCtx.ventana} />
            )}
          </div>
          <div
            role="radiogroup"
            aria-label="Estilo de respuesta"
            className="flex shrink-0 items-center gap-0.5 rounded-lg bg-muted/40 p-0.5"
          >
            {ESTILOS.map((e) => {
              const activo = outputStyle === e.v;
              return (
                <button
                  key={e.v}
                  type="button"
                  role="radio"
                  aria-checked={activo}
                  onClick={() => setSettings({ outputStyle: e.v })}
                  title={e.hint}
                  className={cn(
                    "rounded-md px-2 py-1 text-[10.5px] font-medium transition",
                    activo
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {e.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Medidor de contexto del compositor (idea D4 del PLAN-V7).
 *
 * Tres estados (ok / aviso ≥80% / rojo ≥95%) con el mismo lenguaje visual
 * que los chips de estado de la cabecera. El título explica qué es la
 * cifra y dónde se ajusta la ventana, para que nadie tome un «62%» por
 * un dato medido del proveedor. */
function HudCtx({ tokens, ventana }: { tokens: number; ventana: number }) {
  const { pct, nivel } = calcularHud(tokens, ventana);
  const color: Record<NivelCtx, string> = {
    ok: "text-muted-foreground/70",
    aviso: "text-amber-500 dark:text-amber-400",
    rojo: "text-red-500 dark:text-red-400",
  };
  const barra: Record<NivelCtx, string> = {
    ok: "bg-prism-violet/60",
    aviso: "bg-amber-500",
    rojo: "bg-red-500",
  };
  const aviso =
    nivel === "rojo"
      ? " · casi lleno: hilo nuevo o resumen"
      : nivel === "aviso"
        ? " · considera comprimir"
        : "";
  return (
    <div
      className="flex shrink-0 items-center gap-1.5"
      title={`Contexto estimado de esta conversación (≈${fmtTokens(tokens)} tokens) contra tu ventana de referencia de ${fmtTokens(ventana)} tokens. Ajustable en Ajustes. Es una estimación local, no un dato del proveedor.${aviso}`}
      aria-label={`Contexto estimado: ${pct} por ciento de la ventana`}
    >
      <span className={cn("font-mono text-[10px] tabular-nums", color[nivel])}>
        ctx ≈{fmtTokens(tokens)} · {pct.toLocaleString("es")}%
      </span>
      <span
        aria-hidden="true"
        className="h-1 w-10 overflow-hidden rounded-full bg-muted"
      >
        <span
          className={cn("block h-full rounded-full transition-all", barra[nivel])}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </span>
    </div>
  );
}

function Tool({
  caption,
  label,
  title,
  onClick,
  disabled,
  pressed,
  activeClass,
  children,
}: {
  caption: string;
  label: string;
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  pressed?: boolean;
  activeClass?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={label}
      aria-pressed={pressed}
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-muted-foreground transition hover:bg-muted/80 hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
        pressed && (activeClass ?? "bg-muted text-foreground")
      )}
    >
      {children}
      <span className="text-[9.5px] font-medium leading-none">{caption}</span>
    </button>
  );
}
