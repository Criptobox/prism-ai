"use client";
/** Prism AI — El prompt del sistema, montado igual para quien lo manda y para quien lo mide.
 *
 * Segundo corte de `chat-app.tsx` (PLAN-V8 punto 1): `use-system-prompt`.
 *
 * Las piezas viven en `prompt-actual.ts` (puro, con tests) y el presupuesto en
 * `presupuesto.ts` (ídem). Lo que queda aquí es el pegamento del componente:
 * `piezasDelPrompt` (la entrada, tal y como están las cosas AHORA) y
 * `composeSettings` (las instrucciones finales + la ventana de contexto ya
 * recortada por el modo ahorro).
 *
 * Razón de ser de este hook: el medidor de Ajustes necesita EXACTAMENTE lo
 * mismo que el envío. Si cada uno se lo montara aparte, el medidor enseñaría
 * un número distinto del que viaja de verdad. Un solo camino, dos clientes.
 */
import { useCallback } from "react";
import { construirPrompt, type EntradaPrompt } from "./presupuesto";
import { entradaPromptActual } from "./prompt-actual";
import { usePrism } from "./store";
import type { AppSettings } from "./types";

/** Mensajes de historial que deja pasar el modo ahorro. De fábrica son 40, y
 * en una conversación larga el historial pesa mucho más que las instrucciones:
 * recortarlo es lo que de verdad baja la cuenta. */
export const VENTANA_AHORRO = 12;

/** Lo que `composeSettings` entrega al envío: los ajustes del dispositivo con
 * el systemPrompt ya montado y la ventana ya recortada si toca. */
export type AjustesGenerados = AppSettings & { systemPrompt: string; contextWindow: number };

export function useSystemPrompt() {
  /** Las piezas del prompt, tal y como están ahora. Vive en
   * `prompt-actual.ts` porque el medidor de Ajustes necesita exactamente lo
   * mismo: si cada uno se lo montara aparte, el medidor enseñaría un número
   * distinto del que viaja de verdad. */
  const piezasDelPrompt = useCallback(
    (sessionId?: string): EntradaPrompt => entradaPromptActual(sessionId),
    []
  );

  /** Instrucciones finales, ya montadas. */
  const composeSettings = useCallback(
    (sessionId?: string): AjustesGenerados => {
      const st = usePrism.getState();
      const { prompt } = construirPrompt(piezasDelPrompt(sessionId));
      // El ahorro también recorta lo que ENTRA: el historial es casi siempre
      // más gordo que las instrucciones (40 mensajes de fábrica), así que
      // limitarlo es lo que de verdad baja la cuenta.
      const contextWindow =
        st.settings.ahorro && (st.settings.contextWindow === 0 || st.settings.contextWindow > VENTANA_AHORRO)
          ? VENTANA_AHORRO
          : st.settings.contextWindow;
      return { ...st.settings, systemPrompt: prompt, contextWindow };
    },
    [piezasDelPrompt]
  );

  return { piezasDelPrompt, composeSettings };
}
