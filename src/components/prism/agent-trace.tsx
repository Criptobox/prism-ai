"use client";
/** Prism AI — Línea de tiempo del modo agente (rediseño v3.16).
 *
 * Antes (v3.15): el plan, las iteraciones y las revisiones se mostraban
 * de golpe en una lista de `<details>` sin orden claro. El estado del
 * bucle y el botón «Continuar» vivían en `message.tsx`, separados.
 *
 * Ahora (v3.16): todo el trabajo del agente se organiza en pestañas
 * (Plan · Estructura · Edits · Resultados) que se ven como en apps
 * tipo Cursor/Windsurf: la activa con fondo púrpura sólido, el logo
 * de Prism como marca del agente, un spinner animado mientras
 * genera, y debajo de las pestañas el estado del bucle + el botón
 * «Continuar el agente».
 *
 * El diseño sigue el medio color del tema (fondo `bg-card/80` con
 * acento `prism-violet`), usa el icono oficial del proyecto y el
 * símbolo de carga en movimiento (`Loader2` con `animate-spin`).
 */
import { useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  FileCode2,
  FolderTree,
  Loader2,
  Play,
  RefreshCcw,
  ScanSearch,
  Sparkles,
  ListChecks,
} from "lucide-react";
import { Markdown } from "./markdown";
import { PrismLogo } from "./logo";
import { cn } from "@/lib/utils";
import type { AgentTrace, AgentStepBlock, AgentReviewBlock } from "@/lib/prism/agent-loop";
import type { StalledInfo } from "@/lib/prism/agent-loop";

const BODY_LIMIT = 6000;
const ANSWER_LIMIT = 8000;

/** Texto largo con «Mostrar todo» (protege de bucles degenerados del modelo) */
function ClampText({ text, limit = BODY_LIMIT }: { text: string; limit?: number }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > limit;
  const shown = long && !expanded ? text.slice(0, limit) : text;
  return (
    <div>
      <Markdown content={shown} />
      {long && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 rounded-lg border border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground transition hover:bg-muted"
        >
          {expanded
            ? "Mostrar menos"
            : `Mostrar todo (${text.length.toLocaleString("es")} caracteres)`}
        </button>
      )}
    </div>
  );
}

/** Agrupa steps+reviews en iteraciones del bucle */
interface Iteration {
  step: AgentStepBlock;
  review?: AgentReviewBlock;
}

function groupIterations(trace: AgentTrace): {
  iterations: Iteration[];
  plan: AgentTrace["blocks"][number] | undefined;
  answer: string | undefined;
} {
  const plan = trace.blocks.find((b) => b.kind === "plan");
  const answer = trace.blocks.find((b) => b.kind === "answer");
  const iterations: Iteration[] = [];
  for (const b of trace.blocks) {
    if (b.kind === "step") iterations.push({ step: b });
    else if (b.kind === "review" && iterations.length && !iterations[iterations.length - 1].review) {
      iterations[iterations.length - 1].review = b;
    }
  }
  return { iterations, plan, answer: answer?.kind === "answer" ? answer.body : undefined };
}

/** Extrae los bloques de código ```lang de un texto (para la pestaña Edits).
 * Incluye el nombre de archivo si el modelo lo escribió en la línea de
 * apertura del bloque (```html aurora.html). */
function extractCodeBlocks(text: string): { lang: string; filename?: string; code: string }[] {
  const blocks: { lang: string; filename?: string; code: string }[] = [];
  // ```lang archivo.ext  o  ```lang  o  ``` archivo.ext  o  ```
  const re = /```(\w[\w+-]*)?(?:\s+([^\s]+))?\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const lang = m[1] ?? "text";
    const filename = m[2] && !m[2].match(/^[a-z]+$/) ? m[2] : undefined;
    blocks.push({ lang, filename, code: m[3] });
  }
  return blocks;
}

/** Bloque de código con header (lenguaje + nombre de archivo + Copiar)
 * para la pestaña Edits. Mismo estilo que el `CodeBlock` del Markdown
 * principal, pero sin depender de highlight.js (el agente ya escribe
 * poco código por step; el resaltado sería ruido). */
function CodeBlockAgent({ lang, filename, code }: { lang: string; filename?: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* portapapeles no disponible */
    }
  };
  return (
    <div className="group/code overflow-hidden rounded-lg border border-border/70 bg-[#0B0E17] text-[#E6E9F2] shadow-sm">
      <div className="flex items-center justify-between border-b border-white/[0.07] bg-white/[0.03] px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <FileCode2 className="size-3.5 shrink-0 text-prism-cyan" />
          {filename && (
            <span className="truncate font-mono text-[11px] text-white/70">{filename}</span>
          )}
          <span className="font-mono text-[10px] uppercase tracking-wider text-white/40">
            {lang}
          </span>
        </div>
        <button
          onClick={copy}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] text-white/55 transition hover:bg-white/10 hover:text-white"
          aria-label="Copiar código"
        >
          {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 py-2.5 text-[12px] leading-relaxed">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}

/** Parsea el project-map del agente (si lo emitió) para la pestaña Estructura. */
function parseMapJson(json: string | undefined): { name: string; kind: string; summary: string }[] | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as { files?: { name: string; kind?: string; summary?: string }[] };
    if (!Array.isArray(parsed.files)) return null;
    return parsed.files.map((f) => ({ name: f.name, kind: f.kind ?? "archivo", summary: f.summary ?? "" }));
  } catch {
    return null;
  }
}

type Tab = "plan" | "estructura" | "edits" | "resultados";

export interface AgentTraceViewProps {
  trace: AgentTrace;
  streaming?: boolean;
  /** Si el agente se quedó a medias y hay botón «Continuar». */
  stalled?: StalledInfo | null;
  /** Callback del botón «Continuar el agente». */
  onContinue?: () => void;
}

export function AgentTraceView({
  trace,
  streaming,
  stalled,
  onContinue,
}: AgentTraceViewProps) {
  const { iterations, plan, answer } = useMemo(() => groupIterations(trace), [trace]);
  const mapJson = useMemo(() => trace.mapJson, [trace]);
  const files = useMemo(() => parseMapJson(mapJson), [mapJson]);
  const codeBlocksByIteration = useMemo(
    () => iterations.map((it) => ({ n: it.step.n, title: it.step.title, blocks: extractCodeBlocks(it.step.body) })),
    [iterations]
  );
  const hasCode = codeBlocksByIteration.some((c) => c.blocks.length > 0);

  // Pestaña activa por defecto: Resultados si hay answer, si no Plan.
  const [tab, setTab] = useState<Tab>("resultados");

  // Si no hay nada que mostrar en una pestaña, se oculta.
  const hasPlan = !!(plan && plan.kind === "plan" && plan.items.length > 0);
  const hasEstructura = !!(files && files.length > 0);
  const hasEdits = hasCode;
  const hasResultados = !!(answer || iterations.length > 0);

  // Si la pestaña activa no tiene contenido, cae a la primera con contenido.
  const effectiveTab: Tab =
    tab === "plan" && !hasPlan
      ? hasEstructura
        ? "estructura"
        : hasEdits
          ? "edits"
          : "resultados"
      : tab === "estructura" && !hasEstructura
        ? hasResultados
          ? "resultados"
          : "plan"
        : tab === "edits" && !hasEdits
          ? "resultados"
          : tab;

  return (
    <div className="agent-trace-v316 space-y-2">
      {/* ── Cabecera: marca del agente + estado ── */}
      <div className="agent-trace-header flex items-center gap-2">
        <PrismLogo size={18} className="text-prism-violet" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-prism-violet">
          Bucle del agente
        </span>
        {streaming && (
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin text-prism-cyan" />
            <span className="stream-dots">Generando</span>
          </span>
        )}
      </div>

      {/* ── Pestañas ── */}
      <div
        role="tablist"
        aria-label="Fases del agente"
        className="flex gap-0.5 rounded-xl border border-border/60 bg-card/60 p-0.5"
      >
        {hasPlan && (
          <TabButton active={effectiveTab === "plan"} onClick={() => setTab("plan")} icon={<ListChecks className="size-3.5" />}>
            Plan
          </TabButton>
        )}
        {hasEstructura && (
          <TabButton active={effectiveTab === "estructura"} onClick={() => setTab("estructura")} icon={<FolderTree className="size-3.5" />}>
            Estructura
          </TabButton>
        )}
        {hasEdits && (
          <TabButton active={effectiveTab === "edits"} onClick={() => setTab("edits")} icon={<FileCode2 className="size-3.5" />}>
            Edits
          </TabButton>
        )}
        {hasResultados && (
          <TabButton active={effectiveTab === "resultados"} onClick={() => setTab("resultados")} icon={<Sparkles className="size-3.5" />}>
            Resultados
          </TabButton>
        )}
      </div>

      {/* ── Contenido de la pestaña activa ── */}
      <div className="min-h-0 rounded-xl border border-border/40 bg-card/40 px-3.5 py-2.5">
        {effectiveTab === "plan" && hasPlan && plan?.kind === "plan" && (
          <ul className="space-y-1">
            {plan.items.map((item, i) => (
              <li key={i} className="flex gap-2 text-[13px] leading-snug">
                <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-prism-violet/60" />
                <span className="min-w-0">{item}</span>
              </li>
            ))}
          </ul>
        )}

        {effectiveTab === "estructura" && files && (
          <ul className="space-y-1.5">
            {files.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-[12.5px]">
                <FileCode2 className="mt-0.5 size-3.5 shrink-0 text-prism-cyan" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{f.name}</p>
                  {f.summary && <p className="truncate text-muted-foreground">{f.summary}</p>}
                </div>
                <span className="ml-auto shrink-0 rounded-md bg-prism-violet/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-prism-violet">
                  {f.kind}
                </span>
              </li>
            ))}
          </ul>
        )}

        {effectiveTab === "edits" && (
          <div className="space-y-3">
            {codeBlocksByIteration.map((c, i) =>
              c.blocks.length === 0 ? null : (
                <div key={i} className="space-y-2">
                  <div className="flex items-center gap-2 px-0.5">
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-prism-cyan/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-prism-cyan">
                      <RefreshCcw className="size-3" /> iteración {c.n ?? i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium">
                      {c.title || "Ejecutando…"}
                    </span>
                  </div>
                  {c.blocks.map((b, j) => (
                    <CodeBlockAgent key={j} lang={b.lang} filename={b.filename} code={b.code} />
                  ))}
                </div>
              )
            )}
          </div>
        )}

        {effectiveTab === "resultados" && (
          <div className="space-y-2">
            {answer && <ClampText text={answer} limit={ANSWER_LIMIT} />}
            {!answer && iterations.length > 0 && (
              <ul className="space-y-1.5">
                {iterations.map((it, i) => {
                  const n = it.step.n || i + 1;
                  const running = streaming && it.step.open;
                  return (
                    <li key={i} className="flex items-start gap-2 text-[12.5px]">
                      {running ? (
                        <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-prism-cyan" />
                      ) : it.review?.pass ? (
                        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                      ) : it.review ? (
                        <RefreshCcw className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                      ) : (
                        <span className="mt-1 size-1.5 shrink-0 rounded-full bg-prism-violet/60" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          <span className="text-muted-foreground">#{n}</span> {it.step.title || "Ejecutando…"}
                        </p>
                        {it.review && (
                          <p
                            className={cn(
                              "truncate text-[11.5px]",
                              it.review.pass
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-amber-600 dark:text-amber-400"
                            )}
                          >
                            {it.review.pass ? "Revisión superada" : "Revisión pendiente"}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {!answer && iterations.length === 0 && streaming && (
              <p className="flex items-center gap-2 text-[12.5px] text-muted-foreground italic">
                <Loader2 className="size-3.5 animate-spin" /> El agente está organizando el plan…
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Estado del bucle + botón Continuar ── */}
      {!streaming && stalled?.stalled && onContinue && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/[0.07] px-3 py-2">
          <ScanSearch className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="min-w-0 flex-1 text-[12px]">
            {stalled.reason === "revision-pendiente"
              ? "Bucle del agente · revisión pendiente"
              : stalled.reason === "cortado"
                ? "La respuesta se cortó a mitad. El trabajo se puede retomar donde quedó."
                : "El agente no cerró el trabajo con una respuesta final."}
          </span>
          <button
            onClick={onContinue}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-[12px] font-medium text-foreground transition hover:bg-muted"
          >
            <Play className="size-3" /> Continuar el agente
          </button>
        </div>
      )}

      {/* Bloques de texto sueltos (intros del modelo fuera de etiquetas) */}
      {trace.blocks
        .filter((b) => b.kind === "text")
        .map((b, i) => (
          <div key={`text-${i}`} className="text-sm text-muted-foreground">
            <Markdown content={b.kind === "text" ? b.body : ""} />
          </div>
        ))}
    </div>
  );
}

/** Botón de pestaña. La activa lleva fondo púrpura sólido (como en el screenshot). */
function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition",
        active
          ? "bg-prism-violet text-white shadow-sm"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </button>
  );
}

/** Respuesta final del agente (dentro de la burbuja normal) */
export function AgentAnswer({ body }: { body: string }) {
  if (!body) return null;
  return (
    <div className="mt-2 flex gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] px-3.5 py-2.5 text-sm">
      <Sparkles className="mt-0.5 size-4 shrink-0 text-emerald-500" />
      <div className="min-w-0 flex-1">
        <ClampText text={body} limit={ANSWER_LIMIT} />
      </div>
    </div>
  );
}
