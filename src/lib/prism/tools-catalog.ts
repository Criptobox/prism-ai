/** Prism AI — Catálogo de herramientas para el agente.
 *
 * Hasta la v3.13 el agente era «prompt + parser XML»: el modelo escribía
 * etiquetas y este lado interpretaba. No llamaba funciones. El PLAN-V4
 * identifica el hueco real: muchos modelos gratis no soportan `tools`, o
 * los soportan mal; encenderlos a secas rompe el agente justo en los
 * modelos para los que existe la app.
 *
 * Aquí vive el catálogo de herramientas (qué hace cada una y su firma),
 * NO la lógica de ejecución (esa va en `tool-runner.ts`, que vive en el
 * cliente porque opera sobre el Sandbox y la cuota locales).
 *
 * Regla del INSTRUCCIONESIA: nada de buscar en la web — aquí no se puede
 * hacer sin servidor. Las herramientas son todas sobre cosas que ya
 * existen y viven en el dispositivo.
 */

/** Protocolo de la API que habla el proveedor. Duplica `ProviderProtocol`
 * de types.ts, pero se repite aquí para evitar un ciclo de dependencias
 * (types importa otras cosas que serían caras de arrastrar a un test). */
export type ToolProtocol = "openai" | "anthropic" | "gemini";

/** Parámetro de una herramienta (JSON Schema mínimo, común a los 3
 * protocolos: OpenAI usa `parameters`, Anthropic `input_schema`, Gemini
 * deriva su `schema` desde el mismo objeto). */
export interface ToolParamSchema {
  type: "string" | "number" | "integer" | "boolean" | "array" | "object" | "null";
  description?: string;
  /** Para `array`: esquema de los items. */
  items?: ToolParamSchema;
  /** Para `object`: propiedades. */
  properties?: Record<string, ToolParamSchema>;
  /** Para `object`: propiedades obligatorias. */
  required?: string[];
  /** Enumeración de valores permitidos (para strings/numbers). */
  enum?: string[];
}

/** Definición común de una herramienta. Las funciones de traducción a
 * cada protocolo (ver `tools-translate.ts`) la convierten a la forma que
 * pide cada proveedor. */
export interface ToolDef {
  /** Nombre estable, en inglés, snake_case (lo que ve el modelo). */
  name: string;
  /** Descripción corta para el modelo: qué hace y cuándo usarla. */
  description: string;
  /** Esquema de los parámetros. */
  parameters: ToolParamSchema;
}

/** Catálogo de herramientas que el agente puede invocar. Todas operan
 * sobre cosas que ya viven en el dispositivo (Sandbox, cuota, archivos
 * del proyecto). Ninguna sale a la red ajena.
 *
 * Si añades una herramienta aquí, también:
 *  - impleméntala en `tool-runner.ts` (case por `name`)
 *  - dale permiso en `tool-permissions.ts` (riesgo: lectura/escritura/...)
 *  - añade un test que pruebe que el agente la llama y el runner la
 *    ejecuta (regla del INSTRUCCIONESIA: «si añades algo que el usuario
 *    ve o pulsa, hay un E2E que lo abre y lo usa»). */
export const TOOL_CATALOG: readonly ToolDef[] = [
  {
    name: "read_file",
    description:
      "Lee el contenido de un archivo del proyecto que se está construyendo en el Sandbox. Útil para verificar el estado real de un archivo antes de editarlo o para inspeccionar código existente.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Ruta relativa del archivo dentro del proyecto (p. ej. «index.html» o «src/app.js»).",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description:
      "Escribe o reemplaza por completo el contenido de un archivo del proyecto. Crea el archivo si no existe. Útil para aplicar correcciones detectadas en la revisión sin reescribir todo el proyecto.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Ruta relativa del archivo dentro del proyecto (p. ej. «index.html»).",
        },
        content: {
          type: "string",
          description: "Contenido COMPLETO y actualizado del archivo. No resumas ni uses «…»: el archivo se reemplaza entero.",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "list_files",
    description:
      "Lista los archivos del proyecto que se está construyendo en el Sandbox. Útil para saber qué existe antes de leer o escribir.",
    parameters: {
      type: "object",
      properties: {
        prefix: {
          type: "string",
          description: "Opcional: solo lista los archivos cuya ruta empieza por este prefijo (p. ej. «src/»).",
        },
      },
    },
  },
  {
    name: "run_project",
    description:
      "Construye y ejecuta el proyecto actual del Sandbox (el HTML autocontenido con puente de consola) y devuelve los primeros logs de consola y los errores. Útil para verificar que lo que escribiste funciona antes de cerrar el bucle.",
    parameters: {
      type: "object",
      properties: {
        qa: {
          type: "boolean",
          description: "Si true, también mide el QA visual móvil (320 y 390 px) y devuelve los hallazgos. Por defecto false.",
        },
      },
    },
  },
  {
    name: "get_quota",
    description:
      "Consulta la cuota restante del proveedor/modelo con el que se está hablando. Útil para decidir si vale la pena seguir iterando o conviene acortar y entregar. Devuelve cuotas de peticiones y tokens si el proveedor las expone en cabeceras x-ratelimit-*.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
] as const;

/** Mapa name → ToolDef, para buscar por el nombre que devuelve el modelo. */
export const TOOL_BY_NAME: Record<string, ToolDef> = Object.fromEntries(
  TOOL_CATALOG.map((t) => [t.name, t])
);

/** ¿El nombre que devolvió el modelo está en el catálogo? Evita que el
 * modelo «invente» herramientas que no existen y el runner se calle. */
export function isKnownTool(name: string): boolean {
  return name in TOOL_BY_NAME;
}

/** Llamada a una herramienta que devolvió el modelo. Común a los 3
 * protocolos (la traducción de cada uno a esta forma vive en
 * `tools-translate.ts`). */
export interface ToolCall {
  /** Id que el modelo dio a la llamada (para correlacionar la respuesta). */
  id: string;
  /** Nombre de la herramienta (debe estar en `TOOL_BY_NAME`). */
  name: string;
  /** Argumentos ya parseados desde JSON. */
  args: Record<string, unknown>;
}

/** Resultado de ejecutar una herramienta. Lo que se reinyecta en el
 * siguiente turno del modelo como mensaje `tool` (OpenAI), `tool_result`
 * (Anthropic) o `functionResponse` (Gemini). */
export interface ToolResult {
  /** Id de la llamada que se está respondiendo. */
  callId: string;
  /** Nombre de la herramienta (para trazabilidad). */
  name: string;
  /** Texto que se envía al modelo. Si la herramienta devuelve JSON, se
   * serializa; si ya es texto, pasa tal cual. */
  content: string;
  /** true si la herramienta se ejecutó sin errores. false si algo
   * falló (archivo no existe, Sandbox no cargado, etc.). El modelo
   * recibe esta señal para decidir si reintentar o cambiar de enfoque. */
  ok: boolean;
}
