"use client";
/** Prism AI — Ajustes → Proveedores: claves, endpoints y modelos.
 * Pensado para el móvil: búsqueda, atajos, campos a ancho completo y
 * botones de añadir/quitar siempre visibles. */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  ListOrdered,
  Loader2,
  LockKeyhole,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Trash2,
  Unplug,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { PROVIDERS } from "@/lib/prism/providers";
import { fetchModels, probeModel } from "@/lib/prism/chat-client";
import {
  culpaConfirmadaDelModelo,
  esUtilizable,
  mensajeProbe,
  modelosRotos,
  pistaDelFallo,
  probeAll,
  type ProbeResult,
} from "@/lib/prism/model-probe";
import { isFreeModel, sanearOrdenFallback } from "@/lib/prism/free-models";
import { sugerirModelos } from "@/lib/prism/sugeridos";
import {
  isNvidiaCatalogPaste,
  looksLikeProviderSnippet,
  parseModelPaste,
  parseProviderSnippet,
} from "@/lib/prism/model-paste";
import { usePrism } from "@/lib/prism/store";
import { useVault } from "@/lib/prism/vault";
import { makeModelKey, type ProviderConfig, type ProviderId } from "@/lib/prism/types";

const ATAJOS: ProviderId[] = [
  "nvidia",
  "kimi",
  "tokenrouter",
  "cerebras",
  "mistral",
  "aihubmix",
  "gemini",
  "groq",
  "custom",
];

type Filtro = "todos" | "listos" | "local";

function vacio(id: ProviderId, defModels: string[]): ProviderConfig {
  return {
    apiKey: "",
    enabled: false,
    models: [...defModels],
    baseUrl: undefined,
    useProxy: true,
  };
}

function estaListo(cfg: ProviderConfig, keyless?: boolean): boolean {
  return cfg.enabled && (!!cfg.apiKey.trim() || !!keyless);
}

function atajoLabel(id: ProviderId, name: string): string {
  if (id === "kimi") return "Kimi K3";
  if (id === "nvidia") return "NVIDIA";
  if (id === "tokenrouter") return "TokenRouter";
  return name.split(" ")[0];
}

/** Orden de preferencia del failover (T2, plan V6).
 *
 * Antes: para que Groq fuese antes que Gemini había que recompilar, porque
 * FAILOVER_ORDER era una constante. Aquí el orden es del usuario: una lista
 * para subir y bajar con flechas (el arrastrar no merece una dependencia
 * nueva) y un botón para volver al orden por defecto.
 *
 * NO se configura PROVIDER_FIT aquí a propósito: eso es afinidad por tipo de
 * tarea, otro concepto — mezclar los dos en una pantalla no se entiende. */
function OrdenFallback() {
  const guardado = usePrism((s) => s.fallbackOrder);
  const setFallbackOrder = usePrism((s) => s.setFallbackOrder);
  const [abierto, setAbierto] = useState(false);

  // saneado AL LEERLO: ids retirados fuera, proveedores que faltan al final.
  // Un orden guardado hace seis versiones no puede dejar fuera a un proveedor.
  const orden = useMemo(() => sanearOrdenFallback(guardado), [guardado]);
  const personalizado = guardado.length > 0;

  const nombre = (id: ProviderId): string =>
    PROVIDERS.find((p) => p.id === id)?.name ?? id;
  const color = (id: ProviderId): string =>
    PROVIDERS.find((p) => p.id === id)?.color ?? "#888";

  const mover = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= orden.length) return;
    const copia = [...orden];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    // materializa el orden saneado completo: lo que se guarda es una lista de
    // ProviderId, no un objeto de pesos — una preferencia es un orden
    setFallbackOrder(copia);
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card/40">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex min-h-12 w-full items-center gap-2.5 px-3 py-2.5 text-left"
        aria-expanded={abierto}
      >
        <ListOrdered className="size-4 shrink-0 text-prism-violet" />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium">Orden de preferencia del failover</span>
          <span className="block text-[11px] text-muted-foreground">
            A quién prueba Auto primero cuando un proveedor se queda sin cuota
            {personalizado ? " · personalizado" : " · por defecto"}
          </span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition", abierto && "rotate-180")} />
      </button>

      {abierto && (
        <div className="border-t border-border/60 px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Sube o baja con las flechas. Solo afecta a la preferencia global, no a la afinidad por
              tipo de tarea.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 shrink-0 gap-1 text-[11px]"
              onClick={() => setFallbackOrder([])}
              disabled={!personalizado}
              title="Vuelve al orden por defecto del código (capas 100% gratuitas primero)"
            >
              <RotateCcw className="size-3" /> Restablecer
            </Button>
          </div>
          <ol className="mt-2 max-h-72 divide-y divide-border/40 overflow-y-auto rounded-lg border border-border/50">
            {orden.map((id, i) => (
              <li key={id} className="flex items-center gap-2 px-2 py-1.5">
                <span className="w-5 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
                  {i + 1}
                </span>
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: color(id) }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-[12px]">{nombre(id)}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  aria-label={`Mover arriba: ${nombre(id)}`}
                  disabled={i === 0}
                  onClick={() => mover(i, -1)}
                >
                  <ChevronUp className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  aria-label={`Mover abajo: ${nombre(id)}`}
                  disabled={i === orden.length - 1}
                  onClick={() => mover(i, 1)}
                >
                  <ChevronDown className="size-3.5" />
                </Button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

export function ProvidersTab({
  focusProvider,
  dialogOpen,
  onOpenDatos,
}: {
  focusProvider?: ProviderId | null;
  dialogOpen: boolean;
  onOpenDatos?: () => void;
}) {
  const providers = usePrism((s) => s.providers);
  const setProviderConfig = usePrism((s) => s.setProviderConfig);
  const vaultEnabled = useVault((s) => s.enabled);
  const [expanded, setExpanded] = useState<ProviderId | null>(focusProvider ?? "nvidia");
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [fetching, setFetching] = useState<ProviderId | null>(null);
  const [pinging, setPinging] = useState<ProviderId | null>(null);
  /** Resultado de la última comprobación, por clave proveedor::modelo. */
  const [probados, setProbados] = useState<Record<string, ProbeResult>>({});
  const [probando, setProbando] = useState<ProviderId | null>(null);
  const [progreso, setProgreso] = useState({ hechos: 0, total: 0 });
  const [customModel, setCustomModel] = useState<Record<string, string>>({});
  /** Lo que cada proveedor contestó la última vez que se le preguntó por sus
   *  modelos. Antes esta lista se contaba y se tiraba; ahora es de donde salen
   *  los sugeridos, que es la única forma de proponer algo que exista. */
  const [catalogoVivo, setCatalogoVivo] = useState<Partial<Record<ProviderId, string[]>>>({});
  const [query, setQuery] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [snippetDraft, setSnippetDraft] = useState("");
  const cardRefs = useRef<Partial<Record<ProviderId, HTMLDivElement | null>>>({});

  useEffect(() => {
    if (!dialogOpen || !focusProvider) return;
    setExpanded(focusProvider);
    setQuery("");
    setFiltro("todos");
    const t = window.setTimeout(() => {
      cardRefs.current[focusProvider]?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(t);
  }, [dialogOpen, focusProvider]);

  const toggleExpand = (id: ProviderId) => setExpanded((cur) => (cur === id ? null : id));

  const irA = (id: ProviderId) => {
    setQuery("");
    setFiltro("todos");
    setExpanded(id);
    window.setTimeout(() => {
      cardRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
  };

  const pingProvider = async (id: ProviderId, overwrite: boolean) => {
    const def = PROVIDERS.find((p) => p.id === id)!;
    const cfg = usePrism.getState().providers[id] ?? vacio(id, def.defaultModels);
    if (!cfg.apiKey.trim() && !def.keyless) {
      toast.error("Añade tu API key primero");
      return;
    }
    if (overwrite) setFetching(id);
    else setPinging(id);
    try {
      const models = await fetchModels(id, cfg);
      // se guarda SIEMPRE, aunque «Probar» no toque la lista del usuario: es
      // lo que hace que los sugeridos dejen de ser una lista fija del código
      setCatalogoVivo((c) => ({ ...c, [id]: models }));
      if (!overwrite) {
        toast.success(`Conexión OK · ${def.name}`, {
          description: models.length
            ? `${models.length} modelos visibles (lista no tocada)`
            : "El endpoint respondió.",
        });
        return;
      }
      if (!models.length) {
        toast.info("El proveedor no devolvió modelos");
      } else {
        setProviderConfig(id, {
          models,
          enabled: def.keyless || !!cfg.apiKey.trim() ? true : cfg.enabled,
        });
        const freeCount = models.filter((m) => isFreeModel(id, m)).length;
        const onlyFree = usePrism.getState().settings.onlyFree;
        toast.success(
          onlyFree
            ? `${freeCount} modelos gratis de ${models.length} en ${def.name}`
            : `${models.length} modelos cargados de ${def.name}`,
          {
            description:
              onlyFree && freeCount === 0
                ? "Ninguno parece gratis — se siguen mostrando todos hasta que actives el filtro."
                : undefined,
          }
        );
      }
    } catch (e) {
      toast.error(overwrite ? "No se pudieron cargar los modelos" : `No se pudo conectar con ${def.name}`, {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      if (overwrite) setFetching(null);
      else setPinging(null);
    }
  };

  const applySnippet = (raw: string): boolean => {
    const parsed = parseProviderSnippet(raw);
    if (!parsed) return false;
    const id = parsed.providerId;
    const def = PROVIDERS.find((p) => p.id === id);
    if (!def) return false;
    const cfg = usePrism.getState().providers[id] ?? vacio(id, def.defaultModels);
    const models = parsed.modelId
      ? cfg.models.includes(parsed.modelId)
        ? cfg.models
        : [parsed.modelId, ...cfg.models]
      : cfg.models;
    setProviderConfig(id, {
      apiKey: parsed.apiKey ?? cfg.apiKey,
      baseUrl: parsed.baseUrl ?? cfg.baseUrl ?? def.baseUrl,
      models,
      enabled: true,
    });
    if (parsed.modelId) {
      const key = makeModelKey(id, parsed.modelId);
      const st = usePrism.getState();
      st.setSettings({ defaultModelKey: key });
      const sid = st.activeSessionId;
      if (sid) {
        usePrism.setState((s) => ({
          sessions: s.sessions.map((x) => (x.id === sid ? { ...x, modelKey: key } : x)),
        }));
      }
    }
    irA(id);
    const bits = [parsed.modelId ?? null, parsed.apiKey ? "clave aplicada" : null].filter(Boolean);
    toast.success(`${def.name} listo${bits.length ? ` · ${bits.join(" · ")}` : ""}`, {
      description: parsed.baseUrl
        ? `Endpoint ${parsed.baseUrl.replace(/^https?:\/\//, "")}`
        : undefined,
    });
    void pingProvider(id, false);
    return true;
  };

  /**
   * Comprueba uno a uno que los modelos de la lista responden de verdad.
   *
   * Un catálogo que dice «gratis» no garantiza nada: glm-4.5 aparecía como
   * disponible y al usarlo el proveedor contestaba que ese modelo no está. Una
   * prueba cuesta un token y evita descubrirlo con el mensaje ya escrito.
   */
  const probarModelos = async (id: ProviderId) => {
    const cfg = providers[id];
    if (!cfg.models.length) return;
    setProbando(id);
    setProgreso({ hechos: 0, total: cfg.models.length });
    try {
      let hechos = 0;
      const res = await probeAll(
        cfg.models,
        (m) => probeModel(id, cfg, m),
        {
          concurrency: 3,
          onResult: (m, r) => {
            hechos++;
            setProgreso({ hechos, total: cfg.models.length });
            setProbados((p) => ({ ...p, [makeModelKey(id, m)]: r }));
          },
        }
      );

      const rotos = modelosRotos(res);
      const buenos = [...res.values()].filter((r) => esUtilizable(r.verdict)).length;
      if (!rotos.length) {
        toast.success(`${buenos} de ${cfg.models.length} responden`, {
          description: "Ninguno hay que quitar.",
        });
        return;
      }
      /* El aviso solo informa. La acción de quitar vive DENTRO del panel, junto
       * a la lista: el aviso se pinta fuera del diálogo de Ajustes, así que
       * Radix trataba el clic como «fuera», cerraba Ajustes y la acción no
       * llegaba a aplicarse. Y además el aviso se va solo a los pocos segundos:
       * un control que desaparece no es donde poner algo que hay que decidir. */
      toast.warning(`${rotos.length} no ${rotos.length === 1 ? "sirve" : "sirven"}`, {
        description:
          rotos.slice(0, 4).join(", ") +
          (rotos.length > 4 ? "…" : "") +
          ". Puedes quitarlos bajo la lista de modelos.",
        duration: 9_000,
      });
    } finally {
      setProbando(null);
    }
  };

  const addModel = (fromId: ProviderId, raw: string) => {
    if (looksLikeProviderSnippet(raw) && applySnippet(raw)) {
      setCustomModel((s) => ({ ...s, [fromId]: "" }));
      setSnippetDraft("");
      return;
    }
    const v = parseModelPaste(raw);
    if (!v) return;
    const target: ProviderId = isNvidiaCatalogPaste(raw) ? "nvidia" : fromId;
    const def = PROVIDERS.find((p) => p.id === target)!;
    const cfg = providers[target] ?? vacio(target, def.defaultModels);
    if (cfg.models.includes(v)) {
      toast.info(`${v} ya está en ${def.name}`);
      setCustomModel((s) => ({ ...s, [fromId]: "" }));
      if (target !== fromId) irA(target);
      return;
    }
    setProviderConfig(target, { models: [...cfg.models, v], enabled: cfg.enabled || !!cfg.apiKey.trim() });
    setCustomModel((s) => ({ ...s, [fromId]: "", [target]: "" }));
    if (target !== fromId) {
      irA(target);
      toast.success(`Añadido ${v} a NVIDIA NIM`, {
        description: "Esa ficha es de build.nvidia.com, no de la API oficial.",
      });
    } else if (v !== raw.trim()) {
      toast.success(`Detectado ${v}`);
    }
  };

  const visibles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PROVIDERS.filter((def) => {
      const cfg = providers[def.id] ?? vacio(def.id, def.defaultModels);
      if (filtro === "listos" && !estaListo(cfg, def.keyless)) return false;
      if (filtro === "local" && !def.keyless) return false;
      if (!q) return true;
      const hay = [def.id, def.name, def.tagline, ...(cfg.models ?? []), ...def.defaultModels]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    }).sort((a, b) => {
      const ca = estaListo(providers[a.id] ?? vacio(a.id, a.defaultModels), a.keyless) ? 0 : 1;
      const cb = estaListo(providers[b.id] ?? vacio(b.id, b.defaultModels), b.keyless) ? 0 : 1;
      if (ca !== cb) return ca - cb;
      if (!!a.featured !== !!b.featured) return a.featured ? -1 : 1;
      return 0;
    });
  }, [providers, query, filtro]);

  const listos = PROVIDERS.filter((d) =>
    estaListo(providers[d.id] ?? vacio(d.id, d.defaultModels), d.keyless)
  ).length;

  return (
    <div className="space-y-3">
      <p className="px-0.5 text-xs leading-relaxed text-muted-foreground">
        Pega un snippet (Python, cURL o el cliente OpenAI) arriba: Prism saca la clave, la URL y el
        modelo.{" "}
        <span className="font-medium text-prism-violet">NVIDIA NIM</span>,{" "}
        <span className="font-medium text-prism-violet">Kimi</span> y{" "}
        <span className="font-medium text-prism-violet">TokenRouter</span> van nativos.
      </p>

      <div className="space-y-2 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] px-3 py-2.5">
        <p className="text-[11.5px] font-medium text-foreground">Pegar snippet</p>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Copia el Python de NVIDIA Build, el cliente OpenAI de TokenRouter (`base_url` + `api_key` +
          `model`) o un cURL con Bearer. Prism elige el proveedor por el host y deja ese modelo como
          predeterminado.
        </p>
        <textarea
          value={snippetDraft}
          onChange={(e) => setSnippetDraft(e.target.value)}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (looksLikeProviderSnippet(text) && applySnippet(text)) {
              e.preventDefault();
              setSnippetDraft("");
            }
          }}
          rows={5}
          placeholder={
            'client = OpenAI(api_key="sk-…", base_url="https://…/v1")\nclient.chat.completions.create(model="…")'
          }
          className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 font-mono text-[11px] leading-relaxed outline-none focus:border-prism-violet/50"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 w-full gap-1.5 text-xs"
          onClick={() => {
            if (!snippetDraft.trim()) {
              toast.info("Pega primero el snippet");
              return;
            }
            if (applySnippet(snippetDraft)) setSnippetDraft("");
            else
              toast.error("No pude leer ese snippet", {
                description: "Tiene que incluir una URL (base_url / invoke_url) y una clave o un model.",
              });
          }}
        >
          <ClipboardPaste className="size-3.5" /> Usar snippet
        </Button>
      </div>

      {!vaultEnabled && (
        <button
          type="button"
          onClick={onOpenDatos}
          className="flex w-full items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2.5 text-left transition hover:bg-amber-500/10"
        >
          <LockKeyhole className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="text-[11.5px] leading-relaxed">
            <span className="font-medium text-foreground">Cifra las claves con un PIN. </span>
            <span className="text-muted-foreground">
              Ajustes → Datos. Sin el PIN no se pueden descifrar aunque extraigan el navegador.
            </span>
          </span>
        </button>
      )}

      <div className="sticky top-0 z-10 -mx-1 space-y-2 bg-background/95 px-1 py-1 backdrop-blur-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/70" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar proveedor o modelo…"
            className="h-10 pl-8 text-sm"
            type="search"
            enterKeyHint="search"
          />
        </div>
        <div className="flex gap-1.5">
          {(
            [
              { id: "todos", label: "Todos" },
              { id: "listos", label: `Listos (${listos})` },
              { id: "local", label: "Local" },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              onClick={() => setFiltro(f.id)}
              className={cn(
                "h-8 flex-1 rounded-lg border text-[12px] font-medium transition",
                filtro === f.id
                  ? "border-prism-violet/50 bg-prism-violet/10 text-foreground"
                  : "border-border/60 text-muted-foreground hover:bg-accent"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {ATAJOS.map((id) => {
            const def = PROVIDERS.find((p) => p.id === id);
            if (!def) return null;
            const cfg = providers[id] ?? vacio(id, def.defaultModels);
            const on = estaListo(cfg, def.keyless);
            return (
              <button
                key={id}
                onClick={() => irA(id)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition",
                  expanded === id
                    ? "border-prism-violet/50 bg-prism-violet/10"
                    : "border-border/70 bg-card/60 hover:border-prism-violet/30"
                )}
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{ background: def.color, boxShadow: on ? `0 0 6px ${def.color}` : undefined }}
                />
                {atajoLabel(id, def.name)}
              </button>
            );
          })}
        </div>
      </div>

      {visibles.length === 0 && (
        <p className="rounded-xl border border-dashed border-border/70 px-3 py-6 text-center text-xs text-muted-foreground">
          Nada coincide con «{query}». Prueba NVIDIA, Kimi, TokenRouter o el nombre de un modelo.
        </p>
      )}

      {visibles.map((def) => {
        const cfg = providers[def.id] ?? vacio(def.id, def.defaultModels);
        const isOpen = expanded === def.id || visibles.length === 1;
        const listo = estaListo(cfg, def.keyless);
        const sugerencias = sugerirModelos(
          def.id,
          cfg.models,
          catalogoVivo[def.id],
          def.defaultModels
        );
        const placeholderKey =
          def.id === "nvidia" ? "nvapi-…" : def.id === "tokenrouter" ? "sk-… o tr_…" : def.keyless ? "No necesita clave" : "sk-…";

        return (
          <div
            key={def.id}
            ref={(el) => {
              cardRefs.current[def.id] = el;
            }}
            className={cn(
              "scroll-mt-2 overflow-hidden rounded-xl border transition",
              isOpen ? "border-prism-violet/40 bg-card" : "border-border/60 bg-card/40",
              def.featured && "ring-1 ring-prism-violet/20"
            )}
          >
            <div className="flex min-h-12 items-center gap-2.5 px-3 py-2.5">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{
                  background: def.color,
                  boxShadow: `0 0 10px ${def.color}66`,
                  opacity: listo || cfg.apiKey ? 1 : 0.35,
                }}
              />
              <button onClick={() => toggleExpand(def.id)} className="min-w-0 flex-1 text-left">
                <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium">
                  {def.name}
                  {def.featured && (
                    <span className="rounded-full bg-prism-violet/15 px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide text-prism-violet">
                      1 clave = todo
                    </span>
                  )}
                  {listo && (
                    <span className="rounded-full bg-emerald-500/12 px-1.5 py-px text-[9.5px] font-semibold text-emerald-600 dark:text-emerald-400">
                      LISTO
                    </span>
                  )}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">{def.tagline}</p>
              </button>
              <Switch
                checked={cfg.enabled}
                onCheckedChange={(v) => setProviderConfig(def.id, { enabled: v })}
                aria-label={`Activar ${def.name}`}
              />
              <button
                onClick={() => toggleExpand(def.id)}
                aria-label={isOpen ? `Cerrar ${def.name}` : `Abrir ${def.name}`}
                className="rounded-md p-2 text-muted-foreground transition hover:bg-muted"
              >
                <ChevronDown className={cn("size-4 transition", isOpen && "rotate-180")} />
              </button>
            </div>

            {isOpen && (
              <div className="space-y-3.5 border-t border-border/50 px-3 py-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">API key</Label>
                  <div className="relative">
                    <KeyRound className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
                    <Input
                      type={showKey[def.id] ? "text" : "password"}
                      value={cfg.apiKey}
                      onChange={(e) => {
                        const apiKey = e.target.value.trim();
                        setProviderConfig(def.id, {
                          apiKey,
                          enabled: apiKey.length > 0 ? true : cfg.enabled,
                        });
                      }}
                      onPaste={(e) => {
                        const text = e.clipboardData.getData("text");
                        if (looksLikeProviderSnippet(text) && applySnippet(text)) {
                          e.preventDefault();
                          setSnippetDraft("");
                        }
                      }}
                      placeholder={placeholderKey}
                      className="h-11 pl-8 pr-10 font-mono text-sm"
                      autoComplete="off"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey((s) => ({ ...s, [def.id]: !s[def.id] }))}
                      aria-label="Mostrar u ocultar clave"
                      className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
                    >
                      {showKey[def.id] ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {def.keyUrl && (
                      <a href={def.keyUrl} target="_blank" rel="noreferrer" className="inline-flex">
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                          <ExternalLink className="size-3.5" /> Obtener clave
                        </Button>
                      </a>
                    )}
                    {def.id === "nvidia" && (
                      <a href="https://build.nvidia.com" target="_blank" rel="noreferrer" className="inline-flex">
                        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
                          Catálogo
                        </Button>
                      </a>
                    )}
                    {def.docsUrl && (
                      <a href={def.docsUrl} target="_blank" rel="noreferrer" className="inline-flex">
                        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
                          Docs
                        </Button>
                      </a>
                    )}
                  </div>
                  {def.hint && (
                    <p className="text-[11px] leading-relaxed text-muted-foreground">{def.hint}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">
                    URL de la API {def.id === "custom" && "(compatible OpenAI)"}
                  </Label>
                  <div className="relative">
                    <Server className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
                    <Input
                      value={cfg.baseUrl ?? ""}
                      onChange={(e) => setProviderConfig(def.id, { baseUrl: e.target.value })}
                      className="h-11 pl-8 font-mono text-sm"
                      placeholder={def.baseUrl}
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 flex-1 gap-1.5 text-xs sm:flex-none"
                      onClick={() => void pingProvider(def.id, true)}
                      disabled={fetching === def.id}
                    >
                      {fetching === def.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="size-3.5" />
                      )}
                      Cargar modelos
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 flex-1 gap-1.5 text-xs sm:flex-none"
                      onClick={() => void probarModelos(def.id)}
                      disabled={probando === def.id || !cfg.models.length}
                      title="Manda un token a cada modelo y marca los que no responden"
                    >
                      {probando === def.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <ShieldCheck className="size-3.5" />
                      )}
                      {probando === def.id
                        ? `Probando ${progreso.hechos}/${progreso.total}`
                        : "Probar modelos"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 flex-1 gap-1.5 text-xs sm:flex-none"
                      onClick={() => void pingProvider(def.id, false)}
                      disabled={pinging === def.id}
                    >
                      {pinging === def.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Unplug className="size-3.5" />
                      )}
                      Probar
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5 rounded-lg bg-muted/40 px-3 py-2.5">
                  <p className="text-xs font-medium">Conexión</p>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    Proxy evita CORS pasando por tu servidor · Directa va al proveedor
                  </p>
                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    {(["proxy", "direct"] as const).map((mode) => {
                      const active = (cfg.useProxy ?? true) === (mode === "proxy");
                      return (
                        <button
                          key={mode}
                          onClick={() => setProviderConfig(def.id, { useProxy: mode === "proxy" })}
                          className={cn(
                            "h-9 rounded-lg border text-xs font-medium transition",
                            active
                              ? "border-transparent bg-primary text-primary-foreground"
                              : "border-border/70 text-muted-foreground hover:bg-accent"
                          )}
                        >
                          {mode === "proxy" ? "Proxy" : "Directa"}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Modelos disponibles ({cfg.models.length})</Label>
                  <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-border/50 p-2">
                    {cfg.models.length === 0 && (
                      <p className="p-1 text-[11px] text-muted-foreground">
                        Añade un modelo abajo o pulsa «Cargar modelos».
                      </p>
                    )}
                    {cfg.models.map((m) => {
                      const probado = probados[makeModelKey(def.id, m)];
                      // tachado solo si la culpa es del modelo Y no hay una
                      // explicación mejor (política de datos, límite, clave)
                      const roto = !!probado && culpaConfirmadaDelModelo(probado);
                      return (
                      <span
                        key={m}
                        title={
                          probado
                            ? [
                                `${mensajeProbe(probado.verdict)} (${probado.ms} ms)`,
                                pistaDelFallo(probado.status, probado.detail),
                                // lo que contestó el proveedor, tal cual: es el
                                // único dato que no es interpretación nuestra
                                probado.detail?.trim(),
                              ]
                                .filter(Boolean)
                                .join("\n\n")
                            : undefined
                        }
                        className={cn(
                          "inline-flex max-w-full items-center gap-0.5 rounded-md pl-2 pr-0.5 font-mono text-[11px]",
                          roto
                            ? "bg-destructive/10 text-destructive line-through decoration-destructive/50"
                            : "bg-secondary"
                        )}
                      >
                        {probado && (
                          <span
                            aria-hidden
                            className={cn(
                              "mr-0.5 size-1.5 shrink-0 rounded-full",
                              roto
                                ? "bg-destructive"
                                : probado.verdict === "ok"
                                  ? "bg-emerald-500"
                                  : "bg-amber-500"
                            )}
                          />
                        )}
                        <span className="truncate py-1">{m}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setProviderConfig(def.id, {
                              models: cfg.models.filter((x) => x !== m),
                            })
                          }
                          className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                          aria-label={`Quitar ${m}`}
                        >
                          ×
                        </button>
                      </span>
                      );
                    })}
                  </div>
                  {(() => {
                    /* Dos avisos distintos, y la diferencia importa: antes todo
                     * fallo se presentaba como «el proveedor no los reconoce» y
                     * se ofrecía borrarlos. Con OpenRouter eso tumba los cinco
                     * modelos gratis a la vez por una casilla de la cuenta, y
                     * siguiendo el aviso te quedabas sin ellos. Cuando el
                     * proveedor dice por qué, se enseña lo que dijo y NO se
                     * ofrece quitar nada. */
                    const conPista: { modelo: string; pista: string }[] = [];
                    const rotos: string[] = [];
                    for (const m of cfg.models) {
                      const r = probados[makeModelKey(def.id, m)];
                      if (!r) continue;
                      const pista = pistaDelFallo(r.status, r.detail);
                      if (culpaConfirmadaDelModelo(r)) rotos.push(m);
                      else if (pista && !esUtilizable(r.verdict)) conPista.push({ modelo: m, pista });
                    }
                    // una misma causa para varios modelos se dice una vez
                    const pistas = [...new Set(conPista.map((c) => c.pista))];
                    if (!rotos.length && !pistas.length) return null;
                    return (
                      <div className="flex flex-col gap-2">
                        {pistas.map((pista) => {
                          const cuantos = conPista.filter((c) => c.pista === pista).length;
                          return (
                            <div
                              key={pista}
                              className="rounded-lg border border-amber-500/40 bg-amber-500/[0.07] px-2.5 py-2 text-[11px] leading-snug text-muted-foreground"
                            >
                              <strong className="text-amber-600 dark:text-amber-400">
                                {cuantos} {cuantos === 1 ? "no contestó" : "no contestaron"}
                              </strong>{" "}
                              — {pista}
                            </div>
                          );
                        })}
                        {rotos.length > 0 && (
                          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-2.5 py-2">
                            <span className="min-w-0 flex-1 text-[11px] leading-snug text-muted-foreground">
                              <strong className="text-destructive">
                                {rotos.length} {rotos.length === 1 ? "no responde" : "no responden"}
                              </strong>{" "}
                              — el proveedor no los reconoce o tu clave no llega a ellos. Pasa el
                              ratón por encima de cada uno para ver lo que contestó.
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 shrink-0 gap-1 text-[11px]"
                              onClick={() =>
                                setProviderConfig(def.id, {
                                  models: cfg.models.filter((m) => !rotos.includes(m)),
                                })
                              }
                            >
                              <Trash2 className="size-3" /> Quitar los que fallan
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  <div className="flex gap-1.5">
                    <Input
                      value={customModel[def.id] ?? ""}
                      onChange={(e) => setCustomModel((s) => ({ ...s, [def.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addModel(def.id, customModel[def.id] ?? "");
                        }
                      }}
                      placeholder="Añadir modelo (ej. kimi-k3-preview)…"
                      className="h-10 font-mono text-sm"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 shrink-0 gap-1 px-3 text-xs"
                      onClick={() => addModel(def.id, customModel[def.id] ?? "")}
                    >
                      <Plus className="size-3.5" /> Añadir
                    </Button>
                  </div>
                  {sugerencias.modelos.length > 0 && (
                    <div className="space-y-1.5">
                      {/* De dónde salen se dice SIEMPRE: un modelo que el
                          proveedor acaba de listar y uno escrito a mano en el
                          código no valen lo mismo, y confundirlos es lo que
                          hacía que se añadieran modelos que ya no existen. */}
                      {sugerencias.origen === "catalogo" ? (
                        <p className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                          <Sparkles className="size-3" /> Gratis en tu catálogo ·{" "}
                          {sugerencias.total === sugerencias.modelos.length
                            ? `${sugerencias.total} que no tienes`
                            : `${sugerencias.modelos.length} de ${sugerencias.total} que no tienes`}
                        </p>
                      ) : (
                        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Sparkles className="size-3" /> Sugeridos de la lista de siempre ·{" "}
                          <button
                            type="button"
                            onClick={() => pingProvider(def.id, false)}
                            className="underline underline-offset-2 hover:text-foreground"
                          >
                            pulsa «Probar» para ver los tuyos
                          </button>
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {sugerencias.modelos.map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => addModel(def.id, m)}
                            className={cn(
                              "max-w-full truncate rounded-full border bg-background px-2.5 py-1 text-left font-mono text-[11px] hover:border-prism-violet/40 hover:text-prism-violet",
                              sugerencias.origen === "catalogo"
                                ? "border-emerald-500/40 text-foreground"
                                : "border-border/70 text-foreground/90"
                            )}
                          >
                            + {m}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Al final a propósito: la pestaña es para conectar proveedores; el
          orden es preferencia, y quien lo busca ya sabe que existe. */}
      <OrdenFallback />
    </div>
  );
}
