"use client";
/** Prism AI — Ajustes: proveedores, claves API, parámetros de chat y datos */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Database,
  KeyRound,
  Loader2,
  LockKeyhole,
  MessageSquare,
  Palette,
  ClipboardCheck,
  ShieldCheck,
  Stethoscope,
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
  EFECTOS,
  EFECTO_LABEL,
  EFECTO_DESC,
  normalizarPermisos,
  toolsDelEfecto,
  toolPermitida,
} from "@/lib/prism/tool-permissions";
import { TOOL_CATALOG } from "@/lib/prism/tools-catalog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ACCENTS, ACCENT_CUSTOM, normalizeHex } from "@/lib/prism/accent";
import { usePrism } from "@/lib/prism/store";
import { MODOS_AGENTE, costeDeModos } from "@/lib/prism/agent-modes";
import {
  CHARS_POR_TOKEN,
  construirPrompt,
  nivelPresupuesto,
  piezaMasGorda,
  tokensAprox,
} from "@/lib/prism/presupuesto";
import { entradaPromptActual } from "@/lib/prism/prompt-actual";
import { APP_BUILT, APP_COMMIT, APP_VERSION, buildLabel } from "@/lib/prism/app-version";
import { sinSecretos, textoDiagnostico } from "@/lib/prism/diagnostics";
import { useHealth } from "@/lib/prism/health";
import { PROVIDERS } from "@/lib/prism/providers";
import { lockVault, removeVaultPin, setVaultPin, useVault } from "@/lib/prism/vault";
import { PANTALLA_ESTRECHA, useMediaQuery } from "@/lib/prism/use-media-query";
import type { ProviderId } from "@/lib/prism/types";
import { ProvidersTab } from "./providers-tab";
import { TransferPanel } from "./transfer-panel";

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

  /** Permisos del agente, ya normalizados: los ajustes guardados de una
   * versión anterior no traen el campo, y un efecto nuevo se concede. */
  const permisos = useMemo(() => normalizarPermisos(settings.permisosAgente), [settings.permisosAgente]);
  const apagados = useMemo(() => EFECTOS.filter((e) => !permisos[e]), [permisos]);
  /** Qué herramientas quedan fuera con lo apagado ahora mismo. Se calcula del
   * catálogo real: es la única forma de que la advertencia no mienta cuando
   * se añada una herramienta nueva. */
  const sinPermiso = useMemo(
    () => TOOL_CATALOG.filter((t) => !toolPermitida(t.name, permisos).permitida).map((t) => t.name),
    [permisos]
  );
  const exportData = usePrism((s) => s.exportData);
  const importData = usePrism((s) => s.importData);
  const resetAll = usePrism((s) => s.resetAll);
  const fileRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState("providers");
  const estrecha = useMediaQuery(PANTALLA_ESTRECHA);

  useEffect(() => {
    if (open && focusProvider) setTab("providers");
  }, [open, focusProvider]);

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
      <DialogContent
        className={cn(
          "flex flex-col gap-0 overflow-hidden p-0",
          estrecha
            ? "fixed inset-0 top-0 left-0 z-50 h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 rounded-none border-0 data-[state=open]:zoom-in-100"
            : "h-[86vh] max-w-2xl sm:h-[640px]"
        )}
      >
        <DialogHeader className="border-b px-4 py-3 pr-12 sm:px-5 sm:py-4">
          <DialogTitle className="text-base">Ajustes</DialogTitle>
          <DialogDescription className="text-xs">
            Todo se guarda solo en este dispositivo. Sin cuentas, sin nube.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-0">
          <TabsList className="mx-3 mt-2 grid h-auto w-[calc(100%-1.5rem)] grid-cols-4 gap-1 p-1">
            <TabsTrigger value="providers" className="flex-col gap-0.5 py-1.5 text-[11px] sm:flex-row sm:text-sm">
              <KeyRound className="size-3.5" /> Claves
            </TabsTrigger>
            <TabsTrigger value="chat" className="flex-col gap-0.5 py-1.5 text-[11px] sm:flex-row sm:text-sm">
              <MessageSquare className="size-3.5" /> Chat
            </TabsTrigger>
            <TabsTrigger value="look" className="flex-col gap-0.5 py-1.5 text-[11px] sm:flex-row sm:text-sm">
              <Palette className="size-3.5" /> Look
            </TabsTrigger>
            <TabsTrigger value="data" className="flex-col gap-0.5 py-1.5 text-[11px] sm:flex-row sm:text-sm">
              <Database className="size-3.5" /> Datos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="providers" className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
            <ProvidersTab
              focusProvider={focusProvider}
              dialogOpen={open}
              onOpenDatos={() => setTab("data")}
            />
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

            <div className="space-y-2">
              <Label className="text-[13px]">Compresión de contexto</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { v: "off", label: "Apagada", hint: "texto intacto" },
                    { v: "lite", label: "Lite", hint: "−15% seguro" },
                    { v: "standard", label: "Estándar", hint: "−30% o más" },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.v}
                    onClick={() => setSettings({ compression: o.v })}
                    className={cn(
                      "rounded-lg border px-2 py-2 text-center transition",
                      settings.compression === o.v
                        ? "border-prism-violet/60 bg-prism-violet/10 text-foreground"
                        : "border-border/60 text-muted-foreground hover:bg-accent"
                    )}
                  >
                    <span className="block text-xs font-medium">{o.label}</span>
                    <span className="block text-[10px] opacity-70">{o.hint}</span>
                  </button>
                ))}
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Reduce los tokens del historial para estirar los límites gratis (inspirado en
                RTK/Caveman). El código, las URLs y los JSON se preservan intactos y la pregunta
                actual nunca se toca.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-[13px]">Estilo de respuesta</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { v: "normal", label: "Normal", hint: "equilibrado" },
                    { v: "conciso", label: "Conciso", hint: "sin relleno" },
                    { v: "detallado", label: "Detallado", hint: "paso a paso" },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.v}
                    onClick={() => setSettings({ outputStyle: o.v })}
                    className={cn(
                      "rounded-lg border px-2 py-2 text-center transition",
                      settings.outputStyle === o.v
                        ? "border-prism-violet/60 bg-prism-violet/10 text-foreground"
                        : "border-border/60 text-muted-foreground hover:bg-accent"
                    )}
                  >
                    <span className="block text-xs font-medium">{o.label}</span>
                    <span className="block text-[10px] opacity-70">{o.hint}</span>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Da forma a cómo responde el modelo (output styles). Se aplica a todos los chats.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Label className="text-[13px]">Modo ahorro</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Al grano y sin relleno: sin preámbulos ni despedidas, y con menos historial
                    por mensaje. Para estirar los límites gratis.
                  </p>
                </div>
                <Switch
                  checked={!!settings.ahorro}
                  onCheckedChange={(v) => setSettings({ ahorro: v })}
                  aria-label="Modo ahorro"
                />
              </div>
            </div>

            <MedidorPrompt />

            <div className="space-y-2">
              <Label className="text-[13px]">Modos de agente</Label>
              <div className="grid gap-1.5">
                {MODOS_AGENTE.map((m) => {
                  const activo = (settings.agentModes ?? []).includes(m.id);
                  return (
                    <button
                      key={m.id}
                      onClick={() =>
                        setSettings({
                          agentModes: activo
                            ? (settings.agentModes ?? []).filter((x) => x !== m.id)
                            : [...(settings.agentModes ?? []), m.id],
                        })
                      }
                      aria-pressed={activo}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-left transition",
                        activo
                          ? "border-prism-violet/60 bg-prism-violet/10 text-foreground"
                          : "border-border/60 text-muted-foreground hover:bg-accent"
                      )}
                    >
                      <span className="block text-xs font-medium">{m.nombre}</span>
                      <span className="block text-[10.5px] leading-snug opacity-70">
                        {m.resumen}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Reglas cortas que se suman a tu prompt. Escritas para modelos gratuitos: los
                cuatro juntos ocupan {costeDeModos(MODOS_AGENTE.map((m) => m.id))} caracteres,
                no miles — el contexto hace falta para tu código.
                {(settings.agentModes ?? []).length > 0 && (
                  <> Ahora mismo añaden {costeDeModos(settings.agentModes ?? [])} caracteres.</>
                )}
              </p>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border/60 px-4 py-3">
              <div>
                <Label className="text-[13px]">Escudo PII (recomendado)</Label>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Enmascara parcialmente correos, teléfonos, tarjetas (validadas con Luhn), IBAN y
                  DNI/NIE en lo que se envía al modelo. 100% local, el código entre `` o ``` no se
                  toca y tu mensaje visible queda intacto.
                </p>
              </div>
              <Switch
                checked={settings.piiShield}
                onCheckedChange={(v) => setSettings({ piiShield: v })}
              />
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
                  «:free» (OpenRouter) o con capa gratuita / de prueba (Gemini, Groq,
                  Cerebras, NVIDIA NIM, Kimi, Mistral, Ollama).
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

            {settings.agentMode && (
              <div className="rounded-xl border border-border/60 px-4 py-3">
                <Label className="text-[13px]">Permisos del agente</Label>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Lo que apagues aquí no se le ofrece al modelo y, si aun así lo pide,
                  se rechaza antes de ejecutarse. Nada de esto sale de tu dispositivo:
                  «Salir a internet» son páginas y APIs que el agente lee por el proxy,
                  nunca tus claves.
                </p>
                <div className="mt-3 space-y-2">
                  {EFECTOS.map((efecto) => {
                    const concedido = permisos[efecto];
                    const cubre = toolsDelEfecto(efecto);
                    return (
                      <div
                        key={efecto}
                        className="flex items-start justify-between gap-3 rounded-lg border border-border/50 px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <Label className="text-[12.5px]">{EFECTO_LABEL[efecto]}</Label>
                          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                            {EFECTO_DESC[efecto]}
                          </p>
                          {/* La lista sale de la tabla de permisos, no escrita a
                              mano: si se añade una herramienta, aparece sola. */}
                          <p className="mt-1 font-mono text-[10.5px] leading-relaxed text-muted-foreground/70">
                            {cubre.length} herramienta{cubre.length === 1 ? "" : "s"}: {cubre.join(", ")}
                          </p>
                        </div>
                        <Switch
                          aria-label={EFECTO_LABEL[efecto]}
                          checked={concedido}
                          onCheckedChange={(v) =>
                            setSettings({ permisosAgente: { ...permisos, [efecto]: v } })
                          }
                        />
                      </div>
                    );
                  })}
                </div>
                {apagados.length > 0 && (
                  <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed">
                    Con esto apagado, el agente se queda sin{" "}
                    {sinPermiso.length === 1
                      ? "1 herramienta"
                      : `${sinPermiso.length} herramientas`}
                    : <span className="font-mono">{sinPermiso.join(", ")}</span>.
                  </p>
                )}
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

            <div className="space-y-1.5 rounded-xl border border-border/60 px-4 py-3">
              <Label className="text-[13px]">Código de acceso del proxy (opcional)</Label>
              <Input
                value={settings.accessCode}
                onChange={(e) => setSettings({ accessCode: e.target.value })}
                placeholder="Vacío = no enviar"
                className="h-8 text-xs"
                autoComplete="off"
              />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Si tu despliegue (Vercel, VPS…) define la variable <code className="rounded bg-muted px-1">PRISM_ACCESS_CODE</code>,
                escribe aquí el mismo valor para que la app pueda usar el proxy. En local no hace falta.
              </p>
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
            <VaultCard />

            <div className="rounded-xl border border-border/60 p-4">
              <h3 className="text-sm font-semibold">Copia de seguridad</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Exporta tus datos a un archivo JSON o restáuralos en cualquier dispositivo
                (ideal al instalar la PWA en uno nuevo). Las integradas de prompts y skills se
                mantienen siempre actualizadas al importar.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
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
                    toast.success("Backup completo exportado");
                  }}
                >
                  <Check className="mr-1 size-3.5" /> Todo (con chats)
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => {
                    const blob = new Blob([exportData({ includeSessions: false })], {
                      type: "application/json",
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `prism-ai-ajustes-${new Date().toISOString().slice(0, 10)}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    toast.success("Ajustes exportados (sin conversaciones)");
                  }}
                >
                  <Check className="mr-1 size-3.5" /> Solo ajustes y claves
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
              <p className="mt-2 text-[10.5px] text-muted-foreground">
                Ojo: el backup lleva las claves en texto legible — guárdalo donde no se filtre.
              </p>
            </div>

            <DiagnosticoCard />

            <TransferPanel />

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

            {/* La versión sale de package.json, no escrita a mano: este texto
                anunció «v3.1» durante cuatro versiones porque nadie lo tocó. */}
            <p className="text-center text-[11px] text-muted-foreground">
              Prism AI · Sin cuentas, sin límites
              <br />
              <span className="font-mono text-[10px] text-muted-foreground/70">
                {buildLabel()}
              </span>
            </p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/** Selector de acento personalizado: cualquier color + dos tonos complementarios generados */
function AppearanceCustom() {
  const settings = usePrism((s) => s.settings);
  const setSettings = usePrism((s) => s.setSettings);

  /** Permisos del agente, ya normalizados: los ajustes guardados de una
   * versión anterior no traen el campo, y un efecto nuevo se concede. */
  const permisos = useMemo(() => normalizarPermisos(settings.permisosAgente), [settings.permisosAgente]);
  const apagados = useMemo(() => EFECTOS.filter((e) => !permisos[e]), [permisos]);
  /** Qué herramientas quedan fuera con lo apagado ahora mismo. Se calcula del
   * catálogo real: es la única forma de que la advertencia no mienta cuando
   * se añada una herramienta nueva. */
  const sinPermiso = useMemo(
    () => TOOL_CATALOG.filter((t) => !toolPermitida(t.name, permisos).permitida).map((t) => t.name),
    [permisos]
  );
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

/** Tarjeta de seguridad: cifrado de claves con PIN opcional */
/**
 * Diagnóstico: lo que hace falta para arreglar un fallo, en un clic.
 *
 * Sale de perseguir un «Failed to fetch» a base de capturas. Lo que importaba
 * —qué copia corría, qué proveedor, qué código devolvió— estaba en tres sitios
 * distintos y ninguno se podía pegar en un mensaje. Va aquí y no en un aviso
 * de error porque cuando falla algo raro no hay error que enseñe el botón.
 */
function DiagnosticoCard() {
  const [copiado, setCopiado] = useState(false);
  const [texto, setTexto] = useState<string | null>(null);

  const generar = () => {
    const st = usePrism.getState();
    const salud = useHealth.getState();
    const ahora = Date.now();

    const proveedores = Object.entries(st.providers)
      .map(([id, cfg]) => {
        const def = PROVIDERS.find((p) => p.id === id);
        const clave = cfg.apiKey?.trim() ?? "";
        return {
          id,
          nombre: def?.name ?? id,
          activo: !!cfg.enabled,
          tieneClave: clave.length > 0,
          largoClave: clave.length,
          modelos: cfg.models?.length ?? 0,
          porProxy: !!cfg.useProxy,
          baseUrl: cfg.baseUrl ? sinSecretos(cfg.baseUrl) : undefined,
        };
      })
      .sort((a, b) => Number(b.activo) - Number(a.activo));

    const fallos = Object.entries(salud.entries)
      .filter(([, e]) => e.lastStatus !== 0 || e.consecutive > 0)
      .map(([clave, e]) => ({
        clave,
        estado: e.lastStatus,
        motivo: e.reason,
        enfriadoHasta: e.until,
      }));

    return textoDiagnostico({
      version: APP_VERSION,
      commit: APP_COMMIT,
      built: APP_BUILT ? APP_BUILT.slice(0, 10) : "",
      userAgent: navigator.userAgent,
      idioma: navigator.language,
      pantalla: `${window.screen.width}x${window.screen.height}`,
      online: navigator.onLine,
      instalada: window.matchMedia("(display-mode: standalone)").matches,
      modeloPorDefecto: st.settings.defaultModelKey ?? "",
      proveedores,
      fallos,
      sesiones: st.sessions.length,
      mensajes: st.sessions.reduce((n, s) => n + s.messages.length, 0),
      ahora,
    });
  };

  const copiar = async () => {
    const t = generar();
    setTexto(t);
    try {
      await navigator.clipboard.writeText(t);
      setCopiado(true);
      toast.success("Diagnóstico copiado", {
        description: "Pégalo donde estés pidiendo ayuda. No lleva claves ni conversaciones.",
      });
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Sin permiso de portapapeles (pasa en iOS fuera de un gesto directo):
      // se enseña el texto para seleccionarlo a mano en vez de no hacer nada.
      toast.info("Tu navegador no dejó copiar", {
        description: "Te lo dejo abajo para que lo selecciones a mano.",
      });
    }
  };

  return (
    <div className="rounded-xl border border-border/60 p-4">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <Stethoscope className="size-3.5" /> Diagnóstico
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Versión, navegador, qué proveedores tienes puestos y qué modelos están fallando ahora
        mismo. Sin claves y sin texto de tus conversaciones: se puede pegar en cualquier sitio.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={copiar}>
          {copiado ? (
            <ClipboardCheck className="mr-1 size-3.5 text-emerald-500" />
          ) : (
            <ClipboardCheck className="mr-1 size-3.5" />
          )}
          {copiado ? "Copiado" : "Copiar diagnóstico"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-xs"
          onClick={() => setTexto((t) => (t ? null : generar()))}
        >
          {texto ? "Ocultar" : "Ver qué se copia"}
        </Button>
      </div>
      {texto && (
        <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-muted/50 p-3 text-[10.5px] leading-relaxed whitespace-pre-wrap break-words">
          {texto}
        </pre>
      )}
    </div>
  );
}

function VaultCard() {
  const enabled = useVault((s) => s.enabled);
  const unlocked = useVault((s) => s.unlocked);
  const [mode, setMode] = useState<"idle" | "new" | "remove">("idle");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setMode("idle");
    setPin("");
    setPin2("");
    setBusy(false);
  };

  const submitNew = async () => {
    if (pin.length < 4) {
      toast.error("El PIN necesita al menos 4 caracteres");
      return;
    }
    if (pin !== pin2) {
      toast.error("Los dos PIN no coinciden");
      return;
    }
    setBusy(true);
    try {
      await setVaultPin(pin);
      toast.success("Claves cifradas con tu PIN", {
        description: "Se piden una vez por sesión de navegador.",
      });
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo activar el PIN");
      setBusy(false);
    }
  };

  const submitRemove = async () => {
    setBusy(true);
    const ok = await removeVaultPin(pin);
    setBusy(false);
    if (ok) {
      toast.success("PIN eliminado — las claves vuelven al almacenamiento normal");
      reset();
    } else {
      toast.error("PIN incorrecto");
    }
  };

  return (
    <div className="rounded-xl border border-border/60 p-4">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <LockKeyhole className="size-4 text-prism-violet" /> Seguridad · Cifrado con PIN
        {enabled && (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="size-3" /> {unlocked ? "activo · desbloqueado" : "activo · bloqueado"}
          </span>
        )}
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {enabled
          ? "Tus claves están cifradas con AES-GCM y no se guardan en texto claro en este dispositivo. El PIN se pide una vez por sesión."
          : "Opcional: cifra tus claves API y el token de GitHub con un PIN. Sin el PIN no se pueden descifrar, aunque extraigan los datos del navegador."}
      </p>

      {mode === "idle" && (
        <div className="mt-3 flex flex-wrap gap-2">
          {!enabled && (
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setMode("new")}>
              <LockKeyhole className="mr-1 size-3.5" /> Activar PIN
            </Button>
          )}
          {enabled && unlocked && (
            <>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setMode("new")}>
                Cambiar PIN
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => {
                  lockVault();
                  toast.info("Bóveda bloqueada para esta pestaña");
                }}
              >
                Bloquear ahora
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setMode("remove")}>
                Quitar PIN
              </Button>
            </>
          )}
          {enabled && !unlocked && (
            <p className="text-[11px] text-muted-foreground">
              Escribe tu PIN en la ventana para desbloquear esta sesión y gestionar la bóveda.
            </p>
          )}
        </div>
      )}

      {mode !== "idle" && (
        <div className="mt-3 space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
          {mode === "remove" ? (
            <p className="text-xs text-muted-foreground">
              Para quitar el PIN, confírmalo abajo. Las claves volverán al almacenamiento local normal.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Mínimo 4 caracteres. Si lo olvidas no hay recuperación: tendrías que borrar los datos
              del sitio y re-introducir las claves.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder={mode === "remove" ? "PIN actual" : "Nuevo PIN"}
              className="h-8 w-36 text-xs"
              autoComplete="off"
            />
            {mode === "new" && (
              <Input
                type="password"
                inputMode="numeric"
                value={pin2}
                onChange={(e) => setPin2(e.target.value)}
                placeholder="Repite el PIN"
                className="h-8 w-36 text-xs"
                autoComplete="off"
              />
            )}
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={busy || !pin}
              onClick={() => void (mode === "new" ? submitNew() : submitRemove())}
            >
              {busy ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
              Confirmar
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={reset}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Qué ocupa lo que se manda, antes de que escribas nada.
 *
 * De fábrica salen unos 5.400 caracteres —dos skills activas y el modo
 * agente— y hasta ahora no había forma de verlo. En un producto pensado para
 * modelos gratis, muchos con 8.000 tokens de contexto, eso es una parte
 * grande del presupuesto gastada de salida.
 *
 * Los caracteres son EXACTOS: salen de la misma función que monta el prompt
 * que viaja. Los tokens son una aproximación y se dice que lo son. */
function MedidorPrompt() {
  const settings = usePrism((s) => s.settings);
  const skills = usePrism((s) => s.skills);
  const activeSessionId = usePrism((s) => s.activeSessionId);
  const sessions = usePrism((s) => s.sessions);

  const { presupuesto } = useMemo(
    () => construirPrompt(entradaPromptActual(activeSessionId ?? undefined)),
    // se recalcula cuando cambia algo que entra en el prompt
    [settings, skills, activeSessionId, sessions]
  );

  const nivel = nivelPresupuesto(presupuesto.total);
  const gorda = piezaMasGorda(presupuesto);
  const ahorrado = presupuesto.totalSinAhorro - presupuesto.total;

  if (!presupuesto.piezas.length) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-[13px]">Lo que ocupan tus instrucciones</Label>
        <span
          className={cn(
            "font-mono text-[11px] tabular-nums",
            nivel === "critico"
              ? "text-destructive"
              : nivel === "alto"
                ? "text-amber-600 dark:text-amber-400"
                : "text-muted-foreground"
          )}
        >
          {presupuesto.total.toLocaleString("es")} car.
        </span>
      </div>

      {/* barra por piezas: la anchura es proporción real, no adorno */}
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        {presupuesto.piezas.map((p, i) => (
          <div
            key={p.id}
            title={`${p.label}: ${p.chars.toLocaleString("es")} caracteres`}
            style={{ width: `${(p.chars / presupuesto.total) * 100}%` }}
            className={cn("h-full", TONOS[i % TONOS.length])}
          />
        ))}
      </div>

      <ul className="space-y-1">
        {presupuesto.piezas.map((p, i) => (
          <li key={p.id} className="flex items-center gap-2 text-[11px]">
            <span className={cn("size-2 shrink-0 rounded-full", TONOS[i % TONOS.length])} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {p.label} <span className="opacity-60">· {p.donde}</span>
            </span>
            <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
              {p.chars.toLocaleString("es")}
            </span>
          </li>
        ))}
      </ul>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Viajan en <strong>cada</strong> mensaje, antes de tu pregunta. Son ~
        {tokensAprox(presupuesto.total).toLocaleString("es")} tokens estimando{" "}
        {CHARS_POR_TOKEN} caracteres por token: es una aproximación, el dato exacto son los
        caracteres.
      </p>

      {ahorrado > 0 && (
        <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
          El modo ahorro quita {ahorrado.toLocaleString("es")} caracteres de aquí (de{" "}
          {presupuesto.totalSinAhorro.toLocaleString("es")}), además de recortar el historial.
        </p>
      )}

      {nivel !== "ok" && gorda && (
        <p
          className={cn(
            "rounded-lg border px-2.5 py-2 text-[11px] leading-relaxed",
            nivel === "critico"
              ? "border-destructive/40 bg-destructive/5 text-muted-foreground"
              : "border-amber-500/40 bg-amber-500/[0.07] text-muted-foreground"
          )}
        >
          Es mucho para un modelo gratis de contexto corto: puede quedarse sin sitio para tu
          conversación o devolver un error. Lo que más pesa es{" "}
          <strong>{gorda.label.toLowerCase()}</strong> ({gorda.chars.toLocaleString("es")} car.),
          que se quita desde {gorda.donde}.
        </p>
      )}
    </div>
  );
}

/** Tonos de la barra. Solo sirven para distinguir piezas entre sí: no
 *  codifican ningún estado, así que no compiten con el rojo del aviso. */
const TONOS = [
  "bg-prism-violet/80",
  "bg-sky-500/70",
  "bg-emerald-500/70",
  "bg-amber-500/70",
  "bg-fuchsia-500/70",
  "bg-teal-500/70",
  "bg-indigo-500/70",
];
