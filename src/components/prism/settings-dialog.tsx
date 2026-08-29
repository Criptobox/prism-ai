"use client";
/** Prism AI — Ajustes: proveedores, claves API, parámetros de chat y datos */
import { useEffect, useRef, useState } from "react";
import {
  Check,
  Database,
  KeyRound,
  Loader2,
  LockKeyhole,
  MessageSquare,
  Palette,
  ShieldCheck,
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
import { ACCENTS, ACCENT_CUSTOM, normalizeHex } from "@/lib/prism/accent";
import { usePrism } from "@/lib/prism/store";
import { buildLabel } from "@/lib/prism/app-version";
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
