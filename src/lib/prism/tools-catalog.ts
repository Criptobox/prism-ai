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
 * Casi todas operan sobre cosas que viven en el dispositivo (el Sandbox,
 * la cuota). La excepción es `read_url`, que LEE una página concreta que
 * le das tú: no es buscar en la web, es traer un texto. Pasa por
 * `/api/proxy`, que ya tiene escudo anti-SSRF (`net-guard.ts`), y la URL
 * queda en el registro de peticiones para que se vea qué pidió.
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
      "Escribe o reemplaza por completo el contenido de un archivo del proyecto. Crea el archivo si no existe. Para archivos NUEVOS es la herramienta correcta; si el archivo YA EXISTE y el cambio es parcial, usa «apply_patch» o «edit_file»: gastan muchos menos tokens y no arriesgan el resto del archivo.",
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
    name: "read_url",
    description:
      "Lee el TEXTO de una página web concreta y lo devuelve limpio de etiquetas. Úsala cuando el usuario te dé una URL o cuando necesites el contenido de una página que ya conoces. NO es un buscador: no acepta términos de búsqueda, solo una URL http(s) exacta. Con «selector» puedes quedarte solo con una zona de la página y ahorrar contexto.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL completa con http:// o https://. No se admiten IPs privadas ni localhost.",
        },
        selector: {
          type: "string",
          description:
            "Opcional. Zona de la página con la que quedarse. Solo selectores SIMPLES: una etiqueta («main»), un id («#precios»), una clase («.PricingTable») o etiqueta con id o clase («section#precios», «div.card»). NO se admiten combinadores («div p»), atributos ni comas. Si no casa, se te dice: no se te devuelve la página entera por tu cuenta.",
        },
        max_chars: {
          type: "number",
          description:
            "Opcional. Tope de caracteres del texto devuelto (por defecto 8000, máximo 20000). Súbelo solo si de verdad necesitas la página larga: lo que pidas se te descuenta del contexto.",
        },
      },
      required: ["url"],
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
  {
    name: "edit_file",
    description:
      "Edita un archivo del proyecto SIN reescribirlo entero: busca un fragmento EXACTO y lo reemplaza. Úsala en vez de write_file cuando el archivo ya existe y solo cambian unas líneas: gastas muchos menos tokens y no arriesgas el resto del archivo. Si «find» aparece más de una vez, la llamada falla a propósito: pásale un fragmento más largo que sea único, o \"all\": true si de verdad quieres reemplazarlas todas.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Ruta relativa del archivo a editar (p. ej. «styles.css»). Debe existir: usa read_file si no estás seguro del contenido actual.",
        },
        find: {
          type: "string",
          description: "Fragmento EXACTO a buscar, copiado byte a byte del archivo (espacios y saltos de línea incluidos).",
        },
        replace: {
          type: "string",
          description: "Fragmento nuevo que sustituye a «find».",
        },
        all: {
          type: "boolean",
          description: "Si true, reemplaza TODAS las apariciones de «find». Por defecto solo la primera (y exige que sea única).",
        },
      },
      required: ["path", "find", "replace"],
    },
  },
  {
    name: "apply_patch",
    description:
      "Edita un archivo del proyecto con VARIOS parches de una vez usando bloques SEARCH/REPLACE. Mucho más barato y fiable que reescribir el archivo entero con write_file: cada bloque busca un fragmento EXACTO del archivo actual y lo sustituye. Formato de cada parche en el array «parches»: «search» es el fragmento exacto tal cual está en el archivo (copiado byte a byte, espacios y saltos incluidos) y «replace» el fragmento nuevo. Si un fragmento no existe o no es único, ese bloque falla y se te dice cuál: repite SOLO los bloques fallidos con el fragmento correcto, no reescribas el archivo.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Ruta relativa del archivo a editar (debe existir: usa read_file si no estás seguro de su contenido actual).",
        },
        parches: {
          type: "array",
          items: {
            type: "object",
            properties: {
              search: {
                type: "string",
                description: "Fragmento EXACTO a buscar, copiado del archivo actual.",
              },
              replace: {
                type: "string",
                description: "Fragmento nuevo que lo sustituye (puede ser vacío para borrar).",
              },
            },
            required: ["search", "replace"],
          },
          description: "Lista de bloques SEARCH/REPLACE a aplicar en orden.",
        },
      },
      required: ["path", "parches"],
    },
  },
  {
    name: "run_js",
    description:
      "Ejecuta un snippet de JavaScript en un entorno aislado y devuelve su resultado al instante. Úsala para probar una función, una expresión o un cálculo ANTES de escribir el archivo, o cuando no hace falta arrancar el proyecto entero. Contrato: asigna el resultado a una variable llamada «resultado» (ej.: «const resultado = precios.map(p => p * 2)») o usa console.log. Sin «resultado» y sin logs, la respuesta es «undefined». Sin red: para pedir datos usa fetch_api.",
    parameters: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "Código JavaScript a ejecutar. Asigna el resultado final a «resultado». Admite async/await. Máximo 5 s de ejecución.",
        },
      },
      required: ["code"],
    },
  },
  {
    name: "read_console",
    description:
      "Devuelve los últimos mensajes de consola del proyecto ejecutado en esta conversación (logs y errores, con su nivel). Úsala después de run_project para releer los errores con detalle, o antes de corregir para confirmar qué falla ahora. Si todavía no se ha ejecutado nada, lo dice.",
    parameters: {
      type: "object",
      properties: {
        level: {
          type: "string",
          description: "Opcional: filtra por nivel («error», «warn», «log»). Por defecto devuelve todos.",
        },
      },
    },
  },
  {
    name: "search_web",
    description:
      "Busca en la web y devuelve los primeros resultados (título, URL y resumen). Úsala cuando necesites información que no tienes: la sintaxis actual de una API, un error desconocido, datos que cambian. NO es para leer una página concreta (eso es read_url) ni para pedir JSON a una API (eso es fetch_api): es para ENCONTRAR dónde mirar.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Términos de búsqueda, como los escribirías en un buscador.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "fetch_api",
    description:
      "Pide JSON a una API pública (GET) y devuelve SOLO los campos que pidas. Úsala para datos reales (clima, tipos de cambio, APIs abiertas) en vez de inventarlos o de leer HTML con read_url. Pasa «fields» con las rutas de los campos que quieres (notación de puntos, p. ej. «current.temperature_2m»): sin fields devuelve el JSON entero recortado. Si un campo no existe, dice «sin dato» — no lo inventa.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL completa de la API, con http:// o https://. No se admiten IPs privadas ni localhost.",
        },
        fields: {
          type: "array",
          items: { type: "string" },
          description: "Opcional: rutas de los campos a extraer (notación de puntos para objetos anidados).",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "git_snapshot",
    description:
      "Puntos de restauración del proyecto del Sandbox. «create» guarda el estado actual con un mensaje; «list» los muestra; «restore» vuelve a uno (los archivos posteriores se descartan). Úsala antes de cambios grandes o cuando algo se rompió y quieres volver atrás sin rehacer a mano.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "«create», «list» o «restore».",
          enum: ["create", "list", "restore"],
        },
        message: {
          type: "string",
          description: "Para «create»: una etiqueta corta del momento (p. ej. «antes de optimizar el carrusel»).",
        },
        id: {
          type: "string",
          description:
            "Para «restore»: el id del snapshot, TAL CUAL te lo dio «create» o «list». No sigue un patrón adivinable: no lo inventes ni supongas «s1».",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "run_regression",
    description:
      "Ejecuta el proyecto del Sandbox y lo COMPARA con la ejecución anterior de esta conversación: qué errores de consola son nuevos, cuáles has arreglado, qué pasó con el QA móvil y con el peso del HTML. Úsala después de un cambio, en vez de dar por bueno tu propio trabajo. La primera vez no hay con qué comparar: se guarda la referencia y te lo dice; vuelve a llamarla después de editar.",
    parameters: {
      type: "object",
      properties: {
        include_qa: {
          type: "boolean",
          description:
            "Medir también el QA visual móvil (320 y 390 px). Por defecto true: sin QA la comparación solo ve la consola.",
        },
      },
    },
  },
  {
    name: "snapshot_diff",
    description:
      "Dice QUÉ cambió entre dos estados del proyecto: archivos modificados, nuevos y borrados, con las líneas añadidas y quitadas de cada uno. Con «a» solo, compara ese punto de restauración con el proyecto TAL COMO ESTÁ AHORA (lo normal: «¿qué he tocado desde que empecé?»). Con «a» y «b», compara los dos puntos entre sí. Los ids los da git_snapshot con action «list»; llámala antes si no los tienes. Aquí NO hay git: no valen ramas, ni «main», ni shas.",
    parameters: {
      type: "object",
      properties: {
        a: {
          type: "string",
          description:
            "Id del punto de restauración de partida, tal cual lo dio git_snapshot. Obligatorio.",
        },
        b: {
          type: "string",
          description:
            "Opcional. Id del punto de restauración de llegada, tal cual lo dio git_snapshot. Si no lo pones, se compara contra el proyecto actual.",
        },
      },
      required: ["a"],
    },
  },
  {
    name: "ask_memory",
    description:
      "Pregunta al mapa del proyecto: archivos y para qué sirve cada uno, funcionalidades ya hechas, tecnologías, y las NOTAS DE MEMORIA (las decisiones que tomó el usuario). Úsala ANTES de rehacer algo, para no repetir trabajo ni contradecir una decisión ya tomada. Si no hay nada sobre lo que preguntas, se te dice: no se inventa una respuesta.",
    parameters: {
      type: "object",
      properties: {
        q: {
          type: "string",
          description:
            "Qué quieres saber, en palabras. Ej.: «qué colores usamos», «hay login», «para qué es estilos.css».",
        },
        limit: {
          type: "number",
          description: "Opcional. Cuántos resultados devolver (por defecto 5, máximo 20).",
        },
      },
      required: ["q"],
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
