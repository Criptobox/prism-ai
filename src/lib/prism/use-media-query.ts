"use client";
/** Prism AI — Suscripción a una media query desde React.
 *
 * `useSyncExternalStore` en vez de `useState` + efecto: así el primer render ya
 * conoce la respuesta en el cliente y no hay parpadeo, y en el servidor se
 * devuelve el valor de respaldo sin tocar `window`.
 */
import { useCallback, useSyncExternalStore } from "react";

export function useMediaQuery(query: string, fallback = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined") return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query]
  );

  const get = useCallback(() => window.matchMedia(query).matches, [query]);
  return useSyncExternalStore(subscribe, get, () => fallback);
}

/** Ancho por debajo del cual un diálogo «con marco» solo desperdicia sitio. */
export const PANTALLA_ESTRECHA = "(max-width: 1023px)";
