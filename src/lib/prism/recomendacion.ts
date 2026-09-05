/** Prism AI — Inteligencia de recomendación (Pilar 4 del plan de escalado).
 *
 * Hoy Prism YA clasifica la tarea (`task-router.ts`) y ordena candidatos,
 * pero solo lo dice en un toast. El plan pide decisión ACTIVA con el
 * porqué visible:
 *
 *   Tarea detectada: generación de UI compleja
 *   Modelo recomendado: X
 *   Razón: tareas de diseño con modelos gratis mostraron 40% más reintentos
 *
 * La matriz inicial es heurística (sin llamadas extra); se afina con el
 * historial REAL de tareas de este proyecto (`memoria-proyecto.ts`): si
 * un modelo acumula reintentos, deja de ser el recomendado y la razón lo
 * explica. Sin benchmark formal: registrar y consultar.
 */

import type { ProviderId } from "./types";
import { classifyTask, type TaskKind } from "./task-router";
import { reintentosDeModelo, type MemoriaProyecto } from "./memoria-proyecto";
import { ajustePorExperiencia, experienciaDe, type MuestraModelo } from "./experiencia";

/** Qué tipo de encargo es, con la etiqueta visible. */
export type TipoTarea = TaskKind;

export interface Recomendacion {
  tipo: TipoTarea;
  /** etiqueta legible del tipo de tarea */
  etiquetaTarea: string;
  /** modelKey recomendado, o null si no hay nada conectado */
  modelKey: string | null;
  /** nombre del modelo (modelId), para enseñar */
  modelo: string;
  /** nombre del proveedor, para enseñar */
  proveedor: string;
  /** el porqué, en una frase que una persona entiende */
  razon: string;
  /** alternativa más barata si la recomendación cuesta (fase gratis→pago) */
  alternativa?: { modelKey: string; modelo: string; razon: string };
}

/** Umbrales de la matriz: cuántos reintentos acumulados hacen que un
 * modelo «demuestre» que no resuelve bien ese tipo de tarea. */
const REINTENTOS_CASTIGO = 4;
const PENA_REINTENTOS = 18;

/** La matriz del plan (§4.2), traducida a pesos. Los proveedores GRATIS
 * mandan por defecto (filosofía Prism); la escalada a pago solo se
 * recomienda para refactor/arquitectura si hay algo conectado. */
const AJUSTE_TIPO: Record<TipoTarea, Partial<Record<ProviderId, number>>> = {
  // UI desde cero: calidad de diseño = menos iteraciones = ahorro total
  web: { nvidia: 4, kimi: 3, anthropic: 6, openai: 5, gemini: 2 },
  code: { deepseek: 4, nvidia: 3, kimi: 2 },
  write: { gemini: 3, kimi: 2 },
  reason: { nvidia: 3, deepseek: 2, kimi: 2 },
  data: { gemini: 3, groq: 2 },
  chat: { groq: 4, cerebras: 3 },
};

/** Frases de razón por tipo de tarea y por historial. */
function razonBase(tipo: TipoTarea, modelo: string, subio: boolean): string {
  if (subio) {
    switch (tipo) {
      case "web":
        return `Para generar UI conviene calidad de diseño: cada reintento que se ahorra paga el modelo. ${modelo} encaja bien en esta categoría.`;
      case "code":
        return `Refactor o lógica delicada: ${modelo} falla menos en código y evita reescribir.`;
      case "reason":
        return `Razonamiento paso a paso: ${modelo} sostiene cadenas largas sin perder el hilo.`;
      default:
        return `${modelo} encaja con este tipo de encargo.`;
    }
  }
  switch (tipo) {
    case "web":
      return `Tarea de UI: ${modelo} tiene buen historial en diseño y es gratis.`;
    case "chat":
      return `Pregunta simple: no hay razón para gastar. ${modelo} responde rápido y gratis.`;
    case "code":
      return `Cambio de código con verificación automática: el riesgo lo cubre el bucle, no el precio. ${modelo} es gratis y sobra.`;
    default:
      return `${modelo} es gratis y encaja con la tarea.`;
  }
}

/** Recomienda modelo para un encargo, con el porqué.
 *
 * Entrada: el prompt del usuario, los proveedores conectados (con sus
 * modelos), la experiencia medida del dispositivo y la memoria de tareas
 * del proyecto. Todo opcional salvo proveedores: sin datos, funciona la
 * matriz base y la razón lo dice. */
export function recomendarModelo(
  prompt: string,
  providers: Partial<Record<ProviderId, { enabled: boolean; apiKey: string; models: string[] }>>,
  opciones?: {
    keyless?: readonly ProviderId[];
    historialUso?: Record<string, MuestraModelo | undefined>;
    memoria?: MemoriaProyecto | null;
    esPago?: (pid: ProviderId) => boolean;
    soloGratis?: boolean;
  }
): Recomendacion {
  const guess = classifyTask(prompt);
  const tipo = guess.kind;
  const keyless = opciones?.keyless ?? [];
  const esPago = opciones?.esPago ?? (() => false);

  type Candi = { pid: ProviderId; mid: string; score: number; pago: boolean };
  const candidatas: Candi[] = [];
  for (const [pid, cfg] of Object.entries(providers) as [ProviderId, { enabled: boolean; apiKey: string; models: string[] }][]) {
    if (!cfg?.enabled) continue;
    if (!cfg.apiKey.trim() && !keyless.includes(pid)) continue;
    for (const mid of cfg.models) {
      let score = AJUSTE_TIPO[tipo][pid] ?? 0;
      const pago = esPago(pid);
      if (pago && opciones?.soloGratis) continue;
      // gratis gana por defecto: la filosofía es no gastar salvo que el
      // tipo de tarea lo justifique (y entonces solo sube el punto)
      if (!pago) score += 10;
      // lo que a TI te ha funcionado (mismo ajuste que usa Auto)
      const key = `${pid}::${mid}`;
      if (opciones?.historialUso) {
        score += ajustePorExperiencia(experienciaDe(opciones.historialUso[key]));
      }
      // y lo que este proyecto ha sufrido con ese modelo (Task DNA)
      const reint = opciones?.memoria ? reintentosDeModelo(opciones.memoria, key) : 0;
      if (reint >= REINTENTOS_CASTIGO) score -= PENA_REINTENTOS;
      candidatas.push({ pid, mid, score, pago });
    }
  }

  if (!candidatas.length) {
    return {
      tipo,
      etiquetaTarea: guess.label,
      modelKey: null,
      modelo: "",
      proveedor: "",
      razon: "No hay proveedores conectados: conecta uno en Ajustes para que Prism pueda recomendar.",
    };
  }

  candidatas.sort((a, b) => b.score - a.score);
  const mejor = candidatas[0];
  const castigado = opciones?.memoria
    ? candidatas.find(
        (c) => opciones.memoria && reintentosDeModelo(opciones.memoria, `${c.pid}::${c.mid}`) >= REINTENTOS_CASTIGO
      )
    : undefined;

  let razon = razonBase(tipo, mejor.mid, mejor.pago);
  if (castigado && castigado.pid === mejor.pid) {
    razon = `${castigado.mid} acumuló reintentos en este proyecto: mejor probar otro.`;
  } else if (mejor.pago) {
    const gratis = candidatas.find((c) => !c.pago);
    return {
      tipo,
      etiquetaTarea: guess.label,
      modelKey: `${mejor.pid}::${mejor.mid}`,
      modelo: mejor.mid,
      proveedor: mejor.pid,
      razon,
      alternativa: gratis
        ? {
            modelKey: `${gratis.pid}::${gratis.mid}`,
            modelo: gratis.mid,
            razon: "Alternativa gratis, con riesgo de más iteraciones.",
          }
        : undefined,
    };
  }

  return {
    tipo,
    etiquetaTarea: guess.label,
    modelKey: `${mejor.pid}::${mejor.mid}`,
    modelo: mejor.mid,
    proveedor: mejor.pid,
    razon,
  };
}
