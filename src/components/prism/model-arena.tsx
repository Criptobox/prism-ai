"use client";
/** Prism AI — Arena: envía el mismo prompt a 2-3 modelos gratis en paralelo
 * y compara las respuestas lado a lado (tiempo, caracteres, contenido). */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Swords, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Markdown } from "./markdown";
import { ModelLogo } from "./model-logo";
import { streamChat } from "@/lib/prism/chat-client";
import { usePrism } from "@/lib/prism/store";
import { isFreeModel, KEYLESS_PROVIDERS } from "@/lib/prism/free-models";
import { splitModelKey } from "@/lib/prism/types";
import { splitThinkTags } from "@/lib/prism/thinking";
import type { ProviderId } from "@/lib/prism/types";
import { cn } from "@/lib/utils";

interface LaneState {
  text: string;
  reasoning: string;
  running: boolean;
  elapsedMs?: number;
  error?: string;
}

/** Modelos gratis de proveedores conectados, listos para la Arena */
function useArenaModels(): { key: string; label: string; providerId: ProviderId; modelId: string }[] {
  const providers = usePrism((s) => s.providers);
  return useMemo(() => {
    const out: { key: string; label: string; providerId: ProviderId; modelId: string }[] = [];
    for (const [pid, cfg] of Object.entries(providers) as [ProviderId, typeof providers[ProviderId]][]) {
      if (!cfg.enabled) continue;
      if (!cfg.apiKey.trim() && !KEYLESS_PROVIDERS.includes(pid)) continue;
      for (const m of cfg.models) {
        if (!isFreeModel(pid, m)) continue;
        out.push({ key: `${pid}::${m}`, label: m, providerId: pid, modelId: m });
      }
    }
    return out;
  }, [providers]);
}

export function ModelArenaDialog({
  open,
  onOpenChange,
  initialPrompt,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialPrompt?: string;
}) {
  const providers = usePrism((s) => s.providers);
  const settings = usePrism((s) => s.settings);
  const models = useArenaModels();
  const freeCount = models.length;

  const [prompt, setPrompt] = useState(initialPrompt ?? "");
  const [selected, setSelected] = useState<string[]>([]);
  const [lanes, setLanes] = useState<Record<string, LaneState>>({});
  const abortRef = useRef<AbortController | null>(null);

  // al abrir, sincroniza el prompt inicial (si viene del chat)
  useEffect(() => {
    if (open && initialPrompt) setPrompt(initialPrompt);
  }, [open, initialPrompt]);

  const running = Object.values(lanes).some((l) => l.running);

  const toggle = (key: string) =>
    setSelected((cur) =>
      cur.includes(key) ? cur.filter((k) => k !== key) : cur.length >= 3 ? cur : [...cur, key]
    );

  const run = useCallback(async () => {
    const text = prompt.trim();
    if (!text) {
      toast.error("Escribe el prompt a comparar");
      return;
    }
    if (selected.length < 2) {
      toast.error("Elige al menos 2 modelos");
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setLanes(Object.fromEntries(selected.map((k) => [k, { text: "", reasoning: "", running: true }])));

    await Promise.all(
      selected.map(async (key) => {
        const split = splitModelKey(key);
        if (!split) return;
        const cfg = providers[split.providerId];
        const startedAt = Date.now();
        let acc = "";
        try {
          await streamChat({
            providerId: split.providerId,
            config: cfg,
            modelId: split.modelId,
            messages: [{ role: "user", content: text }],
            settings: { ...settings, agentMode: false },
            signal: controller.signal,
            onDelta: (t) => {
              acc = t;
              const s = splitThinkTags(acc);
              setLanes((cur) => ({ ...cur, [key]: { ...(cur[key] ?? { reasoning: "" }), text: s.content, reasoning: s.reasoning, running: true } }));
            },
            onReasoning: (r) => {
              setLanes((cur) => ({ ...cur, [key]: { ...(cur[key] ?? { text: "" }), reasoning: r, running: true } }));
            },
            onDone: () => {},
          });
          setLanes((cur) => ({
            ...cur,
            [key]: { ...(cur[key] ?? { text: acc, reasoning: "" }), text: acc, running: false, elapsedMs: Date.now() - startedAt },
          }));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          setLanes((cur) => ({
            ...cur,
            [key]: { ...(cur[key] ?? { text: "", reasoning: "" }), text: acc, running: false, elapsedMs: Date.now() - startedAt, error: msg },
          }));
        }
      })
    );
    abortRef.current = null;
  }, [prompt, selected, providers, settings]);

  const close = () => {
    abortRef.current?.abort();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="flex h-[86vh] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:h-[680px]">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Swords className="size-4 text-prism-violet" /> Arena de modelos
            <span className="rounded-full bg-prism-violet/10 px-2 py-0.5 text-[10px] font-medium text-prism-violet">
              2-3 gratis a la vez
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            El mismo prompt va a todos los modelos elegidos en paralelo. Compara estilo, velocidad
            y calidad — cada respuesta gasta la cuota gratis de su proveedor.
          </DialogDescription>
        </DialogHeader>

        {freeCount < 2 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
            <p className="text-sm font-medium">Necesitas al menos 2 modelos gratis conectados</p>
            <p className="text-xs text-muted-foreground">
              Conecta AiHubMix, Gemini, Groq u OpenRouter (todos tienen capa gratuita) en Ajustes →
              Proveedores y vuelve.
            </p>
            <Button size="sm" variant="outline" className="mt-2 h-8 text-xs" onClick={close}>
              Cerrar
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-3 border-b px-5 py-3">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={2}
                placeholder="Prompt para todos los modelos… (ej. «Explícame qué es un closure en 3 frases»)"
                className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-prism-violet/50"
              />
              <div className="flex flex-wrap gap-1.5">
                {models.slice(0, 40).map((m) => {
                  const s = splitModelKey(m.key)!;
                  const checked = selected.includes(m.key);
                  return (
                    <label
                      key={m.key}
                      className={cn(
                        "flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] transition",
                        checked
                          ? "border-prism-violet bg-prism-violet/10 text-foreground"
                          : "border-border/60 text-muted-foreground hover:border-prism-violet/40"
                      )}
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggle(m.key)} className="size-3" />
                      <ModelLogo modelId={m.modelId} providerId={s.providerId} className="size-3.5" />
                      <span className="max-w-[220px] truncate">{m.label}</span>
                    </label>
                  );
                })}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">
                  {selected.length}/3 seleccionados
                </span>
                <div className="flex gap-2">
                  {running && (
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => abortRef.current?.abort()}>
                      <X className="mr-1 size-3.5" /> Detener
                    </Button>
                  )}
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    disabled={running || selected.length < 2 || !prompt.trim()}
                    onClick={() => void run()}
                  >
                    {running ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Swords className="mr-1 size-3.5" />}
                    Comparar
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto px-4 py-3 sm:grid-cols-2 lg:grid-cols-3">
              {selected.map((key) => {
                const lane = lanes[key];
                const split = splitModelKey(key)!;
                return (
                  <div key={key} className="flex min-h-0 flex-col rounded-xl border border-border/60 bg-card/40">
                    <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
                      <ModelLogo modelId={split.modelId} providerId={split.providerId} className="size-4" />
                      <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{split.modelId}</span>
                      {lane?.running && <Loader2 className="size-3.5 animate-spin text-prism-cyan" />}
                      {lane?.elapsedMs != null && !lane.running && (
                        <span className="text-[10.5px] text-muted-foreground">
                          {(lane.elapsedMs / 1000).toFixed(1)}s · {lane.text.length.toLocaleString("es")} car.
                        </span>
                      )}
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 text-[13px]">
                      {!lane ? (
                        <p className="text-xs text-muted-foreground">Esperando…</p>
                      ) : lane.error ? (
                        <p className="whitespace-pre-wrap text-xs text-destructive">{lane.error}</p>
                      ) : lane.text ? (
                        <Markdown content={lane.text} />
                      ) : (
                        <p className="text-xs italic text-muted-foreground">
                          {lane.reasoning ? "Reflexionando…" : "Generando…"}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
