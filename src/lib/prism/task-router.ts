/** Prism AI — Auto elige el modelo más acorde a la tarea y arma una
 * cadena de reserva: si se acaba la cuota, pasa al segundo mejor. */

import type { ProviderId } from "./types";
import {
  ajustePorExperiencia,
  experienciaDe,
  type MuestraModelo,
} from "./experiencia";
import { makeModelKey } from "./types";
import {
  filterFreeModels,
  KEYLESS_PROVIDERS,
  type AutoCandidate,
  type FailoverProviderCfg,
} from "./free-models";

export type TaskKind = "web" | "code" | "write" | "reason" | "data" | "chat";

export interface TaskGuess {
  kind: TaskKind;
  /** etiqueta corta para el toast / la UI */
  label: string;
}

const WEB =
  /\b(web|website|webpage|p[áa]gina|sitio|landing|html|css|portfolio|tienda|blog|hero|ui|ux|frontend|maqueta|landing\s?page)\b/i;
const CODE =
  /\b(c[óo]digo|funci[óo]n|refactor|bug|python|typescript|javascript|react|api|script|componente|debug|algoritmo|sql|regex)\b/i;
const WRITE =
  /\b(correo|email|redact|traduc|resume|resumen|carta|gui[óo]n|copy|eslogan|post|art[íi]culo)\b/i;
const REASON =
  /\b(razon[ae]|piensa|demuestra|matem|prueba|l[óo]gica|paso a paso|analiza|compara a fondo|planifica)\b/i;
const DATA =
  /\b(gr[áa]fico|dashboard|panel|csv|excel|tabla|datos|estad[íi]stic|kpi)\b/i;

export function classifyTask(text: string): TaskGuess {
  const t = text.trim();
  if (!t) return { kind: "chat", label: "chat" };
  if (WEB.test(t)) return { kind: "web", label: "página web" };
  if (DATA.test(t)) return { kind: "data", label: "datos" };
  if (CODE.test(t)) return { kind: "code", label: "código" };
  if (WRITE.test(t)) return { kind: "write", label: "escritura" };
  if (REASON.test(t)) return { kind: "reason", label: "razonamiento" };
  return { kind: "chat", label: "chat" };
}

/** Peso del proveedor según el tipo de encargo (más alto = mejor encaje). */
const PROVIDER_FIT: Record<TaskKind, Partial<Record<ProviderId, number>>> = {
  web: {
    nvidia: 24,
    kimi: 22,
    aihubmix: 18,
    cerebras: 14,
    groq: 12,
    tokenrouter: 11,
    openrouter: 10,
    mistral: 9,
    gemini: 8,
  },
  code: {
    nvidia: 22,
    kimi: 20,
    aihubmix: 18,
    deepseek: 16,
    cerebras: 14,
    mistral: 13,
    groq: 12,
    tokenrouter: 10,
    openrouter: 9,
  },
  write: {
    gemini: 22,
    kimi: 18,
    groq: 14,
    aihubmix: 12,
    openrouter: 10,
    nvidia: 8,
    anthropic: 16,
    openai: 15,
  },
  reason: {
    nvidia: 24,
    kimi: 20,
    gemini: 16,
    deepseek: 15,
    aihubmix: 12,
    groq: 8,
  },
  data: {
    gemini: 20,
    groq: 16,
    aihubmix: 14,
    openrouter: 12,
    kimi: 10,
    nvidia: 9,
  },
  chat: {
    groq: 22,
    gemini: 18,
    cerebras: 16,
    kimi: 12,
    aihubmix: 10,
    nvidia: 8,
  },
};

function modelFit(kind: TaskKind, modelId: string): number {
  const id = modelId.toLowerCase();
  let n = 0;
  const hit = (...rx: RegExp[]) => rx.some((r) => r.test(id));
  if (kind === "web" || kind === "code") {
    if (hit(/kimi-k3/, /coding-/, /coder/, /codestral/, /qwen3-coder/, /nemotron/)) n += 28;
    if (hit(/kimi/, /deepseek/, /qwen/)) n += 10;
  }
  if (kind === "reason") {
    if (hit(/r1/, /reason/, /nemotron/, /kimi-k3/, /\bo[134]\b/, /pro/)) n += 26;
  }
  if (kind === "write" || kind === "chat") {
    if (hit(/flash/, /instant/, /mini/, /small/, /8b/, /lite/)) n += 16;
    if (hit(/kimi/, /gpt/, /gemini/, /llama/)) n += 8;
  }
  if (kind === "data") {
    if (hit(/flash/, /gpt/, /gemini/, /qwen/)) n += 12;
  }
  if (hit(/-free|:free/)) n += 4;
  return n;
}

function usable(
  providers: Partial<Record<ProviderId, FailoverProviderCfg>>,
  id: ProviderId
): FailoverProviderCfg | undefined {
  const cfg = providers[id];
  if (!cfg?.enabled) return undefined;
  if (!cfg.apiKey.trim() && !KEYLESS_PROVIDERS.includes(id)) return undefined;
  return cfg;
}

export function scoreModel(
  kind: TaskKind,
  providerId: ProviderId,
  modelId: string
): number {
  return (PROVIDER_FIT[kind][providerId] ?? 1) + modelFit(kind, modelId);
}

/** Cadena ordenada: 1º el más acorde, 2º el siguiente, etc. (cuota → siguiente).
 * `lastGoodKey` suma un empujón pequeño (no gana a un modelo claramente mejor). */
export function buildTaskChain(
  kind: TaskKind,
  providers: Partial<Record<ProviderId, FailoverProviderCfg>>,
  isBlocked?: (providerId: ProviderId, modelId: string) => boolean,
  limit = 6,
  lastGoodKey?: string | null,
  /** Historial medido por modelo (`useUsage.byModel`). Opcional a propósito:
   *  sin él la cadena sale exactamente igual que antes, que es lo que debe
   *  pasar cuando todavía no hay experiencia de la que aprender. */
  historial?: Record<string, MuestraModelo | undefined>
): AutoCandidate[] {
  const ranked: { providerId: ProviderId; modelId: string; score: number; listIndex: number }[] = [];
  for (const [id, cfg] of Object.entries(providers) as [ProviderId, FailoverProviderCfg][]) {
    if (!usable(providers, id)) continue;
    const free = filterFreeModels(id, cfg.models);
    free.forEach((modelId, listIndex) => {
      if (isBlocked?.(id, modelId)) return;
      let score = scoreModel(kind, id, modelId);
      const key = makeModelKey(id, modelId);
      if (lastGoodKey && key === lastGoodKey) score += 8;
      // Lo que te ha funcionado A TI. Solo opina con muestras suficientes: con
      // dos respuestas no se sabe nada, y ajustar con eso sería inventar.
      if (historial) score += ajustePorExperiencia(experienciaDe(historial[key]));
      ranked.push({ providerId: id, modelId, score, listIndex });
    });
  }
  ranked.sort(
    (a, b) => b.score - a.score || a.listIndex - b.listIndex || a.modelId.localeCompare(b.modelId)
  );
  const out: AutoCandidate[] = [];
  const seen = new Set<string>();
  for (const r of ranked) {
    const key = makeModelKey(r.providerId, r.modelId);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ providerId: r.providerId, modelId: r.modelId, modelKey: key });
    if (out.length >= limit) break;
  }
  return out;
}

export function pickTaskFailover(
  kind: TaskKind,
  providers: Partial<Record<ProviderId, FailoverProviderCfg>>,
  excludeProviderId: ProviderId,
  isBlocked?: (providerId: ProviderId, modelId: string) => boolean
): { providerId: ProviderId; modelId: string } | null {
  const chain = buildTaskChain(kind, providers, (pid, mid) => {
    if (pid === excludeProviderId) return true;
    return !!isBlocked?.(pid, mid);
  }, 1);
  return chain[0] ?? null;
}

/** Último mensaje del usuario (ignora las instrucciones internas del agente). */
export function lastUserPrompt(
  messages: { role: string; content: string; instruction?: boolean }[]
): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user" && !m.instruction) return m.content;
  }
  return "";
}
