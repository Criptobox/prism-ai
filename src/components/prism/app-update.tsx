"use client";
/** Prism AI — «Hay una versión nueva», en un banner que no se va solo.
 *
 * Antes era un aviso flotante. Un aviso desaparece a los pocos segundos, y si
 * estabas mirando otra cosa te lo perdías: justo lo que NO puede pasar con lo
 * único que te dice que estás usando una copia vieja. Ahora es una barra fija
 * arriba, con el botón al lado, que se queda hasta que recargas o la cierras.
 *
 * Se pregunta al volver a la pestaña y cada 15 minutos como mucho. Cerrarlo lo
 * calla para esta sesión, no para siempre: al abrir la app otro día vuelve a
 * salir si sigues sin actualizar.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_COMMIT, APP_VERSION } from "@/lib/prism/app-version";
import { CADA_MS, copiaServida, hayCopiaNueva, tocaComprobar } from "@/lib/prism/app-update";

export function useVersionNueva() {
  const ultima = useRef(0);
  const [nueva, setNueva] = useState<{ version: string; commit: string } | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    let vivo = true;

    const comprobar = async () => {
      if (!vivo || document.visibilityState !== "visible") return;
      const ahora = Date.now();
      if (!tocaComprobar(ahora, ultima.current, CADA_MS)) return;
      ultima.current = ahora;

      const servida = await copiaServida(fetch, ctrl.signal);
      if (!vivo || !servida) return;
      if (!hayCopiaNueva({ version: APP_VERSION, commit: APP_COMMIT }, servida)) return;
      setNueva(servida);
    };

    void comprobar();
    const alVolver = () => void comprobar();
    document.addEventListener("visibilitychange", alVolver);
    const id = window.setInterval(alVolver, CADA_MS);
    return () => {
      vivo = false;
      ctrl.abort();
      document.removeEventListener("visibilitychange", alVolver);
      window.clearInterval(id);
    };
  }, []);

  return nueva;
}

export function BannerVersionNueva() {
  const nueva = useVersionNueva();
  const [cerrado, setCerrado] = useState(false);
  const recargar = useCallback(() => window.location.reload(), []);

  if (!nueva || cerrado) return null;

  return (
    <div
      role="status"
      className="flex shrink-0 items-center gap-2 border-b border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-[11.5px] sm:px-4"
    >
      <ArrowUpCircle className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
      <p className="min-w-0 flex-1 truncate">
        <span className="font-medium">Hay una versión nueva de Prism.</span>{" "}
        <span className="text-muted-foreground">
          Tienes la v{APP_VERSION}
          {APP_COMMIT ? ` · ${APP_COMMIT}` : ""}; ya está la v{nueva.version}
          {nueva.commit ? ` · ${nueva.commit}` : ""}.
        </span>
      </p>
      <Button
        size="sm"
        className="h-7 shrink-0 gap-1 px-2.5 text-[11px]"
        onClick={recargar}
      >
        Actualizar
      </Button>
      <button
        type="button"
        onClick={() => setCerrado(true)}
        className="shrink-0 rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
        aria-label="Cerrar el aviso de versión nueva"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
