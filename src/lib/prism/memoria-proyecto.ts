/** Prism AI — Memoria estructurada del proyecto (Pilar 3 del plan de escalado).
 *
 * Hasta ahora la memoria estaba fragmentada: fallos verificados en una clave
 * global con TTL, reglas «no tocar» por sesión, notas dentro del mapa, y
 * errores en vivo efímeros. Todo era texto o casi. El plan pide datos
 * ESTRUCTURADOS y CONSULTABLES, y sobre todo que el cerebro del proyecto
 * VAYA CON EL PROYECTO: si mañana el repo se clona en otra máquina, la
 * memoria se recupera leyendo los archivos `.prism/` del propio repo — no
 * depende de que este navegador conserve su localStorage.
 *
 * Esquema (mínimo viable, inspirado en el del plan técnico):
 *
 *   .prism/
 *     decisions.json       — decisiones tomadas (usuario | agente | modelo)
 *     errors.json          — errores reales con causa y solución
 *     tasks.json           — Task DNA: qué se encargó, qué modelo, qué pasó
 *     design-tokens.json   — qué dirección visual se usó (variación forzada)
 *     negative-rules.json  — reglas «no tocar» (puente con reglas-no.ts)
 *
 * Persistencia local: UNA clave de localStorage (`prism-memoria-v1`) con un
 * registro por sesión. Se exporta a los cinco JSON con `aArchivosPrism()`
 * cuando se sube el proyecto a GitHub (repo-cloud / github-upload), y se
 * lee de vuelta con `deArchivosPrism()` al clonarlo.
 *
 * Este módulo es puro (strings in, objects out, storage inyectable) para
 * que se pueda testear sin React y sin navegador.
 */

/* ------------------------------------------------------------------ */
/* tipos                                                              */
/* ------------------------------------------------------------------ */

/** Una decisión del proyecto: la paleta, la estructura, qué se descartó. */
export interface DecisionMemoria {
  id: string;
  contenido: string;
  /** quién la tomó */
  origen: "usuario" | "agente" | "modelo";
  /** a qué aplica: todo el proyecto, un archivo o una feature */
  ambito: "global" | "archivo" | "feature";
  /** archivo o feature concreta, si ambito != global */
  referencia?: string;
  creadoEl: number;
}

/** Un error real que ya ocurrió, con su causa y cómo se resolvió. */
export interface ErrorMemoria {
  id: string;
  que: string;
  causa?: string;
  solucion?: string;
  archivos?: string[];
  resuelto: boolean;
  creadoEl: number;
}

/** Task DNA: un encargo convertido en objeto estructurado (plan técnico §4).
 * No es un formulario para el usuario: lo genera el flujo de trabajo y se
 * guarda al terminar (o fallar) la tarea. Alimenta la recomendación de
 * modelo (fase 7) sin necesitar un benchmark formal. */
export interface TareaMemoria {
  id: string;
  objetivo: string;
  archivos?: string[];
  modelo?: string;
  /** pending | running | done | failed */
  estado: "pending" | "running" | "done" | "failed";
  /** nº de reintentos de corrección automática que costó */
  reintentos?: number;
  resultado?: string;
  creadoEl: number;
}

/** Dirección de diseño usada en este proyecto (plan escalado §2.3):
 * guardar qué se usó para NO repetirse entre proyectos. */
export interface DisenoUsado {
  id: string;
  /** id de la dirección (design-directions.ts): editorial, minimal… */
  direccion: string;
  /** paleta y tipografía resumidas, para el historial legible */
  resumen: string;
  creadoEl: number;
}

/** Regla negativa, tal cual `ReglaNo` de reglas-no.ts. Se repite el
 * mínimo para no arrastrar una dependencia: el puente hace el mapeo. */
export interface ReglaMemoria {
  patron: string;
  motivo: string;
  activa: boolean;
  creadoEl: number;
}

/** La memoria completa de UN proyecto. */
export interface MemoriaProyecto {
  decisiones: DecisionMemoria[];
  errores: ErrorMemoria[];
  tareas: TareaMemoria[];
  disenos: DisenoUsado[];
  reglas: ReglaMemoria[];
}

export const MEMORIA_VACIA: MemoriaProyecto = {
  decisiones: [],
  errores: [],
  tareas: [],
  disenos: [],
  reglas: [],
};

/** Topes de cada lista. Más que esto el prompt y el JSON crecen sin
 * aportar: la memoria útil es la reciente y la importante. */
export const TOPE_DECISIONES = 30;
export const TOPE_ERRORES = 30;
export const TOPE_TAREAS = 50;
export const TOPE_DISENOS = 12;
export const TOPE_REGLAS = 20;

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

function id(now: number): string {
  return `m${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Añade al principio y recorta. Devuelve una NUEVA memoria (inmutable:
 * zustand y los tests lo agradecen). */
function push<T>(lista: T[], item: T, tope: number): T[] {
  return [item, ...lista].slice(0, tope);
}

/* ------------------------------------------------------------------ */
/* operaciones                                                        */
/* ------------------------------------------------------------------ */

export function addDecision(
  m: MemoriaProyecto,
  contenido: string,
  origen: DecisionMemoria["origen"],
  ambito: DecisionMemoria["ambito"] = "global",
  referencia?: string,
  ahora = Date.now()
): MemoriaProyecto {
  if (!contenido.trim()) return m;
  return {
    ...m,
    decisiones: push(
      m.decisiones,
      {
        id: id(ahora),
        contenido: contenido.trim(),
        origen,
        ambito,
        ...(referencia ? { referencia } : {}),
        creadoEl: ahora,
      },
      TOPE_DECISIONES
    ),
  };
}

export function addError(
  m: MemoriaProyecto,
  que: string,
  datos?: { causa?: string; solucion?: string; archivos?: string[] },
  ahora = Date.now()
): MemoriaProyecto {
  if (!que.trim()) return m;
  return {
    ...m,
    errores: push(
      m.errores,
      {
        id: id(ahora),
        que: que.trim(),
        ...(datos?.causa ? { causa: datos.causa } : {}),
        ...(datos?.solucion ? { solucion: datos.solucion } : {}),
        ...(datos?.archivos?.length ? { archivos: datos.archivos } : {}),
        resuelto: !!datos?.solucion,
        creadoEl: ahora,
      },
      TOPE_ERRORES
    ),
  };
}

export function addTarea(
  m: MemoriaProyecto,
  objetivo: string,
  datos?: { archivos?: string[]; modelo?: string; estado?: TareaMemoria["estado"]; reintentos?: number; resultado?: string },
  ahora = Date.now()
): MemoriaProyecto {
  if (!objetivo.trim()) return m;
  return {
    ...m,
    tareas: push(
      m.tareas,
      {
        id: id(ahora),
        objetivo: objetivo.trim(),
        ...(datos?.archivos?.length ? { archivos: datos.archivos } : {}),
        ...(datos?.modelo ? { modelo: datos.modelo } : {}),
        estado: datos?.estado ?? "done",
        ...(datos?.reintentos !== undefined ? { reintentos: datos.reintentos } : {}),
        ...(datos?.resultado ? { resultado: datos.resultado } : {}),
        creadoEl: ahora,
      },
      TOPE_TAREAS
    ),
  };
}

export function addDiseno(
  m: MemoriaProyecto,
  direccion: string,
  resumen: string,
  ahora = Date.now()
): MemoriaProyecto {
  if (!direccion.trim()) return m;
  return {
    ...m,
    disenos: push(
      m.disenos,
      { id: id(ahora), direccion: direccion.trim(), resumen, creadoEl: ahora },
      TOPE_DISENOS
    ),
  };
}

/** La última dirección de diseño usada, o null (para la variación forzada:
 * si la anterior fue «editorial», la siguiente no debería serlo). */
export function ultimoDiseno(m: MemoriaProyecto): string | null {
  return m.disenos[0]?.direccion ?? null;
}

/** ¿Este modelo ya falló mucho en este proyecto? (fase 7: el gratis que
 * acumula reintentos en tareas de diseño deja de recomendarse). */
export function reintentosDeModelo(m: MemoriaProyecto, modelo: string): number {
  return m.tareas
    .filter((t) => t.modelo === modelo)
    .reduce((n, t) => n + (t.reintentos ?? 0), 0);
}

/* ------------------------------------------------------------------ */
/* puente con reglas-no.ts                                            */
/* ------------------------------------------------------------------ */

/** Reglas de la sesión → memoria (export). */
export function reglasAMemoria(
  m: MemoriaProyecto,
  reglas: readonly { patron: string; motivo: string }[]
): MemoriaProyecto {
  const activas = reglas.map((r) => ({
    patron: r.patron,
    motivo: r.motivo,
    activa: true,
    creadoEl: Date.now(),
  }));
  return { ...m, reglas: activas.slice(0, TOPE_REGLAS) };
}

/* ------------------------------------------------------------------ */
/* export/import: los archivos .prism/                                */
/* ------------------------------------------------------------------ */

/** Prefijo de carpeta en el repo. */
export const CARPETA_PRISM = ".prism/";

/** Serializa la memoria a los cinco JSON del repo. Devuelve un mapa
 * `path → contenido` listo para añadir a un commit de Repo Studio. Solo
 * incluye las secciones con contenido: un `.prism/` vacío en el repo
 * sería ruido. */
export function aArchivosPrism(m: MemoriaProyecto): Record<string, string> {
  const out: Record<string, string> = {};
  const volcar = (nombre: string, datos: unknown) => {
    out[`${CARPETA_PRISM}${nombre}`] = JSON.stringify(datos, null, 2);
  };
  if (m.decisiones.length) volcar("decisions.json", m.decisiones);
  if (m.errores.length) volcar("errors.json", m.errores);
  if (m.tareas.length) volcar("tasks.json", m.tareas);
  if (m.disenos.length) volcar("design-tokens.json", m.disenos);
  if (m.reglas.length) volcar("negative-rules.json", m.reglas);
  return out;
}

function parseLista<T>(crudo: string | undefined): T[] {
  if (!crudo) return [];
  try {
    const v = JSON.parse(crudo);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

/** Lee los archivos `.prism/` de un repo clonado y reconstruye la
 * memoria. Tolera archivos ausentes, corruptos o a medias: lo que se
 * pueda leer se recupera, lo que no, no (y no rompe la carga del repo). */
export function deArchivosPrism(files: Record<string, string>): MemoriaProyecto {
  const buscar = (nombre: string): string | undefined => {
    const directo = files[`${CARPETA_PRISM}${nombre}`];
    if (directo !== undefined) return directo;
    // tolera rutas con carpeta raíz (los zip suelen traer «repo-main/.prism/…»)
    const hit = Object.entries(files).find(
      ([k, v]) => k.endsWith(`${CARPETA_PRISM}${nombre}`) && k.length > 0
    );
    return hit ? hit[1] : undefined;
  };
  const esNumero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  const creado = (v: unknown): number => (esNumero(v) ? v : 0);

  const decisiones = parseLista<DecisionMemoria>(buscar("decisions.json"))
    .filter((d) => typeof d?.contenido === "string" && d.contenido.trim())
    .map((d) => ({
      ...d,
      creadoEl: creado(d.creadoEl),
      ambito: (d.ambito === "archivo" || d.ambito === "feature" ? d.ambito : "global") as DecisionMemoria["ambito"],
      origen: (d.origen === "usuario" || d.origen === "modelo" || d.origen === "agente" ? d.origen : "usuario") as DecisionMemoria["origen"],
    }));
  const errores = parseLista<ErrorMemoria>(buscar("errors.json"))
    .filter((e) => typeof e?.que === "string" && e.que.trim())
    .map((e) => ({ ...e, creadoEl: creado(e.creadoEl), resuelto: !!e.resuelto }));
  const tareas = parseLista<TareaMemoria>(buscar("tasks.json"))
    .filter((t) => typeof t?.objetivo === "string" && t.objetivo.trim())
    .map((t) => ({
      ...t,
      creadoEl: creado(t.creadoEl),
      estado: (["pending", "running", "done", "failed"].includes(t.estado) ? t.estado : "done") as TareaMemoria["estado"],
    }));
  const disenos = parseLista<DisenoUsado>(buscar("design-tokens.json"))
    .filter((d) => typeof d?.direccion === "string" && d.direccion.trim())
    .map((d) => ({ ...d, creadoEl: creado(d.creadoEl) }));
  const reglas = parseLista<ReglaMemoria>(buscar("negative-rules.json"))
    .filter((r) => typeof r?.patron === "string" && r.patron.trim())
    .map((r) => ({ ...r, creadoEl: creado(r.creadoEl), activa: r.activa !== false }));

  return { decisiones, errores, tareas, disenos, reglas };
}

/** ¿Hay algo en la carpeta .prism/ de este repo? (para el aviso de
 * «memoria recuperada» al clonar). */
export function hayPrismEn(files: Record<string, string>): boolean {
  return Object.keys(files).some((k) => k.includes(CARPETA_PRISM));
}

/* ------------------------------------------------------------------ */
/* render para el prompt                                              */
/* ------------------------------------------------------------------ */

/** Bloque de memoria que viaja al modelo (Auto Context). Compacto: solo
 * lo que cambia el comportamiento. Sin decisiones el bloque no existe. */
export function renderMemoriaParaPrompt(m: MemoriaProyecto): string | null {
  const lineas: string[] = [];
  if (m.decisiones.length) {
    lineas.push("## Memoria del proyecto — decisiones ya tomadas");
    for (const d of m.decisiones.slice(0, 8)) lineas.push(`- ${d.contenido}`);
  }
  const erroresAbiertos = m.errores.filter((e) => !e.resuelto).slice(0, 5);
  if (erroresAbiertos.length) {
    lineas.push("## Errores conocidos sin resolver");
    for (const e of erroresAbiertos) lineas.push(`- ${e.que}${e.causa ? ` (causa: ${e.causa})` : ""}`);
  }
  const historial = m.errores.filter((e) => e.resuelto && e.solucion).slice(0, 4);
  if (historial.length) {
    lineas.push("## Errores pasados ya resueltos (no los repitas)");
    for (const e of historial) lineas.push(`- ${e.que} → ${e.solucion}`);
  }
  if (!lineas.length) return null;
  return lineas.join("\n");
}

/* ------------------------------------------------------------------ */
/* persistencia                                                       */
/* ------------------------------------------------------------------ */

const CLAVE = "prism-memoria-v1";

/** Registro global: sesión → memoria. localStorage con fallback en
 * memoria (mismo patrón que snapshots.ts). */
function storagePorDefecto(): Storage {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    /* bloqueado */
  }
  // import diferido para no arrastrar snapshots.ts a los tests: mapa propio
  let datos = new Map<string, string>();
  return {
    get length() {
      return datos.size;
    },
    clear: () => datos.clear(),
    getItem: (k) => (datos.has(k) ? datos.get(k)! : null),
    key: (i) => Array.from(datos.keys())[i] ?? null,
    removeItem: (k) => datos.delete(k),
    setItem: (k, v) => datos.set(k, v),
  };
}

export function leerTodo(st: Storage = storagePorDefecto()): Record<string, MemoriaProyecto> {
  try {
    const crudo = st.getItem(CLAVE);
    if (!crudo) return {};
    const v = JSON.parse(crudo);
    return v && typeof v === "object" ? (v as Record<string, MemoriaProyecto>) : {};
  } catch {
    return {};
  }
}

export function guardarTodo(
  todo: Record<string, MemoriaProyecto>,
  st: Storage = storagePorDefecto()
): void {
  try {
    st.setItem(CLAVE, JSON.stringify(todo));
  } catch {
    // cuota llena: la memoria no se rompe, solo no se persiste
  }
}

export function leerMemoria(sesionId: string, st: Storage = storagePorDefecto()): MemoriaProyecto {
  return leerTodo(st)[sesionId] ?? { ...MEMORIA_VACIA };
}

export function guardarMemoria(
  sesionId: string,
  m: MemoriaProyecto,
  st: Storage = storagePorDefecto()
): void {
  const todo = leerTodo(st);
  todo[sesionId] = m;
  guardarTodo(todo, st);
}

/** Borra la memoria de una sesión (al eliminar la conversación). */
export function borrarMemoria(sesionId: string, st: Storage = storagePorDefecto()): void {
  const todo = leerTodo(st);
  delete todo[sesionId];
  guardarTodo(todo, st);
}
