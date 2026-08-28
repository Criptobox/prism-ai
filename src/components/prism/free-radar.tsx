"use client";
/** Prism AI — Radar de modelos gratis: novedades, ofertas con fecha,
 * fuentes permanentes, lista en vivo de OpenRouter y páginas rastreadas. */
import { useCallback, useEffect, useState } from "react";
import {
  CalendarClock,
  Check,
  ExternalLink,
  Gauge,
  KeyRound,
  Plus,
  Radar,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { usePrism } from "@/lib/prism/store";
import { PROVIDER_MAP } from "@/lib/prism/providers";
import { accessCodeHeaders } from "@/lib/prism/chat-client";
import {
  RADAR_NOVEDAD_IDS,
  RADAR_OFFERS,
  RADAR_PAGES,
  RADAR_SOURCES,
  unseenRadarCount,
  type LiveModel,
  type RadarOffer,
  type RadarSource,
} from "@/lib/prism/free-radar";

function fmtCtx(n?: number): string | null {
  if (!n) return null;
  if (n >= 1_000_000) return `${Number.isInteger(n / 1_000_000) ? n / 1_000_000 : (n / 1_000_000).toFixed(1)}M ctx`;
  if (n >= 1000) return `${Math.round(n / 1000)}k ctx`;
  return `${n} ctx`;
}

type LiveData = { live: boolean; openrouter: LiveModel[]; fetchedAt?: string; cached?: boolean };

/** ¿hay clave de OpenRouter configurada? (lectura fresca, no reactiva) */
function hasOpenRouterKey(): boolean {
  return !!usePrism.getState().providers.openrouter.apiKey.trim();
}

export function FreeRadarDialog({
  open,
  onOpenChange,
  onOpenSettings,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onOpenSettings?: (providerId?: string) => void;
}) {
  const radarSeenIds = usePrism((s) => s.radarSeenIds);
  const markRadarSeen = usePrism((s) => s.markRadarSeen);
  const addModelToProvider = usePrism((s) => s.addModelToProvider);
  const setProviderConfig = usePrism((s) => s.setProviderConfig);

  const [data, setData] = useState<LiveData | null>(null);
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());

  const unseen = unseenRadarCount(radarSeenIds);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/free-radar", {
        cache: "no-store",
        headers: accessCodeHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as LiveData;
      setData(json);
    } catch {
      setData({ live: false, openrouter: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  // cargar al abrir + marcar novedades como vistas
  useEffect(() => {
    if (!open) return;
    void load();
    const t = setTimeout(() => markRadarSeen(RADAR_NOVEDAD_IDS), 1500);
    return () => clearTimeout(t);
  }, [open, load, markRadarSeen]);

  /** activa un modelo en un proveedor nativo (o configura Personalizado) */
  const activate = useCallback(
    (opts: { providerId: RadarOffer["providerId"]; modelId?: string; customBase?: string; label: string }) => {
      const st = usePrism.getState();
      const { providerId, modelId, customBase, label } = opts;

      if (providerId && providerId !== "custom") {
        if (!modelId) return;
        const cfg = st.providers[providerId];
        const def = PROVIDER_MAP[providerId];
        const hasKey = !!cfg.apiKey.trim() || providerId === "ollama";
        addModelToProvider(providerId, modelId);
        setAdded((cur) => new Set(cur).add(`${providerId}::${modelId}`));
        if (hasKey) {
          setProviderConfig(providerId, { enabled: true });
          toast.success(`${label} añadido a ${def.name}`, {
            description: "Ya está disponible en el selector de modelos.",
          });
        } else {
          toast(`${def.name} necesita tu API key`, {
            description: `Añade tu clave de ${def.name} en Ajustes para usar ${modelId}.`,
            action: {
              label: "Abrir",
              onClick: () => onOpenSettings?.(providerId),
            },
          });
        }
        return;
      }

      // fuente sin integración nativa → proveedor Personalizado
      if (!customBase) return;
      setProviderConfig("custom", { baseUrl: customBase });
      if (modelId) {
        addModelToProvider("custom", modelId);
        setAdded((cur) => new Set(cur).add(`custom::${modelId}`));
      }
      toast.success(`Personalizado apuntando a ${customBase}`, {
        description: modelId
          ? `Modelo ${modelId} añadido · pon tu clave en Ajustes → Personalizado.`
          : "Pon tu clave de ese proveedor en Ajustes → Personalizado.",
        action: { label: "Abrir", onClick: () => onOpenSettings?.("custom") },
      });
    },
    [addModelToProvider, setProviderConfig, onOpenSettings]
  );

  const activateSource = useCallback(
    (src: RadarSource) => {
      if (src.providerId) {
        let addedCount = 0;
        for (const m of src.models) {
          if (usePrism.getState().addModelToProvider(src.providerId, m)) addedCount++;
        }
        const cfg = usePrism.getState().providers[src.providerId];
        const def = PROVIDER_MAP[src.providerId];
        const hasKey = !!cfg.apiKey.trim() || src.providerId === "ollama";
        if (hasKey) {
          setProviderConfig(src.providerId, { enabled: true });
          toast.success(
            addedCount > 0
              ? `${addedCount} modelo(s) añadidos a ${def.name}`
              : `Ya tenías los modelos de ${def.name}`,
            { description: "Disponibles en el selector de modelos." }
          );
        } else {
          toast(`${def.name} necesita tu API key`, {
            description: "Configúrala en Ajustes para activar estos modelos.",
            action: { label: "Abrir", onClick: () => onOpenSettings?.(src.providerId ?? undefined) },
          });
        }
        return;
      }
      if (src.customBase) {
        setProviderConfig("custom", { baseUrl: src.customBase });
        toast.success(`${src.name} listo para usar en «Personalizado»`, {
          description: `Base: ${src.customBase} · añade tu clave en Ajustes.`,
          action: { label: "Abrir", onClick: () => onOpenSettings?.("custom") },
        });
      }
    },
    [setProviderConfig, onOpenSettings]
  );

  const markOfferAdded = (offer: RadarOffer) => {
    if (offer.modelId && offer.providerId) setAdded((cur) => new Set(cur).add(`${offer.providerId}::${offer.modelId}`));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[88vh] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:h-[640px]">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Radar className="size-4 text-emerald-500" /> Radar de modelos gratis
            {unseen > 0 && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                {unseen} novedades
              </span>
            )}
            <span className="flex-1" />
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-[11px]"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw className={cn("size-3", loading && "animate-spin")} /> Buscar ahora
            </Button>
          </DialogTitle>
          <DialogDescription className="text-xs">
            Ofertas vigentes, capas permanentes gratis y lista en vivo de OpenRouter. Activa cualquier
            modelo con un clic — si aparece una fecha límite, te enteras aquí primero.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {/* ——— Ofertas del momento ——— */}
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Sparkles className="size-3 text-amber-500" /> Ofertas del momento
            </h3>
            <ul className="space-y-2">
              {RADAR_OFFERS.map((o) => {
                const done = o.modelId && o.providerId ? added.has(`${o.providerId}::${o.modelId}`) : false;
                return (
                  <li
                    key={o.id}
                    className={cn(
                      "rounded-xl border p-3.5 transition",
                      o.hot
                        ? "border-amber-500/40 bg-amber-500/[0.05]"
                        : "border-border/60 bg-card/50"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium">
                          {o.title}
                          {o.hot && (
                            <span className="rounded-full bg-amber-500/15 px-1.5 py-px text-[9.5px] font-semibold text-amber-600 dark:text-amber-400">
                              DESTACADA
                            </span>
                          )}
                        </p>
                        <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">{o.detail}</p>
                        {o.endsLabel && (
                          <p className="mt-1.5 flex items-center gap-1 text-[10.5px] text-amber-600 dark:text-amber-400">
                            <CalendarClock className="size-3" /> {o.endsLabel}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      {o.providerId && o.modelId && (
                        <Button
                          size="sm"
                          variant={done ? "outline" : "default"}
                          className={cn("h-7 gap-1 text-[11px]", done && "text-emerald-600")}
                          onClick={() => {
                            activate({ providerId: o.providerId, modelId: o.modelId, customBase: o.customBase, label: o.modelId! });
                            markOfferAdded(o);
                          }}
                        >
                          {done ? <Check className="size-3" /> : <Plus className="size-3" />}
                          {done ? "Añadido" : `Activar ${o.modelId}`}
                        </Button>
                      )}
                      {!o.providerId && (o.customBase || o.modelId) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 text-[11px]"
                          onClick={() => activate({ providerId: null, modelId: o.modelId, customBase: o.customBase, label: o.modelId ?? o.title })}
                        >
                          <Plus className="size-3" />
                          {o.modelId ? `Añadir ${o.modelId} (Personalizado)` : "Configurar en Personalizado"}
                        </Button>
                      )}
                      {o.keyUrl && (
                        <a href={o.keyUrl} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="ghost" className="h-7 gap-1 text-[11px]">
                            <KeyRound className="size-3" /> Conseguir clave
                          </Button>
                        </a>
                      )}
                      {o.url && (
                        <a href={o.url} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="ghost" className="h-7 gap-1 text-[11px]">
                            <ExternalLink className="size-3" /> Ver página
                          </Button>
                        </a>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* ——— Siempre gratis ——— */}
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Gauge className="size-3 text-emerald-500" /> Siempre gratis
            </h3>
            <ul className="grid gap-2 sm:grid-cols-2">
              {RADAR_SOURCES.map((s) => (
                <li key={s.id} className="rounded-xl border border-border/60 bg-card/50 p-3.5">
                  <p className="flex items-center gap-1.5 text-[13px] font-medium">
                    {s.name}
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-px text-[9px] font-semibold",
                        s.type === "permanente"
                          ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
                          : "bg-sky-500/12 text-sky-600 dark:text-sky-400"
                      )}
                    >
                      {s.type === "permanente" ? "PERMANENTE" : s.type.toUpperCase()}
                    </span>
                  </p>
                  <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">
                    {s.description}
                  </p>
                  <p className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground/80">
                    <Gauge className="size-3 shrink-0" /> {s.limits}
                  </p>
                  {s.providerId && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {s.models.slice(0, 4).map((m) => {
                        const done = added.has(`${s.providerId}::${m}`);
                        return (
                          <button
                            key={m}
                            onClick={() =>
                              activate({ providerId: s.providerId, modelId: m, customBase: s.customBase, label: m })
                            }
                            title={done ? "Ya añadido" : `Añadir ${m}`}
                            className={cn(
                              "max-w-full truncate rounded-full border px-2 py-0.5 text-[10px] transition",
                              done
                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : "border-border bg-secondary/60 text-secondary-foreground hover:border-prism-violet/40 hover:text-prism-violet"
                            )}
                          >
                            {done ? "✓ " : "+ "}
                            {m}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="mt-2.5 flex flex-wrap items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6.5 gap-1 px-2 text-[10.5px]"
                      onClick={() => activateSource(s)}
                    >
                      <Plus className="size-3" /> {s.providerId ? "Añadir a Prism" : "Configurar"}
                    </Button>
                    {s.keyUrl && (
                      <a href={s.keyUrl} target="_blank" rel="noreferrer">
                        <Button size="sm" variant="ghost" className="h-6.5 gap-1 px-2 text-[10.5px]">
                          <KeyRound className="size-3" /> Clave
                        </Button>
                      </a>
                    )}
                    {s.docsUrl && (
                      <a href={s.docsUrl} target="_blank" rel="noreferrer">
                        <Button size="sm" variant="ghost" className="h-6.5 gap-1 px-2 text-[10.5px]">
                          <ExternalLink className="size-3" /> Docs
                        </Button>
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* ——— En vivo OpenRouter ——— */}
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Radar className="size-3 text-prism-cyan" /> En vivo · OpenRouter :free
              {data && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-px text-[9px] font-semibold",
                    data.live
                      ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
                      : "bg-amber-500/12 text-amber-600 dark:text-amber-400"
                  )}
                >
                  {data.live ? "EN VIVO" : "REFERENCIA LOCAL"}
                </span>
              )}
            </h3>
            {!data && !loading && (
              <p className="rounded-xl border border-border/60 bg-card/50 p-4 text-center text-xs text-muted-foreground">
                Pulsa «Buscar ahora» para traer la lista actual.
              </p>
            )}
            {loading && (
              <p className="rounded-xl border border-border/60 bg-card/50 p-4 text-center text-xs text-muted-foreground">
                Consultando OpenRouter…
              </p>
            )}
            {data && !loading && (
              <ul className="divide-y rounded-xl border border-border/60 bg-card/50">
                {data.openrouter.map((m) => {
                  const done = added.has(`openrouter::${m.id}`);
                  const hasOpenRouterKey = !!usePrism.getState().providers.openrouter.apiKey.trim();
                  return (
                    <li key={m.id} className="flex items-center gap-2 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-[11.5px]">{m.id}</p>
                        {m.name && m.name !== m.id && (
                          <p className="truncate text-[10px] text-muted-foreground">{m.name}</p>
                        )}
                      </div>
                      {m.contextLength && (
                        <span className="shrink-0 rounded-full bg-secondary/70 px-1.5 py-px text-[9.5px] text-muted-foreground">
                          {fmtCtx(m.contextLength)}
                        </span>
                      )}
                      <button
                        onClick={() =>
                          activate({
                            providerId: "openrouter",
                            modelId: m.id,
                            label: m.id,
                          })
                        }
                        aria-label={`Añadir ${m.id}`}
                        className={cn(
                          "flex size-6 shrink-0 items-center justify-center rounded-full border transition",
                          done
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
                            : "border-border text-muted-foreground hover:border-prism-violet/40 hover:text-prism-violet"
                        )}
                      >
                        {done ? <Check className="size-3" /> : <Plus className="size-3" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {data && !data.live && (
              <p className="mt-1.5 px-1 text-[10.5px] text-muted-foreground/70">
                Sin conexión con OpenRouter ahora mismo — se muestra la última referencia conocida.
              </p>
            )}
            {data?.live && !hasOpenRouterKey() && (
              <p className="mt-1.5 px-1 text-[10.5px] text-muted-foreground/70">
                Consejo: consigue tu clave de OpenRouter para usar estos modelos (50 req/día gratis).
              </p>
            )}
          </section>

          {/* ——— Páginas para estar al tanto ——— */}
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <ExternalLink className="size-3 text-prism-violet" /> Páginas para estar al tanto
            </h3>
            <ul className="space-y-1.5">
              {RADAR_PAGES.map((p) => (
                <li key={p.id}>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-start gap-2 rounded-xl border border-border/60 bg-card/50 px-3.5 py-2.5 transition hover:border-prism-violet/40"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-medium">{p.name}</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{p.note}</p>
                    </div>
                    <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
