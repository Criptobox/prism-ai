"use client";
/** Prism AI — «Hay una versión nueva» con su botón de recargar.
 *
 * Se pregunta al volver a la pestaña y cada 15 minutos como mucho. El aviso no
 * se va solo: si desaparece a los cinco segundos mientras miras otra cosa, es
 * como no haberlo puesto.
 */
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { APP_COMMIT, APP_VERSION } from "@/lib/prism/app-version";
import { CADA_MS, copiaServida, hayCopiaNueva, tocaComprobar } from "@/lib/prism/app-update";

export function useAvisoDeVersionNueva() {
  const ultima = useRef(0);
  const avisado = useRef(false);

  useEffect(() => {
    const ctrl = new AbortController();

    const comprobar = async () => {
      if (avisado.current || document.visibilityState !== "visible") return;
      const ahora = Date.now();
      if (!tocaComprobar(ahora, ultima.current, CADA_MS)) return;
      ultima.current = ahora;

      const servida = await copiaServida(fetch, ctrl.signal);
      if (!servida || avisado.current) return;
      if (!hayCopiaNueva({ version: APP_VERSION, commit: APP_COMMIT }, servida)) return;

      avisado.current = true;
      toast("Hay una versión nueva de Prism", {
        description: `Estás en v${APP_VERSION}${APP_COMMIT ? ` · ${APP_COMMIT}` : ""}. En el servidor ya está v${servida.version}${servida.commit ? ` · ${servida.commit}` : ""}.`,
        // sin duración: es una decisión, no una notificación de paso
        duration: Infinity,
        action: {
          label: "Recargar",
          onClick: () => window.location.reload(),
        },
      });
    };

    void comprobar();
    const alVolver = () => void comprobar();
    document.addEventListener("visibilitychange", alVolver);
    const id = window.setInterval(alVolver, CADA_MS);
    return () => {
      ctrl.abort();
      document.removeEventListener("visibilitychange", alVolver);
      window.clearInterval(id);
    };
  }, []);
}
