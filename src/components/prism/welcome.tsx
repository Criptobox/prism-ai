"use client";
/** Prism AI — Pantalla de bienvenida */
import { Eye, KeyRound, Sparkles, ShieldCheck, Infinity as InfinityIcon } from "lucide-react";
import { PrismLogo } from "./logo";
import { Button } from "@/components/ui/button";
import { usePrism } from "@/lib/prism/store";
import { PROVIDERS } from "@/lib/prism/providers";
import { makeModelKey } from "@/lib/prism/types";

const SUGGESTIONS = [
  {
    icon: "🖥️",
    title: "Crea una página",
    text: "Crea una página de aterrizaje para una cafetería de especialidad, en un solo archivo HTML con diseño moderno y animaciones",
  },
  {
    icon: "🎮",
    title: "Haz un juego",
    text: "Crea el juego de la serpiente en un solo archivo HTML con controles táctiles, puntuación y diseño pulido",
  },
  {
    icon: "✨",
    title: "Escribe",
    text: "Ayúdame a redactar un correo profesional para mi jefe",
  },
  {
    icon: "📊",
    title: "App con datos",
    text: "Crea un panel de gastos mensuales en HTML con gráficos animados y guardado en el navegador",
  },
];

export function Welcome({
  onPick,
  onOpenSettings,
  onOpenSkills,
  onQuickSetup,
}: {
  onPick: (text: string) => void;
  onOpenSettings: () => void;
  onOpenSkills?: () => void;
  onQuickSetup: (providerId: "aihubmix") => void;
}) {
  const providers = usePrism((s) => s.providers);
  const settings = usePrism((s) => s.settings);
  const setSettings = usePrism((s) => s.setSettings);
  const aihubmixReady = providers.aihubmix.enabled;
  const anyProvider = PROVIDERS.some((p) => providers[p.id].enabled);
  const featured = PROVIDERS.find((p) => p.featured)!;

  const useAiHubMixDefault = () => {
    if (!providers.aihubmix.models.length) return;
    setSettings({ defaultModelKey: makeModelKey("aihubmix", providers.aihubmix.models[0]) });
  };

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl text-center">
        {/* Hero */}
        <div className="mb-5 flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 -z-10 blur-2xl prism-gradient-bg opacity-25" />
            <PrismLogo size={84} glow />
          </div>
        </div>
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Prism <span className="prism-gradient-text">AI</span>
        </h2>
        <p className="mx-auto mt-2 max-w-md text-balance text-sm text-muted-foreground sm:text-[15px]">
          Un prisma, todos tus modelos. Chatea sin límites con tus propias APIs y
          mira cómo la IA construye páginas web en vivo — sin cuentas, sin cuotas,
          sin restricciones.
        </p>

        {/* Ventajas */}
        <div className="mt-6 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground sm:grid-cols-4">
          <div className="rounded-xl border border-border/60 bg-card/50 px-2 py-2.5">
            <ShieldCheck className="mx-auto mb-1 size-4 text-prism-violet" />
            Claves locales
          </div>
          <div className="rounded-xl border border-border/60 bg-card/50 px-2 py-2.5">
            <InfinityIcon className="mx-auto mb-1 size-4 text-prism-cyan" />
            Uso ilimitado
          </div>
          <div className="rounded-xl border border-border/60 bg-card/50 px-2 py-2.5">
            <Eye className="mx-auto mb-1 size-4 text-prism-pink" />
            Vista previa en vivo
          </div>
          <div className="rounded-xl border border-border/60 bg-card/50 px-2 py-2.5">
            <Sparkles className="mx-auto mb-1 size-4 text-emerald-500" />
            Modelos gratis
          </div>
        </div>

        {/* Setup AiHubMix */}
        {!aihubmixReady && (
          <div className="glow-accent mt-6 rounded-2xl border border-border/60 bg-card/70 p-4 text-left">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl prism-gradient-bg text-white">
                <KeyRound className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold">
                  Empieza con {featured.name}
                  <span className="ml-2 rounded-full bg-prism-violet/15 px-2 py-0.5 text-[10px] font-medium text-prism-violet">
                    recomendado
                  </span>
                </h3>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  Una sola clave para GPT, Claude, Gemini, DeepSeek y decenas más.
                  Crea tu clave en aihubmix.com y pégala en Ajustes.
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => onQuickSetup("aihubmix")} className="prism-gradient-bg h-8 border-0 text-white hover:opacity-90">
                    Configurar clave
                  </Button>
                  <a href={featured.keyUrl} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="outline" className="h-8 border-border/70 text-xs">
                      Obtener API key ↗
                    </Button>
                  </a>
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onOpenSettings}>
                    Otros proveedores
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {aihubmixReady && !settings.defaultModelKey && (
          <div className="mt-6">
            <Button size="sm" className="prism-gradient-bg h-8 border-0 text-white" onClick={useAiHubMixDefault}>
              <Sparkles className="mr-1 size-3.5" /> Activar {providers.aihubmix.models[0]}
            </Button>
          </div>
        )}

        {onOpenSkills && aihubmixReady && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            <button
              onClick={onOpenSkills}
              className="underline decoration-dotted underline-offset-2 hover:text-foreground"
            >
              Instala skills
            </button>{" "}
            para dar superpoderes a tus modelos: desarrollador web, mentor de código, traductor y más.
          </p>
        )}

        {/* Sugerencias */}
        <div className="mt-7 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.title}
              onClick={() => onPick(s.text)}
              disabled={!anyProvider && !aihubmixReady}
              className="group rounded-xl border border-border/60 bg-card/40 px-3.5 py-3 text-left transition hover:border-prism-violet/40 hover:bg-card disabled:cursor-not-allowed disabled:opacity-50"
            >
              <p className="text-xs font-medium text-foreground/90">
                <span className="mr-1.5">{s.icon}</span>
                {s.title}
              </p>
              <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-muted-foreground">
                {s.text}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
