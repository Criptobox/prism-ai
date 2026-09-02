"use client";
/** Prism AI — Memoria de los modelos que el proveedor no reconoce.
 *
 * «Probar modelos» ya sabía cuáles fallan y los tachaba en rojo. El problema:
 * ese resultado vivía en un `useState` DENTRO del diálogo de Ajustes. Al
 * cerrarlo se perdía, y el selector de modelos del chat seguía ofreciendo los
 * cuatro que acababan de fallar como si nada. Elegías uno y volvía el error.
 *
 * Aquí ese veredicto se guarda y se comparte. Dos reglas que importan:
 *
 *  1. Solo entra lo que es **culpa confirmada del modelo** —«no existe» o «tu
 *     clave no llega a él»—, nunca un límite de peticiones ni una caída del
 *     proveedor ni un servidor local apagado. De eso ya se encarga
 *     `culpaConfirmadaDelModelo`, y acusar a un modelo bueno es peor que dejar
 *     pasar uno malo.
 *  2. Una prueba que sale BIEN limpia la marca. Los proveedores retiran y
 *     reponen modelos; una lista negra que solo crece acabaría escondiendo
 *     modelos que ya funcionan.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { safeLocalStorage } from "./store";

export interface ModeloRoto {
  /** código HTTP con el que falló (0 = sin respuesta) */
  status: number;
  /** lo que contestó el proveedor, recortado */
  detail?: string;
  /** cuándo se comprobó (epoch ms) */
  at: number;
}

interface ModelosRotosState {
  /** por `modelKey` (proveedor::modelo) */
  rotos: Record<string, ModeloRoto>;
  marcar: (modelKey: string, info: ModeloRoto) => void;
  limpiar: (modelKey: string) => void;
  /** al recargar la lista de un proveedor, sus marcas viejas ya no valen */
  limpiarProveedor: (providerId: string) => void;
}

export const useModelosRotos = create<ModelosRotosState>()(
  persist(
    (set) => ({
      rotos: {},
      marcar: (modelKey, info) =>
        set((s) => ({ rotos: { ...s.rotos, [modelKey]: info } })),
      limpiar: (modelKey) =>
        set((s) => {
          if (!s.rotos[modelKey]) return s;
          const { [modelKey]: _fuera, ...resto } = s.rotos;
          return { rotos: resto };
        }),
      limpiarProveedor: (providerId) =>
        set((s) => ({
          rotos: Object.fromEntries(
            Object.entries(s.rotos).filter(([k]) => !k.startsWith(`${providerId}::`))
          ),
        })),
    }),
    { name: "prism-modelos-rotos-v1", storage: createJSONStorage(safeLocalStorage) }
  )
);

/* ---------- decisiones puras (sin React, con sus tests) ---------- */

/** ¿Este modelo está marcado como no utilizable? */
export function estaRoto(rotos: Record<string, ModeloRoto>, modelKey: string): boolean {
  return !!rotos[modelKey];
}

/**
 * Quita de una lista los modelos marcados.
 *
 * `conservar` es la escapatoria: el modelo que tienes elegido AHORA no se
 * quita aunque esté marcado, o la cabecera del chat se quedaría en blanco
 * señalando a un modelo que ya no aparece en ninguna lista.
 */
export function sinRotos(
  claves: string[],
  rotos: Record<string, ModeloRoto>,
  conservar?: string | null
): string[] {
  return claves.filter((k) => k === conservar || !estaRoto(rotos, k));
}

/** Frase para el aviso: qué contestó y cuándo se comprobó. */
export function motivoRoto(r: ModeloRoto): string {
  const cuando = new Date(r.at).toLocaleDateString("es");
  const que = r.detail?.trim()
    ? r.detail.trim().slice(0, 120)
    : r.status
      ? `respondió ${r.status}`
      : "no respondió";
  return `Comprobado el ${cuando}: ${que}`;
}
