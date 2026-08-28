"use client";
/** Prism AI — Registro del Service Worker + botón de instalación PWA */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<(available: boolean) => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    listeners.forEach((fn) => fn(true));
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    listeners.forEach((fn) => fn(false));
    toast.success("Prism AI instalada", {
      description: "Ábrela desde tu escritorio o pantalla de inicio.",
    });
  });
}

export function usePwaInstall() {
  const [available, setAvailable] = useState(false);
  const [installed, setInstalled] = useState(
    typeof window !== "undefined" &&
      (window.matchMedia("(display-mode: standalone)").matches ||
        // iOS
        (window.navigator as unknown as { standalone?: boolean }).standalone === true)
  );

  useEffect(() => {
    const fn = (v: boolean) => setAvailable(v);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  const install = async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
    if (!deferredPrompt) return "unavailable";
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      deferredPrompt = null;
      setAvailable(false);
    }
    return outcome;
  };

  return { available: available && !installed, installed, install };
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

export function InstallButton({ compact = false }: { compact?: boolean }) {
  const { available, installed, install } = usePwaInstall();
  const [busy, setBusy] = useState(false);

  if (installed) {
    return compact ? (
      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-500" title="App instalada">
        <CheckCircle2 className="size-3.5" />
      </span>
    ) : (
      <span className="inline-flex items-center gap-2 text-xs text-emerald-500">
        <CheckCircle2 className="size-4" /> Instalada
      </span>
    );
  }
  if (!available) return null;

  const onClick = async () => {
    setBusy(true);
    const result = await install();
    setBusy(false);
    if (result === "unavailable") {
      toast.info("Instalación manual", {
        description:
          /iphone|ipad/i.test(navigator.userAgent)
            ? "En iOS: Compartir → «Añadir a pantalla de inicio»."
            : "Usa el menú del navegador → «Instalar app».",
      });
    }
  };

  return compact ? (
    <Button
      size="icon"
      variant="ghost"
      className="size-8"
      onClick={onClick}
      disabled={busy}
      title="Instalar Prism AI"
    >
      <Download className="size-4" />
    </Button>
  ) : (
    <Button
      size="sm"
      onClick={onClick}
      disabled={busy}
      className="prism-gradient-bg text-white border-0 hover:opacity-90"
    >
      <Download className="size-4 mr-1.5" /> Instalar app
    </Button>
  );
}
