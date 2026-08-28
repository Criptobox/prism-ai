"use client";
/** Prism AI — Línea de tiempo del modo agente: plan + iteraciones (bucles) + revisiones */
import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ListChecks,
  Loader2,
  RefreshCcw,
  Sparkles,
} from "lucide-react";
import { Markdown } from "./markdown";
import { cn } from "@/lib/utils";
import type { AgentTrace, AgentStepBlock, AgentReviewBlock } from "@/lib/prism/agent-loop";

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

function groupIterations(trace: AgentTrace): { iterations: Iteration[]; plan: AgentTrace["blocks"][number] | undefined; answer: string | undefined } {
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

export function AgentTraceView({
  trace,
  streaming,
}: {
  trace: AgentTrace;
  streaming?: boolean;
}) {
  const { iterations, plan, answer } = groupIterations(trace);

  return (
    <div className="space-y-2">
      {/* Plan */}
      {plan && plan.kind === "plan" && plan.items.length > 0 && (
        <div className="rounded-xl border border-prism-violet/30 bg-prism-violet/[0.06] px-3.5 py-2.5">
          <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-prism-violet">
            <ListChecks className="size-3.5" /> Plan del agente
          </p>
          <ul className="mt-1.5 space-y-1">
            {plan.items.map((item, i) => (
              <li key={i} className="flex gap-2 text-[13px] leading-snug">
                <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-prism-violet/60" />
                <span className="min-w-0">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Iteraciones del bucle */}
      {iterations.map((it, idx) => {
        const n = it.step.n || idx + 1;
        const running = streaming && it.step.open;
        return (
          <details
            key={idx}
            open={running || idx === iterations.length - 1}
            className="group overflow-hidden rounded-xl border border-border/60 bg-card/60"
          >
            <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2.5">
              <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-prism-cyan/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-prism-cyan">
                <RefreshCcw className={cn("size-3", running && "animate-spin")} />
                iteración {n}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                {it.step.title || "Ejecutando…"}
              </span>
              {running ? (
                <Loader2 className="size-3.5 shrink-0 animate-spin text-prism-cyan" />
              ) : it.review ? (
                it.review.pass ? (
                  <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
                ) : (
                  <RefreshCcw className="size-3.5 shrink-0 text-amber-500" />
                )
              ) : (
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition group-open:rotate-180" />
              )}
            </summary>
            {it.step.body && (
              <div className="border-t border-border/40 px-3.5 py-2.5 text-sm">
                <ClampText text={it.step.body} />
              </div>
            )}
            {it.review && (
              <div
                className={cn(
                  "flex items-start gap-2 border-t px-3.5 py-2 text-[11.5px] leading-relaxed",
                  it.review.pass
                    ? "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-700 dark:text-emerald-400"
                    : "border-amber-500/20 bg-amber-500/[0.07] text-amber-700 dark:text-amber-400"
                )}
              >
                {it.review.pass ? (
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
                ) : (
                  <RefreshCcw className="mt-0.5 size-3.5 shrink-0" />
                )}
                <p className="min-w-0">
                  <span className="font-semibold">
                    {it.review.pass ? "Revisión superada" : "Repetir bucle:"}
                  </span>{" "}
                  {it.review.notes}
                </p>
              </div>
            )}
          </details>
        );
      })}

      {/* Bloques de texto sueltos (intros del modelo fuera de etiquetas) */}
      {trace.blocks
        .filter((b) => b.kind === "text")
        .map((b, i) => (
          <div key={i} className="text-sm text-muted-foreground">
            <Markdown content={b.kind === "text" ? b.body : ""} />
          </div>
        ))}

      {/* Estado mientras genera */}
      {streaming && !answer && iterations.every((it) => !it.step.open) && !iterations.length && (
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground italic">
          <Loader2 className="size-3.5 animate-spin" /> El agente está organizando el plan…
        </p>
      )}
    </div>
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
