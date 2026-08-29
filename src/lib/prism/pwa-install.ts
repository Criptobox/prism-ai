"use client";
/** Prism AI — Estado de instalación como app (PWA).
 *
 * Fuera del componente a propósito: el navegador dispara `beforeinstallprompt`
 * en cuanto la página cumple los requisitos, que suele ser ANTES de que React
 * monte nada. Si solo se escuchara desde un efecto, ese evento se perdería y el
 * botón de instalar no aparecería nunca.
 *
 * Y el evento es de UN SOLO USO: llamar a `prompt()` dos veces sobre el mismo
 * lanza `InvalidStateError`. De ahí que se descarte SIEMPRE tras usarlo, se
 * acepte o no.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallResult = "accepted" | "dismissed" | "unavailable" | "error";

interface Estado {
  /** el navegador ofrece instalar y aún no se ha gastado la invitación */
  disponible: boolean;
  /** ya se está ejecutando como app instalada */
  instalada: boolean;
}

let guardado: BeforeInstallPromptEvent | null = null;
let instalada = false;
const oyentes = new Set<() => void>();
let snapshot: Estado = { disponible: false, instalada: false };

function publicar() {
  const siguiente = { disponible: guardado !== null && !instalada, instalada };
  if (siguiente.disponible === snapshot.disponible && siguiente.instalada === snapshot.instalada) {
    return; // mismo estado: no se toca la referencia (useSyncExternalStore la compara)
  }
  snapshot = siguiente;
  for (const fn of oyentes) fn();
}

/** ¿La página se está viendo ya como app instalada? */
export function enModoApp(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    // iOS no implementa display-mode; usa su propia marca
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

let iniciado = false;

/** Engancha los eventos del navegador. Idempotente. */
export function iniciarInstalacion(): void {
  if (iniciado || typeof window === "undefined") return;
  iniciado = true;
  instalada = enModoApp();

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // sin esto Chrome muestra su propia barra y no nos deja elegir el momento
    guardado = e as BeforeInstallPromptEvent;
    publicar();
  });

  window.addEventListener("appinstalled", () => {
    guardado = null;
    instalada = true;
    publicar();
  });

  publicar();
}

export function suscribirse(fn: () => void): () => void {
  oyentes.add(fn);
  return () => {
    oyentes.delete(fn);
  };
}

export function leerEstado(): Estado {
  return snapshot;
}

export const ESTADO_SERVIDOR: Estado = { disponible: false, instalada: false };

/**
 * Lanza el diálogo del navegador.
 *
 * Pase lo que pase, la invitación se consume: si el usuario la descarta, el
 * navegador emitirá otra más adelante. Reutilizar la misma es lo que dejaba el
 * botón colgado en «instalando».
 */
export async function instalar(): Promise<InstallResult> {
  const evento = guardado;
  if (!evento) return "unavailable";
  guardado = null;
  publicar();
  try {
    await evento.prompt();
    const { outcome } = await evento.userChoice;
    return outcome;
  } catch {
    return "error";
  }
}

/** Instrucciones manuales cuando el navegador no ofrece el diálogo. */
export function instruccionesManuales(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) {
    return "En iPhone/iPad tiene que ser desde Safari: pulsa Compartir (el cuadrado con la flecha) y elige «Añadir a pantalla de inicio».";
  }
  if (/firefox/.test(ua)) {
    return "En Firefox: menú (⋮) → «Instalar» o «Añadir a la pantalla de inicio».";
  }
  if (/android/.test(ua)) {
    return "En Chrome para Android: menú (⋮) → «Añadir a pantalla de inicio» o «Instalar aplicación». Si no aparece, entra por Chrome y no desde el navegador de otra app.";
  }
  return "En el navegador: busca el icono de instalar en la barra de direcciones, o menú (⋮) → «Instalar Prism AI».";
}

/** Solo para las pruebas: devuelve el módulo a su estado inicial. */
export function _reiniciarParaTests(): void {
  guardado = null;
  instalada = false;
  iniciado = false;
  oyentes.clear();
  snapshot = { disponible: false, instalada: false };
}
