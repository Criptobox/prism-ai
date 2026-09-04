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
  /** qué contexto viajó con la petición que produjo esta respuesta, contado
   * de lo que SE ENVIÓ. Se guarda en el mensaje para que se pueda mirar
   * después, no solo en el momento (ver `contexto-usado.ts`). */
  contexto?: import("./contexto-usado").ContextoUsado;
  /** esta respuesta la dirigió un equipo: cuántos ejecutores hubo, cuántos
   * entregaron y cuántas llamadas costó en total (ver `orquesta.ts`). */
  orquesta?: { ejecutores: number; entregaron: number; llamadas: number };
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

/** Imagen adjunta a un mensaje.
 *
 * El binario (la `dataUrl` completa) vive en IndexedDB desde la v3.14; aquí
 * solo queda la ficha con el `blobId` que lo recupera. `dataUrl` se mantiene
 * opcional para tres casos:
 *   1. En memoria, justo tras crear el adjunto con `fileToAttachment`,
 *      aún no se ha persistido: el componente lo pinta directo.
 *   2. En sesiones antiguas migradas: se rellena a demanda desde IDB.
 *   3. En sesiones antiguas sin migrar (o si IDB falló): sigue ahí como
 *      respuesto, igual que antes. */
export interface Attachment {
  id: string;
  name: string;
  /** tipo MIME, ej. image/jpeg */
  mediaType: string;
  /** data URL completa (data:image/…;base64,…).
   * Opcional desde v3.14: el binario vive en IndexedDB bajo `blobId`. */
  dataUrl?: string;
  /** clave del binario en IndexedDB (`prism-attachments`). Igual a `id`
   * para los adjuntos creados tras la migración; ausente en los viejos
   * que no se hayan podido mover. */
  blobId?: string;
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
  /** tipos de encargo para los que sirve. Se usa para PROPONERLA cuando lo
   *  que escribes encaja — nunca para activarla sola. */
  kinds?: import("./task-router").TaskKind[];
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
  /** memoria negativa: archivos que el agente NO puede tocar en esta sesión.
   * Van por sesión y no globales porque «no toques Header.tsx» habla de UN
   * proyecto (ver `reglas-no.ts`). */
  reglasNo?: import("./reglas-no").ReglaNo[];
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
  // Runtimes locales compatibles con OpenAI. No son «proveedores» en el
  // sentido de la nube: no hay cuenta, ni clave, ni cuota. Es tu equipo.
  | "llamacpp"
  | "jan"
  | "vllm"
  | "mlx"
  | "llamafile"
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
  /** modos de agente activos (ids de agent-modes.ts) */
  agentModes: string[];
  /** escudo PII: enmascara datos personales en lo que se envía (100% local) */
  piiShield: boolean;
  /** último modelo elegido a mano, para volver a él al apagar Auto */
  lastManualModelKey: string | null;
  /** modo ahorro: respuestas al grano y menos contexto por mensaje */
  ahorro: boolean;
  /** ventana de contexto de REFERENCIA (tokens) para el HUD del compositor.
   * No es un dato del proveedor: es el tamaño contra el que el usuario
   * quiere vigilar la conversación (por defecto 32k, ajustable). */
  ventanaCtx: number;
  /** Techo de llamadas a modelos DE PAGO por día natural. `null` = sin techo,
   * que es una opción legítima para quien sabe lo que hace. Ver `gasto.ts`. */
  topeLlamadasPago?: number | null;
  /** Proveedores a los que NO se manda nada, aunque tengan clave puesta.
   * Corta también los caminos automáticos —failover, panel, ejecutores—, que
   * son los que eligen por ti. Ver `vetados.ts`. */
  proveedoresVetados?: import("./types").ProviderId[];
  /** Qué se le permite hacer al agente, efecto a efecto (ver
   * `tool-permissions.ts`). Opcional porque los ajustes guardados de
   * versiones anteriores no lo traen; `normalizarPermisos` rellena. */
  permisosAgente?: Partial<import("./tool-permissions").PermisosConcedidos>;
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
  ahorro: false,
  agentModes: [],
  piiShield: true,
  lastManualModelKey: null,
  ventanaCtx: 32000,
  // Encendido de fábrica: apagado no protege a quien no sabe que existe, que
  // es justo quien se lleva el susto en la factura.
  topeLlamadasPago: 200,
  proveedoresVetados: [],
  // Todo concedido de salida: ver el porqué en `PERMISOS_POR_DEFECTO`.
  permisosAgente: { lee_proyecto: true, escribe_proyecto: true, ejecuta: true, red: true },
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
