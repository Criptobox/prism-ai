"use client";
/** Prism AI — Selector de modelo con filtro «Solo gratis» */
import { useMemo, useState } from "react";
import { Check, ChevronDown, KeyRound, Search, Sparkles, Star } from "lucide-react";
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
  const totalEnabled = usePrism((s) =>
    Object.values(s.providers)
      .filter((c) => c.enabled)
      .reduce((acc, c) => acc + c.models.length, 0)
  );
  const onlyFree = usePrism((s) => s.settings.onlyFree);
  const setSettings = usePrism((s) => s.setSettings);
  const favorites = usePrism((s) => s.favorites);
  const toggleFavorite = usePrism((s) => s.toggleFavorite);
  const [query, setQuery] = useState("");

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
            "h-9 max-w-[280px] justify-between gap-2 rounded-xl border-border/70 bg-card/60 px-3 font-normal",
            className
          )}
        >
          {selectedInfo ? (
            <span className="flex min-w-0 items-center gap-2">
              <span className="size-2 shrink-0 rounded-full" style={{ background: selectedInfo.color }} />
              <span className="truncate text-[13px]">{selectedInfo.modelId}</span>
              {selectedInfo.free && (
                <span className="hidden rounded-full bg-emerald-500/15 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-emerald-500 sm:inline">
                  gratis
                </span>
              )}
              <span className="hidden truncate text-xs text-muted-foreground sm:inline">
                · {selectedInfo.providerName}
              </span>
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
      <PopoverContent align="start" className="w-[360px] p-0">
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
                      <span className="font-medium text-foreground">AiHubMix</span> (-free),{" "}
                      <span className="font-medium text-foreground">OpenRouter</span> (:free),{" "}
                      <span className="font-medium text-foreground">Gemini</span> o{" "}
                      <span className="font-medium text-foreground">Groq</span>.
                    </>
                  ) : (
                    "Sin modelos. Activa un proveedor en Ajustes."
                  )}
                </p>
              )}
            </CommandEmpty>
            {filtered.map((m) => (
              <CommandItem
                key={m.key}
                value={m.key}
                onSelect={() => {
                  onChange(m.key);
                  setOpen(false);
                }}
                className="group flex items-center gap-2"
              >
                <span className="size-2 shrink-0 rounded-full" style={{ background: m.color }} />
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-[13px]">{m.modelId}</span>
                  <span className="ml-1.5 text-xs text-muted-foreground">{m.providerName}</span>
                </span>
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
                    "rounded p-1 opacity-0 transition group-hover:opacity-100",
                    favorites.includes(m.key) && "opacity-100"
                  )}
                >
                  <Star
                    className={cn("size-3.5", favorites.includes(m.key) && "fill-amber-400 text-amber-400")}
                  />
                </button>
                {value === m.key && <Check className="size-4 text-prism-cyan" />}
              </CommandItem>
            ))}
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
