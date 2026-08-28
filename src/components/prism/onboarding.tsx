"use client";
/** Prism AI — Asistente de primera ejecución (3 pasos: bienvenida → clave gratis → instalar como app) */
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  ExternalLink,
  KeyRound,
  Loader2,
  Monitor,
  PartyPopper,
  Radar,
  Share,
  ShieldCheck,
  Smartphone,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PrismLogo } from "./logo";
import { usePrism } from "@/lib/prism/store";
import { fetchModels } from "@/lib/prism/chat-client";
import { makeModelKey } from "@/lib/prism/types";
import { cn } from "@/lib/utils";

const TOTAL_STEPS = 3;

const FEATURES = [
  { icon: Sparkles, color: "text-emerald-500", title: "Modelos gratis", text: "Solo verás modelos con capa gratuita: Kimi K3, Gemini, Groq y más." },
  { icon: Eye, color: "text-prism-pink", title: "Vista previa en vivo", text: "Si la IA crea una página web, la ves renderizarse mientras escribe." },
  { icon: WandSparkles, color: "text-prism-violet", title: "Modo agente", text: "Bucles de plan → ejecutar → revisar para tareas grandes." },
  { icon: ShieldCheck, color: "text-prism-cyan", title: "100% privado", text: "Tus claves y conversaciones se quedan en tu dispositivo." },
];

export function OnboardingDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const providers = usePrism((s) => s.providers);
  const setProviderConfig = usePrism((s) => s.setProviderConfig);
  const setSettings = usePrism((s) => s.setSettings);
  const setOnboardingDone = usePrism((s) => s.setOnboardingDone);

  const [step, setStep] = useState(1);
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const close = () => {
    setOnboardingDone(true);
    onOpenChange(false);
  };

  /** Prueba la clave contra GET /models de AiHubMix (vía proxy de la app) */
  const testConnection = async () => {
    const trimmed = key.trim();
    if (!trimmed || testing) return;
    setTesting(true);
    setResult(null);
    try {
      const models = await fetchModels("aihubmix", { ...providers.aihubmix, apiKey: trimmed });
      const free = models.filter((m) => m.includes("-free")).length;
      setResult({
        ok: true,
        msg: `Conexión correcta: ${models.length} modelos disponibles (${free} gratis con sufijo -free).`,
      });
    } catch (e) {
      setResult({
        ok: false,
        msg: e instanceof Error ? e.message : "No se pudo conectar. Revisa la clave e inténtalo de nuevo.",
      });
    } finally {
      setTesting(false);
    }
  };

  /** Guarda la clave, habilita AiHubMix y fija el modelo gratis por defecto */
  const saveAndContinue = () => {
    const trimmed = key.trim();
    if (!trimmed) return;
    const firstFree = providers.aihubmix.models[0] ?? "coding-kimi-k3-free";
    setProviderConfig("aihubmix", { apiKey: trimmed, enabled: true });
    setSettings({ defaultModelKey: makeModelKey("aihubmix", firstFree) });
    toast.success("AiHubMix conectado", {
      description: `Modelo gratis activo: ${firstFree}`,
    });
    setStep(TOTAL_STEPS);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) close();
      }}
    >
      <DialogContent className="max-w-lg gap-0 overflow-hidden rounded-2xl border-border/60 p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Guía inicial de Prism AI</DialogTitle>
          <DialogDescription>Configura Prism AI en tres pasos</DialogDescription>
        </DialogHeader>

        {/* Indicador de progreso */}
        <div className="flex items-center justify-center gap-1.5 pt-5">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((n) => (
            <span
              key={n}
              className={cn(
                "h-1.5 rounded-full transition-all",
                n === step ? "w-6 prism-gradient-bg" : "w-1.5 bg-border"
              )}
            />
          ))}
        </div>

        <div className="px-6 pb-6 pt-4">
          {/* ——— Paso 1 · Bienvenida ——— */}
          {step === 1 && (
            <div className="text-center">
              <div className="mb-4 flex justify-center">
                <div className="relative">
                  <div className="absolute inset-0 -z-10 blur-2xl prism-gradient-bg opacity-25" />
                  <PrismLogo size={64} glow />
                </div>
              </div>
              <h2 className="text-xl font-bold tracking-tight">
                Bienvenido a Prism <span className="prism-gradient-text">AI</span>
              </h2>
              <p className="mx-auto mt-1.5 max-w-sm text-balance text-[13px] leading-relaxed text-muted-foreground">
                Un prisma, todos tus modelos. Chatea con las mejores IAs usando
                tu propia clave — sin cuentas, sin cuotas y con los modelos
                gratis siempre a la vista.
              </p>
              <div className="mt-5 grid grid-cols-2 gap-2 text-left">
                {FEATURES.map((f) => (
                  <div key={f.title} className="rounded-xl border border-border/60 bg-card/50 p-3">
                    <f.icon className={cn("size-4", f.color)} />
                    <p className="mt-1.5 text-xs font-semibold">{f.title}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{f.text}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex items-center justify-center gap-2">
                <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={close}>
                  Saltar guía
                </Button>
                <Button
                  className="prism-gradient-bg h-9 border-0 text-white hover:opacity-90"
                  onClick={() => setStep(2)}
                >
                  Empezar <ArrowRight className="ml-1 size-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ——— Paso 2 · Clave gratis ——— */}
          {step === 2 && (
            <div>
              <div className="flex items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl prism-gradient-bg text-white">
                  <KeyRound className="size-4.5" />
                </div>
                <div>
                  <h2 className="text-base font-bold tracking-tight">Conecta tus modelos gratis</h2>
                  <p className="text-xs text-muted-foreground">
                    Una clave de AiHubMix desbloquea 27+ modelos, incluido Kimi K3 (contexto 1M).
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-2.5">
                <div className="relative">
                  <Input
                    type={showKey ? "text" : "password"}
                    value={key}
                    onChange={(e) => {
                      setKey(e.target.value);
                      setResult(null);
                    }}
                    placeholder="sk-…  pega tu clave aquí"
                    className="h-10 pr-10 font-mono text-[13px]"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && key.trim()) saveAndContinue();
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showKey ? "Ocultar clave" : "Mostrar clave"}
                  >
                    {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>

                <a
                  href="https://aihubmix.com/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-prism-violet hover:underline"
                >
                  Crear clave gratis en aihubmix.com <ExternalLink className="size-3" />
                </a>

                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Cuenta nueva sin recargar: 10 intentos de prueba. Con una recarga pequeña, los
                  modelos <code className="rounded bg-muted px-1">-free</code> quedan con límites
                  diarios generosos. También puedes conectar Gemini o Groq (gratis completos) después,
                  en Ajustes → Proveedores.
                </p>

                {/* Resultado de la prueba */}
                {result && (
                  <div
                    className={cn(
                      "rounded-lg border px-3 py-2 text-xs leading-relaxed",
                      result.ok
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"
                    )}
                    role="status"
                  >
                    {result.msg}
                  </div>
                )}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => setStep(1)}>
                  <ArrowLeft className="mr-1 size-4" /> Atrás
                </Button>
                <div className="flex-1" />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 border-border/70 text-xs"
                  disabled={!key.trim() || testing}
                  onClick={() => void testConnection()}
                >
                  {testing ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
                  {testing ? "Probando…" : "Probar conexión"}
                </Button>
                <Button
                  className="prism-gradient-bg h-9 border-0 text-white hover:opacity-90"
                  disabled={!key.trim()}
                  onClick={saveAndContinue}
                >
                  Guardar y continuar <ArrowRight className="ml-1 size-4" />
                </Button>
              </div>
              <button
                onClick={() => setStep(TOTAL_STEPS)}
                className="mt-3 w-full text-center text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
              >
                Todavía no tengo clave — configurarla después
              </button>
            </div>
          )}

          {/* ——— Paso 3 · Instalar como app ——— */}
          {step === 3 && (
            <div>
              <div className="flex items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl prism-gradient-bg text-white">
                  <PartyPopper className="size-4.5" />
                </div>
                <div>
                  <h2 className="text-base font-bold tracking-tight">
                    {providers.aihubmix.enabled ? "Todo listo" : "Último paso"}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {providers.aihubmix.enabled
                      ? "Tu clave quedó guardada solo en este dispositivo."
                      : "Instala Prism AI como app y descubre el Radar de gratis."}
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {[
                  {
                    icon: Monitor,
                    title: "Escritorio (Chrome / Edge)",
                    text: "Icono «Instalar» en la barra de direcciones.",
                  },
                  {
                    icon: Smartphone,
                    title: "Android",
                    text: "Menú del navegador → «Instalar aplicación».",
                  },
                  {
                    icon: Share,
                    title: "iPhone / iPad",
                    text: "Safari → Compartir → «Añadir a pantalla de inicio».",
                  },
                ].map((p) => (
                  <div
                    key={p.title}
                    className="flex items-start gap-3 rounded-xl border border-border/60 bg-card/50 px-3 py-2.5"
                  >
                    <p.icon className="mt-0.5 size-4 shrink-0 text-prism-cyan" />
                    <div>
                      <p className="text-xs font-semibold">{p.title}</p>
                      <p className="text-[11px] text-muted-foreground">{p.text}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="glow-accent mt-4 flex items-start gap-3 rounded-xl border border-border/60 bg-card/70 px-3 py-2.5">
                <Radar className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground">Tip:</span> el{" "}
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">Radar</span>{" "}
                  de la barra lateral te avisa de nuevos modelos gratis y los activa con 1 clic.
                </p>
              </div>

              <div className="mt-5 flex items-center gap-2">
                <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => setStep(2)}>
                  <ArrowLeft className="mr-1 size-4" /> Atrás
                </Button>
                <div className="flex-1" />
                <Button
                  className="prism-gradient-bg h-9 border-0 text-white hover:opacity-90"
                  onClick={close}
                >
                  Empezar a chatear <Sparkles className="ml-1 size-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
