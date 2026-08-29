"use client";
/** Prism AI — Registro del Service Worker + botón de instalación PWA */
import { useSyncExternalStore, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, MonitorDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ESTADO_SERVIDOR,
  iniciarInstalacion,
  instalar,
  instruccionesManuales,
  leerEstado,
  suscribirse,
} from "@/lib/prism/pwa-install";

iniciarInstalacion();

export function usePwaInstall() {
  const estado = useSyncExternalStore(suscribirse, leerEstado, () => ESTADO_SERVIDOR);
  return { available: estado.disponible, installed: estado.instalada, install: instalar };
}

/** Registra el service worker (silencioso). */
export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const doRegister = () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* sin soporte: la app funciona igual online */
    });
  };
  if (document.readyState === "complete") {
    doRegister();
  } else {
    window.addEventListener("load", doRegister, { once: true });
  }
}

/**
 * Botón de instalar.
 *
 * Se muestra SIEMPRE que la app no esté ya instalada, aunque el navegador no
 * ofrezca su diálogo: antes desaparecía en ese caso —que es justo el de iPhone
 * y el de Firefox— y no quedaba ninguna pista de cómo instalarla. Sin diálogo
 * disponible, el botón explica el camino manual de ese navegador.
 */
export function InstallButton({ compact = false }: { compact?: boolean }) {
  const { available, installed, install } = usePwaInstall();
  const [busy, setBusy] = useState(false);

  if (installed) {
    return compact ? (
      <span
        className="inline-flex items-center gap-1.5 text-xs text-emerald-500"
        title="App instalada"
      >
        <CheckCircle2 className="size-3.5" />
      </span>
    ) : (
      <span className="inline-flex items-center gap-2 text-xs text-emerald-500">
        <CheckCircle2 className="size-4" /> Instalada
      </span>
    );
  }

  const onClick = async () => {
    setBusy(true);
    try {
      const result = await install();
      if (result === "unavailable") {
        toast.info("Instalación manual", {
          description: instruccionesManuales(navigator.userAgent),
          duration: 9000,
        });
      } else if (result === "error") {
        toast.error("El navegador no pudo abrir el diálogo", {
          description: instruccionesManuales(navigator.userAgent),
          duration: 9000,
        });
      } else if (result === "dismissed") {
        toast.info("Instalación cancelada", {
          description: "Puedes volver a intentarlo cuando quieras desde este mismo botón.",
        });
      }
      // «accepted» no dice nada: el evento `appinstalled` cambia el botón solo
    } finally {
      // pase lo que pase. Antes, una excepción dentro de install() dejaba el
      // botón desactivado para siempre: eso era el «instalando» que no acababa.
      setBusy(false);
    }
  };

  // MonitorDown y no Download: la flecha de descarga sola se confundía con
  // «exportar la conversación», que estaba justo al lado con el mismo dibujo.
  const Icono = busy ? Loader2 : MonitorDown;
  const titulo = available ? "Instalar Prism AI" : "Cómo instalar Prism AI";

  return compact ? (
    <Button
      size="icon"
      variant="ghost"
      className="size-8"
      onClick={onClick}
      disabled={busy}
      title={titulo}
      aria-label={titulo}
    >
      <Icono className={busy ? "size-4 animate-spin" : "size-4"} />
    </Button>
  ) : (
    <Button
      size="sm"
      onClick={onClick}
      disabled={busy}
      className="prism-gradient-bg border-0 text-white hover:opacity-90"
    >
      <Icono className={busy ? "mr-1.5 size-4 animate-spin" : "mr-1.5 size-4"} />
      {busy ? "Instalando…" : available ? "Instalar app" : "Cómo instalar"}
    </Button>
  );
}
