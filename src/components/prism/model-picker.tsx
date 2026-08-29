"use client";
/** Prism AI — Selector de modelo con filtro «Solo gratis», modo Auto y salud (cooldowns) */
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, KeyRound, Search, Sparkles, Star, Timer, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { PROVIDERS } from "@/lib/prism/providers";
import { makeModelKey, splitModelKey, type ProviderId } from "@/lib/prism/types";
import { usePrism } from "@/lib/prism/store";
import { isFreeModel } from "@/lib/prism/free-models";
import { useHealth, cooldownRemaining } from "@/lib/prism/health";
import { AUTO_MODEL_KEY, isAutoKey } from "@/lib/prism/types";
import { ModelLogo } from "@/components/prism/model-logo";

interface ModelOption {
  key: string;
  providerId: ProviderId;
  modelId: string;
  providerName: string;
  color: string;
  free: boolean;
}

export function useAvailableModels(): ModelOption[] {
  const providers = usePrism((s) => s.providers);
  const favorites = usePrism((s) => s.favorites);
  const onlyFree = usePrism((s) => s.settings.onlyFree);
  return useMemo(() => {
    const build = (providerId: ProviderId, modelId: string): ModelOption | null => {
      const def = PROVIDERS.find((p) => p.id === providerId);
      if (!def) return null;
      const free = isFreeModel(providerId, modelId);
      if (onlyFree && !free) return null;
      return {
        key: makeModelKey(providerId, modelId),
        providerId,
        modelId,
        providerName: def.name,
        color: def.color,
        free,
      };
    };

    const out: ModelOption[] = [];
    const seen = new Set<string>();
    // favoritos primero
    for (const fk of favorites) {
      const split = splitModelKey(fk);
      if (!split) continue;
      const opt = build(split.providerId, split.modelId);
      if (!opt || seen.has(opt.key)) continue;
      seen.add(opt.key);
      out.push(opt);
    }
    for (const def of PROVIDERS) {
      const cfg = providers[def.id];
      if (!cfg?.enabled) continue;
      for (const m of cfg.models) {
        const opt = build(def.id, m);
        if (!opt || seen.has(opt.key)) continue;
        seen.add(opt.key);
        out.push(opt);
      }
    }
    return out;
  }, [providers, favorites, onlyFree]);
}

export function ModelPicker({
  value,
  onChange,
  className,
}: {
  value: string | null;
  onChange: (key: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const models = useAvailableModels();
  const healthEntries = useHealth((s) => s.entries);
  const lastGood = useHealth((s) => s.lastGood);
  const totalEnabled = usePrism((s) =>
    Object.values(s.providers)
      .filter((c) => c.enabled)
      .reduce((acc, c) => acc + c.models.length, 0)
  );
  // contador de segundos para los badges de cooldown mientras el picker está abierto
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [open]);
  const onlyFree = usePrism((s) => s.settings.onlyFree);
  const setSettings = usePrism((s) => s.setSettings);
  const favorites = usePrism((s) => s.favorites);
  const toggleFavorite = usePrism((s) => s.toggleFavorite);
  const [query, setQuery] = useState("");

  // Atajo global Ctrl+K: abre el selector (evento lanzado desde chat-app)
  useEffect(() => {
    const openPicker = () => setOpen(true);
    window.addEventListener("prism-open-model-picker", openPicker);
    return () => window.removeEventListener("prism-open-model-picker", openPicker);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? models.filter(
        (m) =>
          m.modelId.toLowerCase().includes(q) ||
          m.providerName.toLowerCase().includes(q)
      )
    : models;

  const selected = value ? models.find((m) => m.key === value) ?? null : null;
  // si el modelo seleccionado quedó fuera del filtro, muéstralo igualmente en el botón
  const selectedInfo = useMemo(() => {
    if (selected || !value) return selected;
    const split = splitModelKey(value);
    if (!split) return null;
    const def = PROVIDERS.find((p) => p.id === split.providerId);
    if (!def) return null;
    return {
      key: value,
      providerId: split.providerId,
      modelId: split.modelId,
      providerName: def.name,
      color: def.color,
      free: isFreeModel(split.providerId, split.modelId),
    } satisfies ModelOption;
  }, [selected, value]);

  const addCustom = () => {
    const qq = query.trim();
    if (!qq || !value) return;
    const split = splitModelKey(value);
    if (!split) return;
    const cfg = usePrism.getState().providers[split.providerId];
    if (cfg && !cfg.models.includes(qq)) {
      usePrism.getState().setProviderConfig(split.providerId, {
        models: [...cfg.models, qq],
      });
    }
    onChange(makeModelKey(split.providerId, qq));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            // «shrink» y «min-w-0» anulan el shrink-0 del botón base: en pantallas
            // estrechas el selector debe encogerse, no empujar los iconos de la
            // cabecera fuera de la pantalla.
            "h-9 min-w-0 max-w-[280px] shrink justify-between gap-2 rounded-xl border-border/70 bg-card/60 px-3 font-normal",
            className
          )}
        >
          {selectedInfo || isAutoKey(value) ? (
            <span className="flex min-w-0 items-center gap-2">
              {isAutoKey(value) ? (
                <>
                  <Zap className="size-4 text-violet-500" />
                  <span className="text-[13px] font-medium">Auto</span>
                  <span className="hidden truncate text-xs text-muted-foreground sm:inline">
                    · activado
                  </span>
                </>
              ) : (
                <>
                  <ModelLogo modelId={selectedInfo!.modelId} providerId={selectedInfo!.providerId} className="size-4" />
                  <span className="truncate text-[13px]">{selectedInfo!.modelId}</span>
                  {selectedInfo!.free && (
                    <span className="hidden rounded-full bg-emerald-500/15 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-emerald-500 sm:inline">
                      gratis
                    </span>
                  )}
                  <span className="hidden truncate text-xs text-muted-foreground sm:inline">
                    · {selectedInfo!.providerName}
                  </span>
                </>
              )}
            </span>
          ) : (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Sparkles className="size-4 text-prism-cyan" />
              <span className="text-[13px]">Elige un modelo</span>
            </span>
          )}
          <ChevronDown className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={12}
        className="w-[min(360px,calc(100vw-1.5rem))] p-0"
      >
        <Command shouldFilter={false}>
          {/* Buscar + interruptor «Solo gratis» */}
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-4 shrink-0 opacity-40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar o escribir modelo…"
              className="h-10 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            />
            <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
              Solo gratis
              <Switch
                checked={onlyFree}
                onCheckedChange={(v) => setSettings({ onlyFree: v })}
                aria-label="Mostrar solo modelos gratis"
                className="scale-[0.85]"
              />
            </label>
          </div>
          <div className="border-b px-3 py-2.5">
            {/* Siempre visible: no depende de tener modelos en la lista. */}
            <button
              type="button"
              onClick={() => {
                if (isAutoKey(value)) {
                  const fallback =
                    lastGood?.key && !isAutoKey(lastGood.key) ? lastGood.key : models[0]?.key;
                  if (fallback) onChange(fallback);
                  return;
                }
                onChange(AUTO_MODEL_KEY);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition",
                isAutoKey(value)
                  ? "border-violet-500/40 bg-violet-500/10"
                  : "border-border/70 bg-card/40 hover:border-violet-500/30 hover:bg-violet-500/5"
              )}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/15">
                <Zap className="size-4 text-violet-500" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold">Auto</span>
                <span className="text-xs text-muted-foreground">
                  actívalo y Prism elige el modelo
                </span>
              </span>
              <Switch
                checked={isAutoKey(value)}
                onCheckedChange={(on) => {
                  if (on) {
                    onChange(AUTO_MODEL_KEY);
                    setOpen(false);
                    return;
                  }
                  const fallback =
                    lastGood?.key && !isAutoKey(lastGood.key) ? lastGood.key : models[0]?.key;
                  if (fallback) onChange(fallback);
                }}
                aria-label="Activar Auto"
                className="scale-[0.85]"
                onClick={(e) => e.stopPropagation()}
              />
            </button>
          </div>
          <CommandList className="max-h-[340px]">
            <CommandEmpty>
              {q && value ? (
                <button
                  onClick={addCustom}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-sm hover:bg-accent"
                >
                  <Sparkles className="size-4 text-prism-cyan" />
                  Usar «{q}» con este proveedor
                </button>
              ) : (
                <p className="px-3 py-6 text-center text-sm leading-relaxed text-muted-foreground">
                  {onlyFree ? (
                    <>
                      Sin modelos gratis aquí. Prueba{" "}
                      <span className="font-medium text-foreground">NVIDIA NIM</span>,{" "}
                      <span className="font-medium text-foreground">Kimi</span>,{" "}
                      <span className="font-medium text-foreground">TokenRouter</span>,{" "}
                      <span className="font-medium text-foreground">AiHubMix</span> o{" "}
                      <span className="font-medium text-foreground">Groq</span>.
                    </>
                  ) : (
                    "Sin modelos. Activa un proveedor en Ajustes."
                  )}
                </p>
              )}
            </CommandEmpty>
            {models.length > 0 && (
              <CommandGroup heading="Modelos">
                {filtered.map((m) => {
                  const cooling = cooldownRemaining(healthEntries[m.key], now);
                  const isLastGood = lastGood?.key === m.key;
                  return (
                    <CommandItem
                      key={m.key}
                      value={m.key}
                      onSelect={() => {
                        onChange(m.key);
                        setOpen(false);
                      }}
                      className="group flex items-center gap-2"
                    >
                      <ModelLogo modelId={m.modelId} providerId={m.providerId} className="size-[18px]" />
                      <span className="min-w-0 flex-1 truncate">
                        <span className="text-[13px]">{m.modelId}</span>
                        <span className="ml-1.5 text-xs text-muted-foreground">{m.providerName}</span>
                      </span>
                      {cooling > 0 && (
                        <span
                          className="flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-px text-[9px] font-semibold text-amber-500"
                          title="Enfriándose tras un fallo — Auto lo saltará"
                        >
                          <Timer className="size-3" />
                          {cooling > 60_000 ? `${Math.ceil(cooling / 60_000)} min` : `${Math.ceil(cooling / 1000)}s`}
                        </span>
                      )}
                      {isLastGood && cooling === 0 && (
                        <span
                          className="shrink-0 rounded-full bg-emerald-500/10 px-1.5 py-px text-[9px] font-semibold text-emerald-500"
                          title="Último modelo que respondió bien"
                        >
                          ✓ ok
                        </span>
                      )}
                      {m.free && (
                        <span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-emerald-500">
                          gratis
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(m.key);
                        }}
                        aria-label="Fijar como favorito"
                        className={cn(
                          "touch-actions rounded p-1 opacity-100 transition md:opacity-0 md:group-hover:opacity-100",
                          favorites.includes(m.key) && "opacity-100"
                        )}
                      >
                        <Star
                          className={cn("size-3.5", favorites.includes(m.key) && "fill-amber-400 text-amber-400")}
                        />
                      </button>
                      {value === m.key && <Check className="size-4 text-prism-cyan" />}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
          <div className="flex items-center justify-between border-t px-3 py-2 text-[11px] text-muted-foreground">
            <span>
              <KeyRound className="mr-1 inline size-3" />
              Claves en Ajustes
            </span>
            <span>
              {models.length === totalEnabled
                ? `${models.length} modelos`
                : `${models.length} de ${totalEnabled} (filtro gratis)`}
            </span>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
