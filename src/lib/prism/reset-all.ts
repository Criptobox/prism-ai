"use client";
/** Prism AI — Reset total del dispositivo.
 *
 * `resetAll` del store solo resetea el estado principal. La app vive en varios
 * localStorage (store, bóveda, salud, métricas, token de GitHub, demo) y el
 * botón «Borrar todo» prometía borrar TODOS los datos: esto lo hace de verdad.
 */
import { usePrism } from "./store";
import { useVault } from "./vault";
import { useHealth } from "./health";
import { useUsage } from "./usage";
import { ghSetAccount } from "./github-upload";

const STORAGE_KEYS = [
  // token y cuenta de GitHub (github-upload.ts) + clave legacy de la bóveda
  "prism-github-token",
  "prism-github-account",
  "gh_token",
  // bóveda cifrada y PIN de sesión
  "prism-vault-v1",
  "prism-vault-pin",
  // salud de modelos y métricas de uso
  "prism-health-v1",
  "prism-usage-v1",
  // demo de vista previa ya reproducida
  "prism-preview-demo",
];

export function hardReset(): void {
  for (const key of STORAGE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* almacenamiento no disponible */
    }
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
  // token+cuenta fuera (dispara el evento para que la UI se entere)
  ghSetAccount(null);
  useVault.setState({ enabled: false, unlocked: false });
  useHealth.getState().clearAll();
  useUsage.getState().reset();
  usePrism.getState().resetAll();
}
