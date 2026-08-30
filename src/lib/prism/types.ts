/** Prism AI — Tipos centrales */

import type { MessageFork, SessionThread } from "./branches";

export type { MessageFork, SessionThread };

export type Role = "user" | "assistant" | "system";

export interface ChatMessage {
  /** cuántas respuestas se combinaron para producir esta (modo consenso) */
  consensusOf?: number;
  id: string;
  role: Role;
  content: string;
  /** razonamiento del modelo (si lo expone) */
  reasoning?: string;
  /** modelo (modelKey) que generó la respuesta */
  model?: string;
  createdAt: number;
  error?: boolean;
  /** duración en ms de la generación */
  elapsedMs?: number;
  /** imágenes adjuntas (solo mensajes del usuario) */
  attachments?: Attachment[];
  /** documentos adjuntos con texto extraído (PDF, TXT…) */
  docTexts?: DocText[];
  /** imagen generada por IA (modo imagen / Pollinations) */
  generatedImage?: { url: string; prompt: string };
  /** % de contexto ahorrado por la compresión en esta respuesta (si > 0) */
  ctxSaved?: number;
  /** nº de datos personales enmascarados en lo que se envió (escudo PII) */
  piiMasked?: number;
  /** mensaje que escribe la app, no la persona (p. ej. «continúa el trabajo»).
   * Viaja al modelo igual, pero se pinta en pequeño para no parecer tuyo. */
  instruction?: boolean;
}

/** Documento adjunto cuyo texto se extrajo localmente */
export interface DocText {
  id: string;
  name: string;
  /** texto extraído (lo que se envía al modelo) */
  text: string;
  /** tamaño aproximado del texto en caracteres */
  chars: number;
}

/** Imagen adjunta a un mensaje (almacenada como data URL comprimida) */
export interface Attachment {
  id: string;
  name: string;
  /** tipo MIME, ej. image/jpeg */
  mediaType: string;
  /** data URL completa (data:image/…;base64,… ) */
  dataUrl: string;
  /** tamaño aproximado en bytes */
  size: number;
}

/** Prompt guardado en la biblioteca */
export interface PromptItem {
  id: string;
  title: string;
  content: string;
  category: string;
  builtin?: boolean;
}

/** Mapa compacto de un proyecto que la IA está construyendo (ahorra tokens al continuar) */
export interface ProjectFileEntry {
  /** nombre del archivo, ej. index.html */
  name: string;
  /** html | css | js | img | otro */
  kind: string;
  /** resumen de una línea de qué contiene */
  summary: string;
  /** archivos locales a los que referencia (a href, script src, link href…) */
  links?: string[];
  /** funcionalidades detectadas EN este archivo */
  features?: string[];
  /** tecnologías detectadas en este archivo */
  tech?: string[];
}

/** Instantánea del mapa para el historial (inspirado en el versionado de Obsidian) */
export interface MapSnapshot {
  at: number;
  /** qué cambió, ej. «+2 archivos · +1 funcionalidad» */
  label: string;
  name: string;
  description: string;
  files: ProjectFileEntry[];
  features: string[];
  notes: string[];
}

export interface ProjectMap {
  name: string;
  description: string;
  files: ProjectFileEntry[];
  /** funcionalidades ya implementadas */
  features: string[];
  /** notas de memoria añadidas por el usuario o el modelo (estilo Obsidian) */
  notes?: string[];
  /** historial de versiones del mapa (más reciente primero, máx. 6) */
  history?: MapSnapshot[];
  updatedAt: number;
}

/** Skill instalable que mejora el comportamiento del modelo */
export interface SkillItem {
  id: string;
  name: string;
  description: string;
  /** emoji identificador */
  icon: string;
  /** instrucciones que se inyectan en el system prompt */
  instructions: string;
  builtin?: boolean;
  enabled: boolean;
  /** permisos analizados del texto al instalarla (skill-permissions.ts) */
  permissions?: import("./skill-permissions").SkillPermissionInfo;
}

export interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  /** modelKey fijo para esta sesión (opcional) */
  modelKey?: string | null;
  pinned?: boolean;
  /** mapa del proyecto que se construye en esta sesión (memoria compacta) */
  projectMap?: ProjectMap | null;
  /** ramas alternativas por punto de bifurcación (regenerar y editar no borran) */
  forks?: Record<string, MessageFork>;
  /** hilos archivados: otros temas dentro de esta misma conversación */
  threads?: SessionThread[];
  /** nombre del hilo que se está viendo */
  threadName?: string;
}

/** Límite de renderizado por mensaje (protege de bucles degenerados del modelo) */
export const MAX_RENDER_CHARS = 8000;

export type ProviderId =
  | "aihubmix"
  | "kimi"
  | "nvidia"
  | "openai"
  | "anthropic"
  | "gemini"
  | "deepseek"
  | "openrouter"
  | "tokenrouter"
  | "groq"
  | "cerebras"
  | "mistral"
  | "xai"
  | "zai"
  | "ollama"
  | "lmstudio"
  | "custom";

/** Protocolo de API que habla el proveedor */
export type ProviderProtocol = "openai" | "anthropic" | "gemini";

export interface ProviderDef {
  id: ProviderId;
  name: string;
  /** descripción corta */
  tagline: string;
  protocol: ProviderProtocol;
  /** URL base por defecto (sin slash final) */
  baseUrl: string;
  /** URL para obtener la clave API */
  keyUrl?: string;
  /** modelos por defecto sugeridos */
  defaultModels: string[];
  /** color de marca para el punto / gradiente */
  color: string;
  /** destacar en la lista (AiHubMix) */
  featured?: boolean;
  /** conectar directo desde el navegador (por defecto usa proxy del servidor) */
  directByDefault?: boolean;
  /** no necesita API key (servidores locales como Ollama o LM Studio) */
  keyless?: boolean;
  /** nota corta bajo el campo de clave / URL */
  hint?: string;
  /** documentación */
  docsUrl?: string;
}

export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  enabled: boolean;
  /** modelos disponibles (cacheados del fetch o añadidos manualmente) */
  models: string[];
  /** usar proxy del servidor en vez de fetch directo del navegador */
  useProxy?: boolean;
}

export interface AppSettings {
  defaultModelKey: string | null;
  systemPrompt: string;
  temperature: number;
  maxTokens: number | null;
  stream: boolean;
  /** enviar historial completo (últimos N mensajes, 0 = todos) */
  contextWindow: number;
  sendKeyOnProxy: boolean;
  /** mostrar únicamente modelos gratis en el selector */
  onlyFree: boolean;
  /** modo agente: bucle plan → ejecutar → revisar (estilo Claude Code) */
  agentMode: boolean;
  /** Consenso: se pregunta a varios modelos a la vez y uno combina lo mejor */
  consensus?: boolean;
  /** iteraciones máximas del bucle del agente */
  agentMaxLoops: number;
  /** tema de acento: id de preset o «personalizado» */
  accent: string;
  /** color hex del acento personalizado (cuando accent = personalizado) */
  accentCustom: string;
  /** leer en voz alta las respuestas automáticamente */
  autoSpeak: boolean;
  /** código de acceso del proxy propio (despliegue en Vercel/servidor, opcional) */
  accessCode: string;
  /** compresión de contexto (inspirada en RTK/Caveman de OmniRoute) */
  compression: "off" | "lite" | "standard";
  /** estilo de salida (output styles de OmniRoute) */
  outputStyle: "normal" | "conciso" | "detallado";
  /** escudo PII: enmascara datos personales en lo que se envía (100% local) */
  piiShield: boolean;
  /** último modelo elegido a mano, para volver a él al apagar Auto */
  lastManualModelKey: string | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  defaultModelKey: null,
  systemPrompt:
    "Eres Prism AI, un asistente útil, preciso y directo. Responde en el idioma del usuario y usa markdown cuando mejore la legibilidad.",
  temperature: 0.7,
  maxTokens: null,
  stream: true,
  contextWindow: 40,
  sendKeyOnProxy: true,
  onlyFree: true,
  agentMode: false,
  consensus: false,
  agentMaxLoops: 3,
  accent: "violeta",
  accentCustom: "#8b5cf6",
  autoSpeak: false,
  accessCode: "",
  compression: "off",
  outputStyle: "normal",
  piiShield: true,
  lastManualModelKey: null,
};

/** Pseudo-modelo «Auto»: elige el mejor gratis para la tarea (web, código,
 * escritura…) y, si se acaba la cuota, salta al siguiente. */
export const AUTO_MODEL_KEY = "auto::auto";
export function isAutoKey(key: string | null | undefined): boolean {
  return key === AUTO_MODEL_KEY;
}

/** El primer candidato que no sea Auto. Sirve para apagar Auto siempre. */
export function pickManualModel(
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const k of candidates) {
    if (k && !isAutoKey(k)) return k;
  }
  return null;
}

/** Voz de lectura en curso (global para poder cancelarla desde cualquier mensaje) */
export const speechState = { msgId: null as string | null };

/** Clave compuesta providerId::modelId */
export type ModelKey = string;

export function splitModelKey(key: string): { providerId: ProviderId; modelId: string } | null {
  const idx = key.indexOf("::");
  if (idx < 0) return null;
  return { providerId: key.slice(0, idx) as ProviderId, modelId: key.slice(idx + 2) };
}

export function makeModelKey(providerId: ProviderId, modelId: string): ModelKey {
  return `${providerId}::${modelId}`;
}
