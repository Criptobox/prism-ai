"use client";
/** Prism AI — Modo foco (zen): solo la conversación.
 *
 * Oculta la barra lateral y la vista previa, y evita que el split se abra solo
 * cuando el modelo escribe HTML. Se recuerda entre sesiones en localStorage
 * (no en el store de zustand: es preferencia de vista, no dato de la app).
 */
import { useCallback, useEffect, useState } from "react";

export const FOCUS_KEY = "prism-focus-mode";

export function readFocusMode(): boolean {
  try {
    return localStorage.getItem(FOCUS_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeFocusMode(on: boolean): void {
  try {
    localStorage.setItem(FOCUS_KEY, on ? "1" : "0");
  } catch {
    /* modo privado del navegador: se pierde al cerrar, no pasa nada */
  }
}

/** Estado del modo foco, ya persistido. Arranca en false para que el servidor
 * y el cliente pinten lo mismo; el valor guardado se aplica tras montar. */
export function useFocusMode(): [boolean, () => void] {
  const [focus, setFocus] = useState(false);

  useEffect(() => {
    setFocus(readFocusMode());
  }, []);

  const toggle = useCallback(() => {
    setFocus((v) => {
      writeFocusMode(!v);
      return !v;
    });
  }, []);

  return [focus, toggle];
}
