/** Prism AI — Permisos POR HERRAMIENTA del agente.
 *
 * El catálogo llevaba versiones diciendo «dale permiso en
 * `tool-permissions.ts`» y este archivo no existía. Lo que sí existía es
 * `skill-permissions.ts`, que es otra cosa: analiza el TEXTO en prosa de una
 * skill antes de instalarla. No cubría las herramientas.
 *
 * Un permiso solo vale si algo lo hace cumplir. Aquí hay tres piezas y las
 * tres tienen que estar:
 *
 *   1. DECLARACIÓN — cada herramienta dice qué efectos tiene (aquí abajo).
 *   2. COMPROBACIÓN — `tool-runner.ts` rechaza la llamada ANTES de ejecutarla
 *      si el efecto está apagado, y `use-agent-tools.ts` ni siquiera le ofrece
 *      al modelo las que no puede usar. Dos capas: que el modelo se invente
 *      una llamada a algo que no se le ofreció es un caso real.
 *   3. INTERRUPTOR — el usuario los apaga en Ajustes y se guarda con el resto
 *      de sus preferencias.
 *
 * Sin la 2 esto sería una pantalla bonita que promete un control que no
 * existe, que es exactamente lo que había que evitar.
 */

/** Qué puede tocar una herramienta. Ordenados de menos a más consecuencias. */
export type EfectoTool =
  /** lee los archivos del proyecto o la memoria de la sesión */
  | "lee_proyecto"
  /** crea, cambia o borra archivos del proyecto del Sandbox */
  | "escribe_proyecto"
  /** ejecuta código: la página en un iframe, o JS suelto en el REPL */
  | "ejecuta"
  /** sale a internet (siempre por /api/proxy, con el escudo anti-SSRF) */
  | "red";

/** Los cuatro efectos, en el orden en que se enseñan. */
export const EFECTOS: readonly EfectoTool[] = [
  "lee_proyecto",
  "escribe_proyecto",
  "ejecuta",
  "red",
];

export const EFECTO_LABEL: Record<EfectoTool, string> = {
  lee_proyecto: "Leer el proyecto",
  escribe_proyecto: "Escribir en el proyecto",
  ejecuta: "Ejecutar código",
  red: "Salir a internet",
};

/** Qué pasa de verdad si lo dejas encendido. Sin adornos y sin porcentajes. */
export const EFECTO_DESC: Record<EfectoTool, string> = {
  lee_proyecto:
    "Lee los archivos que tienes en el Sandbox, la consola de la última ejecución y el mapa del proyecto. No sale nada del dispositivo.",
  escribe_proyecto:
    "Crea, reemplaza y edita archivos del Sandbox, y restaura puntos de guardado. No toca nada fuera del proyecto abierto.",
  ejecuta:
    "Carga tu página en un marco aislado para ver si funciona, y ejecuta JavaScript suelto en otro marco aparte. Sin acceso a tus claves.",
  red: "Pide páginas y APIs de internet a través de /api/proxy, que bloquea localhost, IPs privadas y los metadatos de la nube. Tus claves de IA no viajan en esas peticiones.",
};

/** Herramientas cuyo efecto conviene que el usuario vea antes de decidir. */
export interface PermisoTool {
  efectos: readonly EfectoTool[];
  /** por qué tiene esos efectos, en una línea, para la lista de Ajustes */
  nota: string;
}

/**
 * Los efectos de cada herramienta del catálogo.
 *
 * Un test comprueba que esta tabla y `TOOL_CATALOG` tienen exactamente los
 * mismos nombres, en los dos sentidos: una herramienta sin declarar aquí sería
 * una herramienta sin permiso que nadie puede apagar, y una entrada de más
 * sería una promesa sobre algo que no existe.
 */
export const PERMISOS_TOOL: Record<string, PermisoTool> = {
  read_file: { efectos: ["lee_proyecto"], nota: "lee un archivo del proyecto" },
  list_files: { efectos: ["lee_proyecto"], nota: "lista los archivos del proyecto" },
  read_console: { efectos: ["lee_proyecto"], nota: "relee la consola de la última ejecución" },
  ask_memory: { efectos: ["lee_proyecto"], nota: "consulta el mapa y tus notas" },
  get_quota: { efectos: ["lee_proyecto"], nota: "mira la cuota que te queda con el proveedor" },
  snapshot_diff: { efectos: ["lee_proyecto"], nota: "compara dos estados del proyecto" },

  write_file: { efectos: ["escribe_proyecto"], nota: "reemplaza un archivo entero" },
  edit_file: { efectos: ["escribe_proyecto"], nota: "cambia un fragmento de un archivo" },
  apply_patch: {
    efectos: ["escribe_proyecto"],
    nota: "aplica parches SEARCH/REPLACE a un archivo",
  },
  // «create» y «list» solo leen, pero «restore» descarta archivos: manda el
  // efecto más fuerte de los que la herramienta puede llegar a tener.
  git_snapshot: {
    efectos: ["lee_proyecto", "escribe_proyecto"],
    nota: "guarda y restaura puntos del proyecto (restaurar descarta cambios posteriores)",
  },

  run_project: { efectos: ["lee_proyecto", "ejecuta"], nota: "carga tu página y recoge la consola" },
  run_js: { efectos: ["ejecuta"], nota: "ejecuta JavaScript en un marco aislado" },
  run_regression: {
    efectos: ["lee_proyecto", "ejecuta"],
    nota: "ejecuta la página y la compara con la anterior",
  },

  read_url: { efectos: ["red"], nota: "trae el texto de una página web" },
  search_web: { efectos: ["red"], nota: "busca en DuckDuckGo" },
  fetch_api: { efectos: ["red"], nota: "pide JSON a una API pública" },
};

/** Lo que el usuario tiene concedido, efecto a efecto. */
export type PermisosConcedidos = Record<EfectoTool, boolean>;

/**
 * Por defecto, todo encendido.
 *
 * No es dejadez: el agente sin permisos no sirve para nada, y un producto que
 * arranca roto para «ser seguro» acaba con el usuario encendiéndolo todo sin
 * leer. Lo que importa es que se VEAN, se puedan apagar y que apagarlos surta
 * efecto de verdad. Nada de esto sale del dispositivo en ningún caso.
 */
export const PERMISOS_POR_DEFECTO: PermisosConcedidos = {
  lee_proyecto: true,
  escribe_proyecto: true,
  ejecuta: true,
  red: true,
};

/** Normaliza lo que venga guardado: si falta un efecto (versión antigua de los
 * ajustes, o un efecto nuevo), se concede. Al revés dejaría al agente mudo
 * después de una actualización, sin que el usuario haya tocado nada. */
export function normalizarPermisos(p: Partial<PermisosConcedidos> | null | undefined): PermisosConcedidos {
  const out = { ...PERMISOS_POR_DEFECTO };
  for (const e of EFECTOS) if (typeof p?.[e] === "boolean") out[e] = p[e] as boolean;
  return out;
}

/** Efectos de una herramienta. Vacío si no está declarada. */
export function efectosDe(nombre: string): readonly EfectoTool[] {
  return PERMISOS_TOOL[nombre]?.efectos ?? [];
}

export interface Veredicto {
  permitida: boolean;
  /** efectos que la herramienta necesita y el usuario tiene apagados */
  falta: EfectoTool[];
}

/**
 * ¿Puede ejecutarse esta herramienta?
 *
 * Una herramienta SIN declarar no se ejecuta. Es lo contrario de lo cómodo,
 * y es lo correcto: si alguien añade una herramienta al catálogo y se olvida
 * de declarar sus efectos, lo que no puede pasar es que corra sin permiso
 * porque nadie sabía qué permiso pedirle.
 */
export function toolPermitida(nombre: string, concedidos: PermisosConcedidos): Veredicto {
  const efectos = PERMISOS_TOOL[nombre]?.efectos;
  if (!efectos) return { permitida: false, falta: [] };
  const falta = efectos.filter((e) => !concedidos[e]);
  return { permitida: falta.length === 0, falta };
}

/** El motivo del rechazo, escrito para que lo lea el MODELO: qué le falta y
 * qué puede hacer en su lugar. Sin esto se queda reintentando la misma
 * llamada hasta agotar las vueltas. */
export function motivoDenegado(nombre: string, falta: EfectoTool[]): string {
  if (!falta.length) {
    return `La herramienta «${nombre}» no tiene permisos declarados, así que no se ejecuta. Es un fallo de la aplicación, no tuyo: sigue sin ella y dilo en tu respuesta.`;
  }
  const nombres = falta.map((e) => `«${EFECTO_LABEL[e]}»`).join(" y ");
  return `El usuario ha apagado ${nombres}, así que «${nombre}» no se ejecuta. No lo vuelvas a intentar con esta ni con otra que necesite lo mismo: resuelve con lo que tengas y dile en tu respuesta qué permiso le haría falta encender.`;
}

/** Filtra el catálogo a lo que el usuario permite. Lo que no puede usarse ni
 * se le ofrece al modelo: gastar tokens describiéndole herramientas que le van
 * a rechazar es tirar contexto y provocar reintentos. */
export function filtrarCatalogo<T extends { name: string }>(
  catalogo: readonly T[],
  concedidos: PermisosConcedidos
): T[] {
  return catalogo.filter((t) => toolPermitida(t.name, concedidos).permitida);
}

/** Las herramientas que cubre un efecto, para enseñarlas en el interruptor.
 * Se saca de la tabla, no se escribe a mano: una lista a mano se queda vieja
 * en cuanto se añade una herramienta, y entonces el panel miente. */
export function toolsDelEfecto(efecto: EfectoTool): string[] {
  return Object.entries(PERMISOS_TOOL)
    .filter(([, p]) => p.efectos.includes(efecto))
    .map(([name]) => name)
    .sort();
}
