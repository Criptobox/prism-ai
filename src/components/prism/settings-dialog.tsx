"use client";
/** Prism AI — Ajustes: proveedores, claves API, parámetros de chat y datos */
import { useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Palette,
  RefreshCw,
  Server,
  Trash2,
  Upload,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { PROVIDERS } from "@/lib/prism/providers";
import { fetchModels } from "@/lib/prism/chat-client";
import { isFreeModel } from "@/lib/prism/free-models";
import { ACCENTS, ACCENT_CUSTOM, normalizeHex } from "@/lib/prism/accent";
import { usePrism } from "@/lib/prism/store";
import type { ProviderId } from "@/lib/prism/types";

export function SettingsDialog({
  open,
  onOpenChange,
  focusProvider,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  focusProvider?: ProviderId | null;
}) {
  const settings = usePrism((s) => s.settings);
  const setSettings = usePrism((s) => s.setSettings);
  const exportData = usePrism((s) => s.exportData);
  const importData = usePrism((s) => s.importData);
  const resetAll = usePrism((s) => s.resetAll);
  const fileRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState("providers");

  const onImport = async (file: File) => {
    const text = await file.text();
    if (importData(text)) {
      toast.success("Datos importados correctamente");
    } else {
      toast.error("Archivo no válido", { description: "Debe ser un backup de Prism AI." });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[86vh] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:h-[640px]">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="text-base">Ajustes</DialogTitle>
          <DialogDescription className="text-xs">
            Todo se guarda solo en este dispositivo. Sin cuentas, sin nube.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-4 mt-3 grid w-auto grid-cols-4">
            <TabsTrigger value="providers">Proveedores</TabsTrigger>
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="look">Apariencia</TabsTrigger>
            <TabsTrigger value="data">Datos</TabsTrigger>
          </TabsList>

          <TabsContent value="providers" className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <ProvidersTab focusProvider={focusProvider} dialogOpen={open} />
          </TabsContent>

          <TabsContent value="chat" className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="system-prompt" className="text-[13px]">
                Instrucciones del sistema
              </Label>
              <textarea
                id="system-prompt"
                value={settings.systemPrompt}
                onChange={(e) => setSettings({ systemPrompt: e.target.value })}
                rows={4}
                className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-prism-violet/50"
                placeholder="Personalidad y estilo del asistente…"
              />
              <p className="text-[11px] text-muted-foreground">
                Se envía como contexto inicial en cada conversación.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[13px]">Temperatura</Label>
                <span className="font-mono text-xs text-muted-foreground">
                  {settings.temperature.toFixed(2)}
                </span>
              </div>
              <Slider
                value={[settings.temperature]}
                onValueChange={([v]) => setSettings({ temperature: v })}
                min={0}
                max={2}
                step={0.05}
              />
              <p className="text-[11px] text-muted-foreground">
                Baja = preciso y estable · Alta = creativo y variado
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[13px]">Tokens máximos de respuesta</Label>
                <Input
                  type="number"
                  value={settings.maxTokens ?? ""}
                  placeholder="auto"
                  onChange={(e) =>
                    setSettings({ maxTokens: e.target.value ? Number(e.target.value) : null })
                  }
                  className="h-8 w-24 text-right text-xs"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[13px]">Contexto (últimos mensajes)</Label>
                <Input
                  type="number"
                  value={settings.contextWindow}
                  onChange={(e) => setSettings({ contextWindow: Number(e.target.value) || 0 })}
                  className="h-8 w-24 text-right text-xs"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Cuántos mensajes previos se envían al modelo (0 = todo el historial).
              </p>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border/60 px-4 py-3">
              <div>
                <Label className="text-[13px]">Respuestas en streaming</Label>
                <p className="text-[11px] text-muted-foreground">
                  Ver la respuesta mientras se genera
                </p>
              </div>
              <Switch
                checked={settings.stream}
                onCheckedChange={(v) => setSettings({ stream: v })}
              />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border/60 px-4 py-3">
              <div>
                <Label className="text-[13px]">Solo modelos gratis</Label>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Muestra únicamente modelos sin coste: sufijo «-free» (AiHubMix),
                  «:free» (OpenRouter) o con capa gratuita (Gemini, Groq, Ollama).
                </p>
              </div>
              <Switch
                checked={settings.onlyFree}
                onCheckedChange={(v) => setSettings({ onlyFree: v })}
              />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border/60 px-4 py-3">
              <div>
                <Label className="text-[13px]">Modo agente (bucles)</Label>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Método iterativo plan → ejecutar → revisar: el agente comprueba su
                  propio trabajo y repite el bucle hasta dejar la tarea perfecta.
                  Se activa con el botón ⟳ del chat.
                </p>
              </div>
              <Switch
                checked={settings.agentMode}
                onCheckedChange={(v) => setSettings({ agentMode: v })}
              />
            </div>

            {settings.agentMode && (
              <div className="flex items-center justify-between rounded-xl border border-border/60 px-4 py-3">
                <div>
                  <Label className="text-[13px]">Iteraciones máximas del agente</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Límite de bucles por respuesta (1–8) para controlar el gasto.
                  </p>
                </div>
                <Input
                  type="number"
                  min={1}
                  max={8}
                  value={settings.agentMaxLoops}
                  onChange={(e) =>
                    setSettings({
                      agentMaxLoops: Math.min(8, Math.max(1, Number(e.target.value) || 3)),
                    })
                  }
                  className="h-8 w-20 text-right text-xs"
                />
              </div>
            )}

            <div className="flex items-center justify-between rounded-xl border border-border/60 px-4 py-3">
              <div>
                <Label className="flex items-center gap-1.5 text-[13px]">
                  <Volume2 className="size-3.5 text-prism-violet" /> Leer respuestas en voz alta
                </Label>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Al terminar cada respuesta, Prism la lee automáticamente (español). También
                  puedes leer cualquier mensaje con el botón de altavoz.
                </p>
              </div>
              <Switch
                checked={settings.autoSpeak}
                onCheckedChange={(v) => setSettings({ autoSpeak: v })}
              />
            </div>
          </TabsContent>

          <TabsContent value="look" className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
            <div className="space-y-2">
              <Label className="text-[13px]">Color de acento</Label>
              <p className="text-[11px] text-muted-foreground">
                Cambia botones, gradientes y detalles de toda la app al instante.
              </p>
              <div className="grid grid-cols-3 gap-2">
                {ACCENTS.map((a) => {
                  const active = settings.accent === a.id;
                  return (
                    <button
                      key={a.id}
                      onClick={() => setSettings({ accent: a.id })}
                      className={cn(
                        "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs transition",
                        active
                          ? "border-transparent ring-2 ring-prism-violet"
                          : "border-border/60 hover:bg-accent/60"
                      )}
                      aria-pressed={active}
                    >
                      <span
                        className="size-4 shrink-0 rounded-full"
                        style={{ background: a.hex, boxShadow: `0 0 8px ${a.hex}66` }}
                      />
                      {a.name}
                      {active && <Check className="ml-auto size-3.5 text-prism-violet" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <AppearanceCustom />

            <div className="rounded-xl border border-border/60 px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
              El modo claro/oscuro se cambia con el botón de luna o sol de la barra lateral. Tu
              combinación preferida se recuerda en este dispositivo.
            </div>
          </TabsContent>

          <TabsContent value="data" className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <div className="rounded-xl border border-border/60 p-4">
              <h3 className="text-sm font-semibold">Copia de seguridad</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Exporta todas tus conversaciones y claves a un archivo JSON, o restáuralas
                en otro dispositivo.
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => {
                    const blob = new Blob([exportData()], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `prism-ai-backup-${new Date().toISOString().slice(0, 10)}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    toast.success("Backup exportado");
                  }}
                >
                  <Check className="mr-1 size-3.5" /> Exportar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="mr-1 size-3.5" /> Importar
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onImport(f);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>

            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4">
              <h3 className="text-sm font-semibold text-destructive">Zona de riesgo</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Borra permanentemente todas las conversaciones, claves y ajustes de este
                dispositivo. No hay forma de deshacerlo.
              </p>
              <Button
                size="sm"
                variant="destructive"
                className="mt-3 h-8 text-xs"
                onClick={() => {
                  if (confirm("¿Borrar TODOS los datos de Prism AI en este dispositivo?")) {
                    resetAll();
                    toast.success("Todo restablecido");
                  }
                }}
              >
                <Trash2 className="mr-1 size-3.5" /> Borrar todo
              </Button>
            </div>

            <p className="text-center text-[11px] text-muted-foreground">
              Prism AI v2.5 · Exportar, temas, voz y Repo Studio · Sin cuentas, sin límites
            </p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/** Lista de proveedores con claves, URLs y fetch de modelos */
function ProvidersTab({
  focusProvider,
  dialogOpen,
}: {
  focusProvider?: ProviderId | null;
  dialogOpen: boolean;
}) {
  const providers = usePrism((s) => s.providers);
  const setProviderConfig = usePrism((s) => s.setProviderConfig);
  const [expanded, setExpanded] = useState<ProviderId | null>(focusProvider ?? "aihubmix");
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [fetching, setFetching] = useState<ProviderId | null>(null);
  const [customModel, setCustomModel] = useState<Record<string, string>>({});
  const focusedRef = useRef<ProviderId | null>(null);

  if (dialogOpen && focusProvider && focusedRef.current !== focusProvider) {
    focusedRef.current = focusProvider;
    if (expanded !== focusProvider) setExpanded(focusProvider);
  }

  const toggleExpand = (id: ProviderId) => setExpanded((cur) => (cur === id ? null : id));

  const doFetchModels = async (id: ProviderId) => {
    const cfg = providers[id];
    const def = PROVIDERS.find((p) => p.id === id)!;
    if (!cfg.apiKey.trim() && id !== "ollama") {
      toast.error("Añade tu API key primero");
      return;
    }
    setFetching(id);
    try {
      const models = await fetchModels(id, cfg);
      if (!models.length) {
        toast.info("El proveedor no devolvió modelos");
      } else {
        setProviderConfig(id, { models });
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
      toast.error("No se pudieron cargar los modelos", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setFetching(null);
    }
  };

  return (
    <div className="space-y-2">
      <p className="px-1 pb-1 text-xs leading-relaxed text-muted-foreground">
        Activa uno o varios proveedores, pega tu API key y listo.{" "}
        <span className="font-medium text-prism-violet">AiHubMix</span> da acceso a GPT, Claude,
        Gemini y más con una sola clave.
      </p>
      {PROVIDERS.map((def) => {
        const cfg = providers[def.id];
        const isOpen = expanded === def.id;
        const status = cfg.apiKey ? "ready" : cfg.enabled ? "enabled" : "off";
        return (
          <div
            key={def.id}
            className={cn(
              "overflow-hidden rounded-xl border transition",
              isOpen ? "border-prism-violet/40 bg-card" : "border-border/60 bg-card/40",
              def.featured && "ring-1 ring-prism-violet/20"
            )}
          >
            {/* Cabecera */}
            <div className="flex items-center gap-3 px-3.5 py-3">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{
                  background: def.color,
                  boxShadow: `0 0 10px ${def.color}66`,
                  opacity: status === "off" ? 0.35 : 1,
                }}
              />
              <button onClick={() => toggleExpand(def.id)} className="min-w-0 flex-1 text-left">
                <p className="flex items-center gap-1.5 text-[13px] font-medium">
                  {def.name}
                  {def.featured && (
                    <span className="rounded-full bg-prism-violet/15 px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide text-prism-violet">
                      1 clave = todo
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
                aria-label="Expandir proveedor"
                className="rounded p-1 text-muted-foreground transition hover:bg-muted"
              >
                <ChevronDown className={cn("size-4 transition", isOpen && "rotate-180")} />
              </button>
            </div>

            {isOpen && (
              <div className="space-y-3 border-t border-border/50 px-3.5 py-3">
                {/* API key */}
                <div className="space-y-1.5">
                  <Label className="text-xs">API key</Label>
                  <div className="flex gap-1.5">
                    <div className="relative flex-1">
                      <KeyRound className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
                      <Input
                        type={showKey[def.id] ? "text" : "password"}
                        value={cfg.apiKey}
                        onChange={(e) => setProviderConfig(def.id, { apiKey: e.target.value.trim() })}
                        placeholder={def.id === "ollama" ? "No necesita clave" : "sk-…"}
                        className="h-9 pl-8 pr-8 font-mono text-xs"
                        autoComplete="off"
                      />
                      <button
                        onClick={() => setShowKey((s) => ({ ...s, [def.id]: !s[def.id] }))}
                        aria-label="Mostrar u ocultar clave"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showKey[def.id] ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                      </button>
                    </div>
                    {def.keyUrl && (
                      <a href={def.keyUrl} target="_blank" rel="noreferrer" title="Obtener API key">
                        <Button variant="outline" size="icon" className="h-9 w-9">
                          <ExternalLink className="size-3.5" />
                        </Button>
                      </a>
                    )}
                  </div>
                  {def.id === "ollama" && (
                    <p className="text-[10.5px] text-muted-foreground">
                      Ejecuta Ollama local y permite el origen:{" "}
                      <code className="font-mono">OLLAMA_ORIGINS=*</code>
                    </p>
                  )}
                </div>

                {/* URL base */}
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    URL de la API {def.id === "custom" && "(compatible OpenAI)"}
                  </Label>
                  <div className="flex gap-1.5">
                    <div className="relative flex-1">
                      <Server className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
                      <Input
                        value={cfg.baseUrl ?? ""}
                        onChange={(e) => setProviderConfig(def.id, { baseUrl: e.target.value })}
                        className="h-9 pl-8 font-mono text-xs"
                        placeholder={def.baseUrl}
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 gap-1.5 px-2.5 text-xs"
                      onClick={() => doFetchModels(def.id)}
                      disabled={fetching === def.id}
                      title="Cargar lista de modelos desde el proveedor"
                    >
                      {fetching === def.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="size-3.5" />
                      )}
                      Modelos
                    </Button>
                  </div>
                </div>

                {/* Conexión */}
                <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                  <div className="pr-3">
                    <p className="text-xs font-medium">Conexión</p>
                    <p className="text-[10.5px] leading-snug text-muted-foreground">
                      Proxy evita CORS pasando por tu servidor · Directa va al proveedor
                    </p>
                  </div>
                  <div className="flex shrink-0 rounded-lg border border-border/60 p-0.5 text-[11px]">
                    {(["proxy", "direct"] as const).map((mode) => {
                      const active = (cfg.useProxy ?? true) === (mode === "proxy");
                      return (
                        <button
                          key={mode}
                          onClick={() => setProviderConfig(def.id, { useProxy: mode === "proxy" })}
                          className={cn(
                            "rounded-md px-2.5 py-1 transition",
                            active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {mode === "proxy" ? "Proxy" : "Directa"}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Modelos */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">
                      Modelos disponibles ({cfg.models.length})
                    </Label>
                  </div>
                  <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-border/50 p-2">
                    {cfg.models.length === 0 && (
                      <p className="p-1 text-[11px] text-muted-foreground">
                        Añade un modelo manualmente o pulsa «Modelos» para cargarlos.
                      </p>
                    )}
                    {cfg.models.map((m) => (
                      <span
                        key={m}
                        className="group inline-flex max-w-full items-center gap-1 rounded-md bg-secondary px-2 py-1 font-mono text-[10.5px]"
                      >
                        <span className="truncate">{m}</span>
                        <button
                          onClick={() =>
                            setProviderConfig(def.id, {
                              models: cfg.models.filter((x) => x !== m),
                            })
                          }
                          className="text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-destructive"
                          aria-label={`Quitar ${m}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    <Input
                      value={customModel[def.id] ?? ""}
                      onChange={(e) =>
                        setCustomModel((s) => ({ ...s, [def.id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const v = customModel[def.id]?.trim();
                          if (v && !cfg.models.includes(v)) {
                            setProviderConfig(def.id, { models: [...cfg.models, v] });
                            setCustomModel((s) => ({ ...s, [def.id]: "" }));
                          }
                        }
                      }}
                      placeholder="Añadir modelo manualmente (ej. gpt-4o)…"
                      className="h-8 font-mono text-xs"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Selector de acento personalizado: cualquier color + dos tonos complementarios generados */
function AppearanceCustom() {
  const settings = usePrism((s) => s.settings);
  const setSettings = usePrism((s) => s.setSettings);
  const isCustom = settings.accent === ACCENT_CUSTOM;
  const [draft, setDraft] = useState(settings.accentCustom);

  const apply = (hex: string) => {
    const norm = normalizeHex(hex);
    if (!norm) return;
    setSettings({ accent: ACCENT_CUSTOM, accentCustom: norm });
  };

  return (
    <div
      className={cn(
        "space-y-2 rounded-xl border px-4 py-3",
        isCustom ? "border-prism-violet/40 bg-prism-violet/5" : "border-border/60"
      )}
    >
      <Label className="flex items-center gap-1.5 text-[13px]">
        <Palette className="size-3.5 text-prism-violet" /> Color personalizado
      </Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={normalizeHex(settings.accentCustom) ?? "#8b5cf6"}
          onChange={(e) => apply(e.target.value)}
          className="size-9 cursor-pointer rounded-lg border border-border/60 bg-transparent p-1"
          aria-label="Elegir color personalizado"
        />
        <Input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            apply(e.target.value);
          }}
          placeholder="#8b5cf6"
          className="h-9 w-32 font-mono text-xs"
          aria-label="Color en formato hexadecimal"
        />
        {isCustom && (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-prism-violet">
            <Check className="size-3.5" /> En uso
          </span>
        )}
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Elige cualquier color y Prism genera automáticamente dos tonos coordinados para los
        degradados y detalles.
      </p>
    </div>
  );
}
