"use client";
/** Prism AI — Burbuja de mensaje (con soporte de modo agente: bucles) */
import { memo, useMemo, useState } from "react";
import { AlertCircle, Brain, Check, Copy, Pencil, RefreshCw, Trash2, User, Volume2, VolumeX } from "lucide-react";
import { Markdown } from "./markdown";
import { PrismLogo } from "./logo";
import { AgentAnswer, AgentTraceView } from "./agent-trace";
import type { ChatMessage } from "@/lib/prism/types";
import { MAX_RENDER_CHARS, splitModelKey, speechState } from "@/lib/prism/types";
import { parseAgentTrace } from "@/lib/prism/agent-loop";
import { speak, stopSpeaking } from "@/lib/prism/speech";
import { PROVIDER_MAP } from "@/lib/prism/providers";
import { cn } from "@/lib/utils";

/** Detecta bucles degenerados del modelo (mismo fragmento repetido sin fin) */
function looksDegenerate(text: string): boolean {
  if (text.length < 2000) return false;
  const tail = text.slice(-800);
  return /(.{2,40}?)\1{4,}$/.test(tail);
}

function modelLabel(modelKey?: string): string {
  if (!modelKey) return "";
  const split = splitModelKey(modelKey);
  if (!split) return "";
  const def = PROVIDER_MAP[split.providerId];
  return `${def?.name ?? split.providerId} · ${split.modelId}`;
}

export const MessageItem = memo(function MessageItem({
  msg,
  streaming,
  isLastAssistant,
  onRegenerate,
  onDelete,
  onEdit,
}: {
  msg: ChatMessage;
  streaming?: boolean;
  isLastAssistant?: boolean;
  onRegenerate?: () => void;
  onDelete?: () => void;
  onEdit?: (content: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(msg.content);
  const [expanded, setExpanded] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const isUser = msg.role === "user";

  // Modo agente: si la respuesta usa el bucle plan→ejecutar→revisar, se renderiza
  // como línea de tiempo de iteraciones en vez de markdown crudo
  const trace = useMemo(() => parseAgentTrace(msg.content), [msg.content]);

  // Protección frente a bucles degenerados: recorta lo que se renderiza
  const tooLong = msg.content.length > MAX_RENDER_CHARS;
  const degenerate = !streaming && looksDegenerate(msg.content);
  const shown = tooLong && !expanded ? msg.content.slice(0, MAX_RENDER_CHARS) : msg.content;
  const reasoningShown = msg.reasoning && msg.reasoning.length > 4000 && !expanded
    ? msg.reasoning.slice(0, 4000) + "…"
    : msg.reasoning;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };

  /** Lee la respuesta en voz alta o detiene la lectura en curso */
  const toggleSpeak = () => {
    if (speaking) {
      stopSpeaking();
      if (speechState.msgId === msg.id) speechState.msgId = null;
      setSpeaking(false);
      return;
    }
    speechState.msgId = msg.id;
    setSpeaking(true);
    speak({
      text: msg.content,
      onEnd: () => {
        if (speechState.msgId === msg.id) speechState.msgId = null;
        setSpeaking(false);
      },
    });
  };

  if (isUser) {
    return (
      <div className="msg-in group flex flex-col items-end gap-1">
        <div className="flex max-w-[85%] items-end gap-2 sm:max-w-[78%]">
          {editing ? (
            <div className="flex w-full min-w-[260px] flex-col gap-2 rounded-2xl border border-prism-violet/40 bg-card p-3">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                className="w-full resize-none bg-transparent text-sm outline-none"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button
                  className="rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
                  onClick={() => {
                    setEditing(false);
                    setDraft(msg.content);
                  }}
                >
                  Cancelar
                </button>
                <button
                  className="rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground hover:opacity-90"
                  onClick={() => {
                    setEditing(false);
                    if (draft.trim() && draft !== msg.content) onEdit?.(draft.trim());
                  }}
                >
                  Guardar y reenviar
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Miniaturas de imágenes adjuntas */}
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5 sm:max-w-[78%]">
                  {msg.attachments.map((a) => (
                    <a key={a.id} href={a.dataUrl} target="_blank" rel="noreferrer" title={a.name}>
                      <img
                        src={a.dataUrl}
                        alt={a.name}
                        className="size-24 rounded-xl border border-border/60 object-cover shadow-sm"
                      />
                    </a>
                  ))}
                </div>
              )}
              <div className="rounded-2xl rounded-br-md bg-[linear-gradient(135deg,color-mix(in_oklab,var(--prism-violet)_88%,black),color-mix(in_oklab,var(--prism-cyan)_72%,black))] px-4 py-2.5 text-sm leading-relaxed text-white shadow-md shadow-violet-500/10">
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
              </div>
              <div className="mb-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                <User className="size-3.5" />
              </div>
            </>
          )}
        </div>
        {!editing && (
          <div className="msg-actions flex gap-0.5 pr-9 opacity-0 transition group-hover:opacity-100">
            <IconBtn label="Copiar" onClick={copy}>
              {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
            </IconBtn>
            <IconBtn label="Editar" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" />
            </IconBtn>
            <IconBtn label="Eliminar" onClick={onDelete}>
              <Trash2 className="size-3.5" />
            </IconBtn>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="msg-in group flex gap-2.5">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-border/60 bg-card">
        <PrismLogo size={17} className={cn(streaming && "generating")} />
      </div>
      <div className="min-w-0 max-w-[88%] flex-1 sm:max-w-[82%]">
        {msg.error ? (
          <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <p className="whitespace-pre-wrap break-words">{msg.content}</p>
          </div>
        ) : (
          <>
            {reasoningShown && (
              <details className="mb-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
                <summary className="flex cursor-pointer select-none items-center gap-1.5 py-1">
                  <Brain className="size-3.5" />
                  Razonamiento del modelo
                </summary>
                <p className="max-h-64 overflow-y-auto whitespace-pre-wrap py-1.5 pl-5 leading-relaxed">
                  {reasoningShown}
                </p>
              </details>
            )}
            {degenerate && (
              <div className="mb-2 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11.5px] text-amber-600 dark:text-amber-400">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                <p>
                  Esta respuesta entró en un bucle repetitivo del modelo. Pulsa «Regenerar» o cambia de
                  modelo para obtener una mejor respuesta.
                </p>
              </div>
            )}
            <div
              className={cn(
                "rounded-2xl rounded-tl-md border border-border/50 bg-card/80 px-4 py-3 text-sm shadow-sm",
                streaming && !msg.content && msg.reasoning && "text-muted-foreground"
              )}
            >
              {msg.content ? (
                trace.active ? (
                  <div className={streaming ? "stream-cursor-wrap" : ""}>
                    <AgentTraceView trace={trace} streaming={streaming} />
                    {(() => {
                      const ans = trace.blocks.find((b) => b.kind === "answer");
                      return ans && ans.kind === "answer" && ans.body ? (
                        <AgentAnswer body={ans.body} />
                      ) : null;
                    })()}
                  </div>
                ) : (
                <div className={streaming ? "stream-cursor-wrap" : ""}>
                  <Markdown content={shown} />
                  {tooLong && (
                    <button
                      onClick={() => setExpanded((v) => !v)}
                      className="mt-2 rounded-lg border border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground transition hover:bg-muted"
                    >
                      {expanded
                        ? "Mostrar menos"
                        : `Mostrar todo (${msg.content.length.toLocaleString("es")} caracteres)`}
                    </button>
                  )}
                </div>
                )
              ) : streaming ? (
                <p className="text-muted-foreground italic">
                  {msg.reasoning ? "Reflexionando…" : "Pensando…"}
                </p>
              ) : null}
            </div>
          </>
        )}
        <div className="mt-1 flex h-6 items-center gap-2">
          {msg.model && !streaming && (
            <span className="font-mono text-[10.5px] text-muted-foreground/70">{modelLabel(msg.model)}</span>
          )}
          {msg.elapsedMs != null && !streaming && (
            <span className="text-[10.5px] text-muted-foreground/50">
              {(msg.elapsedMs / 1000).toFixed(1)}s
            </span>
          )}
          {!streaming && msg.content && (
            <div className="msg-actions flex gap-0.5 opacity-0 transition group-hover:opacity-100">
              <IconBtn label={speaking ? "Detener lectura" : "Leer en voz alta"} onClick={toggleSpeak}>
                {speaking ? (
                  <VolumeX className="size-3.5 text-prism-violet" />
                ) : (
                  <Volume2 className="size-3.5" />
                )}
              </IconBtn>
              <IconBtn label="Copiar respuesta" onClick={copy}>
                {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
              </IconBtn>
              {isLastAssistant && onRegenerate && (
                <IconBtn label="Regenerar" onClick={onRegenerate}>
                  <RefreshCw className="size-3.5" />
                </IconBtn>
              )}
              <IconBtn label="Eliminar" onClick={onDelete}>
                <Trash2 className="size-3.5" />
              </IconBtn>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

function IconBtn({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="rounded-md p-1.5 text-muted-foreground/70 transition hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}
