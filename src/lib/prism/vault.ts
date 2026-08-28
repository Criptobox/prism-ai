"use client";
/** Prism AI — Bóveda cifrada opcional para las claves API (AES-GCM + PBKDF2).
 *
 * Al activar el PIN:
 *  - Las claves de proveedores y el token de GitHub se quitan del localStorage
 *    del store (se guardan vacíos en disco) y se guardan cifrados en una
 *    bóveda separada (`prism-vault-v1`).
 *  - Cada sesión de navegador pide el PIN una vez; después se recuerda en
 *    sessionStorage hasta que se cierre la pestaña/actualice con la sesión cerrada.
 *  - Sin el PIN, quien extraiga el localStorage solo ve claves vacías.
 *
 * Si el PIN está desactivado, Prism AI funciona exactamente como siempre.
 */
import { create } from "zustand";
import { usePrism } from "./store";
import { decryptPayload, encryptPayload, type VaultBlob, type VaultPayload } from "./crypto";
import type { ProviderId } from "./types";

const VAULT_KEY = "prism-vault-v1";
const SESSION_PIN = "prism-vault-pin";

interface VaultStore {
  enabled: boolean;
  unlocked: boolean;
}

export const useVault = create<VaultStore>(() => ({ enabled: false, unlocked: false }));

/* ——— utilidades de estado ——— */

function readBlob(): VaultBlob | null {
  try {
    const raw = localStorage.getItem(VAULT_KEY);
    return raw ? (JSON.parse(raw) as VaultBlob) : null;
  } catch {
    return null;
  }
}

function currentKeys(): VaultPayload {
  const st = usePrism.getState();
  const keys: Partial<Record<ProviderId, string>> = {};
  for (const [id, cfg] of Object.entries(st.providers)) {
    if (cfg.apiKey) keys[id as ProviderId] = cfg.apiKey;
  }
  let githubToken = "";
  try {
    githubToken = localStorage.getItem("gh_token") ?? "";
  } catch {
    /* ignore */
  }
  return { keys, githubToken };
}

/** Escribe el PIN: cifra las claves actuales y las vacía del store persistido */
export async function setVaultPin(pin: string): Promise<void> {
  if (pin.length < 4) throw new Error("El PIN necesita al menos 4 caracteres");
  const payload = currentKeys();
  const blob = await encryptPayload(pin, payload);
  localStorage.setItem(VAULT_KEY, JSON.stringify(blob));
  sessionStorage.setItem(SESSION_PIN, pin);
  // vacía las claves del store (el disco queda limpio; la memoria conserva el uso actual)
  const st = usePrism.getState();
  for (const id of Object.keys(st.providers) as ProviderId[]) {
    if (st.providers[id].apiKey) st.setProviderConfig(id, { apiKey: "" });
  }
  if (payload.githubToken) localStorage.removeItem("gh_token");
  useVault.setState({ enabled: true, unlocked: true });
}

/** Intenta desbloquear con el PIN dado. Devuelve false si es incorrecto. */
export async function unlockVault(pin: string): Promise<boolean> {
  const blob = readBlob();
  if (!blob) return true;
  let payload: VaultPayload;
  try {
    payload = await decryptPayload(pin, blob);
  } catch {
    return false;
  }
  const st = usePrism.getState();
  for (const [id, key] of Object.entries(payload.keys ?? {})) {
    if (key && st.providers[id as ProviderId]) {
      st.setProviderConfig(id as ProviderId, { apiKey: key });
    }
  }
  if (payload.githubToken) localStorage.setItem("gh_token", payload.githubToken);
  sessionStorage.setItem(SESSION_PIN, pin);
  useVault.setState({ enabled: true, unlocked: true });
  return true;
}

/** Cierra la sesión de la bóveda: pide PIN de nuevo al recargar o al bloquear */
export function lockVault(): void {
  sessionStorage.removeItem(SESSION_PIN);
  useVault.setState({ unlocked: false });
}

/** Quita el PIN: descifra a memoria (si es posible) y borra la bóveda */
export async function removeVaultPin(pin: string): Promise<boolean> {
  const blob = readBlob();
  if (!blob) {
    useVault.setState({ enabled: false, unlocked: false });
    return true;
  }
  const ok = await unlockVault(pin);
  if (!ok) return false;
  localStorage.removeItem(VAULT_KEY);
  sessionStorage.removeItem(SESSION_PIN);
  useVault.setState({ enabled: false, unlocked: false });
  return true;
}

/** ¿Tiene PIN activo este dispositivo? (sincrono, para el partialize del store) */
export function vaultEnabled(): boolean {
  try {
    return !!localStorage.getItem(VAULT_KEY);
  } catch {
    return false;
  }
}

/**
 * Arranca la bóveda: marca el estado y, si el PIN sigue en sessionStorage
 * (misma sesión de navegador), desbloquea en silencio. También mantiene la
 * bóveda al día cuando el usuario cambia una clave en Ajustes.
 */
export function initVault(): void {
  const enabled = vaultEnabled();
  useVault.setState({ enabled, unlocked: false });
  if (!enabled) return;

  const pin = sessionStorage.getItem(SESSION_PIN);
  if (pin) void unlockVault(pin);

  // Re-cifra cuando el usuario edita una clave con la bóveda abierta
  let last = JSON.stringify(currentKeys());
  usePrism.subscribe((state, prev) => {
    if (!useVault.getState().enabled || !useVault.getState().unlocked) return;
    if (state.providers === prev.providers) {
      // el token de GitHub vive fuera del store; sondearlo es barato
      const now = JSON.stringify(currentKeys());
      if (now !== last) {
        last = now;
        const p = sessionStorage.getItem(SESSION_PIN);
        if (p) void encryptPayload(p, JSON.parse(now) as VaultPayload).then((b) =>
          localStorage.setItem(VAULT_KEY, JSON.stringify(b))
        );
      }
      return;
    }
    const now = JSON.stringify(currentKeys());
    if (now !== last) {
      last = now;
      const p = sessionStorage.getItem(SESSION_PIN);
      if (p) {
        void encryptPayload(p, JSON.parse(now) as VaultPayload).then((b) =>
          localStorage.setItem(VAULT_KEY, JSON.stringify(b))
        );
      }
    }
  });
}
