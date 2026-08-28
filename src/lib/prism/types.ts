/** Prism AI — Tipos centrales */

export type Role = "user" | "assistant" | "system";

export interface ChatMessage {
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
  /** html | css | js | otro */
  kind: string;
  /** resumen de una línea de qué contiene */
  summary: string;
}

export interface ProjectMap {
  name: string;
  description: string;
  files: ProjectFileEntry[];
  /** funcionalidades ya implementadas */
  features: string[];
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
}

/** Límite de renderizado por mensaje (protege de bucles degenerados del modelo) */
export const MAX_RENDER_CHARS = 8000;

export type ProviderId =
  | "aihubmix"
  | "openai"
  | "anthropic"
  | "gemini"
  | "deepseek"
  | "openrouter"
  | "groq"
  | "xai"
  | "zai"
  | "ollama"
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
  /** iteraciones máximas del bucle del agente */
  agentMaxLoops: number;
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
  agentMaxLoops: 3,
};

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
