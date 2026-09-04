/** Prism AI — En qué se te va el gasto: por modelo de pago y por tipo de encargo.
 *
 * El panel de Uso ya decía cuántas peticiones hizo cada modelo. Con una clave
 * gratis eso basta. Con una de pago, no: lo que quieres saber es **cuál de tus
 * modelos de pago se está llevando el trabajo y en qué tipo de encargo**, que
 * es lo que decides —«esto lo hago con el gratis»— antes de que llegue la
 * factura.
 *
 * ——— Lo que aquí NO se hace, y es lo más importante ———
 *
 * No se convierte nada en dinero. Los precios cambian por proveedor, por
 * modelo, por tramo de contexto y con el tiempo; desde el navegador no se
 * conocen. Un «≈ 2,40 $» en pantalla se lee como un dato y no lo es. Lo que sí
 * se sabe, y es lo que se enseña:
 *
 *  · **llamadas** — contadas, exactas;
 *  · **caracteres enviados y recibidos** — contados, exactos;
 *  · **tokens aproximados** — caracteres ÷ 4, marcados con «≈» en toda la
 *    interfaz. Es la misma regla que ya usa el medidor de contexto, y es una
 *    aproximación: el contador bueno lo tiene tu proveedor, no esta app.
 *
 * ——— El hueco que se dice en vez de rellenar ———
 *
 * El tipo de encargo se empezó a guardar en la v3.48. Todo lo que se registró
 * antes existe pero no está clasificado, y esas llamadas se cuentan aparte
 * como «sin clasificar» en vez de repartirse a ojo entre las tareas.
 */
import type { TaskKind } from "./task-router";
import type { ModelUsage, UsoTarea } from "./usage";
import { splitModelKey } from "./types";
import { isFreeModel } from "./free-models";

/** Cómo se llama cada tipo de encargo en pantalla. Las mismas palabras que ya
 * usa el clasificador cuando propone modelo o skill: dos nombres distintos
 * para lo mismo obligan a traducir mentalmente. */
export const ETIQUETA_TAREA: Record<TaskKind, string> = {
  web: "página web",
  code: "código",
  write: "escritura",
  reason: "razonamiento",
  data: "datos",
  chat: "chat",
};

/** Caracteres a tokens, aproximado. Regla de 4 caracteres por token, la misma
 * del medidor de contexto. Aproximado de verdad: los tokenizadores varían
 * entre modelos y el español gasta más que el inglés. Por eso todo lo que
 * salga de aquí se pinta con «≈». */
export function tokensAprox(chars: number): number {
  return Math.max(0, Math.round(chars / 4));
}

/** Lo que un modelo gastó en un tipo de encargo. */
export interface FilaTarea {
  tarea: TaskKind;
  etiqueta: string;
  llamadas: number;
  charsIn: number;
  charsOut: number;
  /** la cuenta del proveedor para este encargo: sin ella no hay importe */
  uso: UsoProveedorTarea;
}

/** Tokens reportados por el proveedor, agregados. */
export interface UsoProveedorTarea {
  entrada: number;
  salida: number;
  cacheLeido: number;
  cacheEscrito: number;
  /** llamadas de las que hubo cuenta; con 0 no se puede calcular un importe */
  conUso: number;
}

const USO_VACIO: UsoProveedorTarea = {
  entrada: 0,
  salida: 0,
  cacheLeido: 0,
  cacheEscrito: 0,
  conUso: 0,
};

function sumaUso(a: UsoProveedorTarea, b: UsoProveedorTarea): UsoProveedorTarea {
  return {
    entrada: a.entrada + b.entrada,
    salida: a.salida + b.salida,
    cacheLeido: a.cacheLeido + b.cacheLeido,
    cacheEscrito: a.cacheEscrito + b.cacheEscrito,
    conUso: a.conUso + b.conUso,
  };
}

/** Lo que un modelo gastó en total, con su desglose por encargo. */
export interface FilaGasto {
  key: string;
  providerId: string;
  modelId: string;
  proveedor: string;
  /** false = tiene capa gratuita conocida; ver `free-models.ts` */
  dePago: boolean;
  llamadas: number;
  ok: number;
  fallos: number;
  charsIn: number;
  charsOut: number;
  ultimo: number;
  /** la cuenta del proveedor: tokens reales y aciertos de caché */
  tokIn: number;
  tokOut: number;
  tokCache: number;
  tokCacheEscrito: number;
  /** llamadas de las que hubo cuenta del proveedor */
  conUso: number;
  tareas: FilaTarea[];
  /** llamadas registradas antes de que se guardara el tipo de encargo */
  sinClasificar: number;
}

function ordenarTareas(a: FilaTarea, b: FilaTarea): number {
  return b.charsIn - a.charsIn || b.llamadas - a.llamadas || a.tarea.localeCompare(b.tarea);
}

function desglose(porTarea: Partial<Record<TaskKind, UsoTarea>> | undefined): FilaTarea[] {
  const out: FilaTarea[] = [];
  for (const [tarea, u] of Object.entries(porTarea ?? {}) as [TaskKind, UsoTarea][]) {
    if (!u || u.llamadas <= 0) continue;
    out.push({
      tarea,
      etiqueta: ETIQUETA_TAREA[tarea] ?? tarea,
      llamadas: u.llamadas,
      charsIn: u.charsIn,
      charsOut: u.charsOut,
      uso: {
        entrada: u.tokIn ?? 0,
        salida: u.tokOut ?? 0,
        cacheLeido: u.tokCache ?? 0,
        cacheEscrito: u.tokCacheEscrito ?? 0,
        conUso: u.conUso ?? 0,
      },
    });
  }
  return out.sort(ordenarTareas);
}

/** Convierte lo que guarda el store en filas listas para pintar.
 *
 * El orden es el de la pregunta que se viene a responder: **primero lo que
 * cuesta dinero**, y dentro, lo que más contexto se ha llevado. Un modelo
 * gratis con mil llamadas no es lo que te preocupa.
 */
export function filasDeGasto(
  byModel: Record<string, ModelUsage>,
  nombreProveedor: (providerId: string) => string
): FilaGasto[] {
  const filas: FilaGasto[] = [];
  for (const [key, u] of Object.entries(byModel ?? {})) {
    const split = splitModelKey(key);
    if (!split) continue;
    const tareas = desglose(u.porTarea);
    const clasificadas = tareas.reduce((a, t) => a + t.llamadas, 0);
    filas.push({
      key,
      providerId: split.providerId,
      modelId: split.modelId,
      proveedor: nombreProveedor(split.providerId),
      dePago: !isFreeModel(split.providerId, split.modelId),
      llamadas: u.requests,
      ok: u.ok,
      fallos: u.fail,
      charsIn: u.charsIn,
      charsOut: u.charsOut,
      ultimo: u.lastUsed,
      tokIn: u.tokIn ?? 0,
      tokOut: u.tokOut ?? 0,
      tokCache: u.tokCache ?? 0,
      tokCacheEscrito: u.tokCacheEscrito ?? 0,
      conUso: u.conUso ?? 0,
      tareas,
      sinClasificar: Math.max(0, u.requests - clasificadas),
    });
  }
  return filas.sort(
    (a, b) =>
      Number(b.dePago) - Number(a.dePago) ||
      b.charsIn - a.charsIn ||
      b.llamadas - a.llamadas ||
      b.ultimo - a.ultimo
  );
}

/** Solo los que cuestan dinero. */
export function soloDePago(filas: readonly FilaGasto[]): FilaGasto[] {
  return filas.filter((f) => f.dePago);
}

export interface TotalGasto {
  modelos: number;
  llamadas: number;
  charsIn: number;
  charsOut: number;
}

export function totalDe(filas: readonly FilaGasto[]): TotalGasto {
  return filas.reduce<TotalGasto>(
    (acc, f) => ({
      modelos: acc.modelos + 1,
      llamadas: acc.llamadas + f.llamadas,
      charsIn: acc.charsIn + f.charsIn,
      charsOut: acc.charsOut + f.charsOut,
    }),
    { modelos: 0, llamadas: 0, charsIn: 0, charsOut: 0 }
  );
}

/** Lo que UN modelo se llevó dentro de UN encargo. */
export interface ModeloEnTarea {
  key: string;
  modelId: string;
  providerId: string;
  proveedor: string;
  llamadas: number;
  charsIn: number;
  charsOut: number;
  uso: UsoProveedorTarea;
}

/** Un encargo con los modelos que lo hicieron, de más a menos. */
export interface TareaConModelos extends FilaTarea {
  modelos: ModeloEnTarea[];
}

/** El reparto por encargo, y DENTRO de cada encargo, qué modelo lo hizo.
 *
 * Es el cruce de las dos preguntas: «¿en qué se me va?» y «¿con cuál?». Por
 * separado ninguna de las dos decide nada —saber que gastas en páginas web no
 * te dice qué cambiar, y saber que gastas con tal modelo tampoco—; juntas sí:
 * «las páginas web me las está haciendo el de pago, eso lo muevo al gratis».
 */
export function tareasConModelos(filas: readonly FilaGasto[]): TareaConModelos[] {
  const acc = new Map<TaskKind, TareaConModelos>();
  for (const f of filas) {
    for (const t of f.tareas) {
      const cur = acc.get(t.tarea) ?? {
        ...t,
        llamadas: 0,
        charsIn: 0,
        charsOut: 0,
        uso: USO_VACIO,
        modelos: [],
      };
      cur.llamadas += t.llamadas;
      cur.charsIn += t.charsIn;
      cur.charsOut += t.charsOut;
      cur.uso = sumaUso(cur.uso, t.uso);
      cur.modelos.push({
        key: f.key,
        modelId: f.modelId,
        providerId: f.providerId,
        proveedor: f.proveedor,
        llamadas: t.llamadas,
        charsIn: t.charsIn,
        charsOut: t.charsOut,
        uso: t.uso,
      });
      acc.set(t.tarea, cur);
    }
  }
  for (const t of acc.values()) {
    t.modelos.sort((a, b) => b.charsIn - a.charsIn || b.llamadas - a.llamadas);
  }
  return [...acc.values()].sort(ordenarTareas);
}

/** Cuántas llamadas quedaron sin clasificar en todo el conjunto. */
export function sinClasificarDe(filas: readonly FilaGasto[]): number {
  return filas.reduce((a, f) => a + f.sinClasificar, 0);
}

/** Qué parte del total es esto, en tanto por ciento.
 *
 * `null` cuando el total es cero: un 0 % con denominador vacío se lee como un
 * dato medido y no lo es. Quien pinta decide si escribe «sin dato» o no pinta
 * la barra. */
export function parteDe(n: number, total: number): number | null {
  if (!Number.isFinite(n) || !Number.isFinite(total) || total <= 0) return null;
  return Math.round((n / total) * 100);
}

/** La frase de arriba del todo: en qué encargo se te va más.
 *
 * Devuelve `null` si no hay nada clasificado todavía —y entonces la pantalla
 * dice que aún no hay datos, en vez de enseñar la primera tarea que haya
 * entrado como si fuera una conclusión. */
export function encargoQueMasGasta(reparto: readonly FilaTarea[]): FilaTarea | null {
  if (reparto.length === 0) return null;
  const primero = reparto[0];
  return primero.llamadas > 0 ? primero : null;
}

/** ——— La cuenta del PROVEEDOR ———
 *
 * Todo lo de arriba lo contamos nosotros: caracteres, llamadas, tokens
 * aproximados. Esto no: son los tokens que el proveedor dice haber gastado, y
 * los que sirvió desde la caché del prompt. Solo existe si él los manda —hoy,
 * Anthropic siempre; OpenAI a veces; el resto, casi nunca—, y donde no los
 * manda se dice «sin dato» en vez de rellenarlo con ceros.
 */
export interface TotalProveedor {
  /** llamadas de las que HUBO cuenta; el resto no cuenta para nada de esto */
  llamadas: number;
  entrada: number;
  salida: number;
  cacheLeido: number;
  cacheEscrito: number;
}

export function totalDeProveedor(filas: readonly FilaGasto[]): TotalProveedor {
  return filas.reduce<TotalProveedor>(
    (acc, f) => ({
      llamadas: acc.llamadas + f.conUso,
      entrada: acc.entrada + f.tokIn,
      salida: acc.salida + f.tokOut,
      cacheLeido: acc.cacheLeido + f.tokCache,
      cacheEscrito: acc.cacheEscrito + f.tokCacheEscrito,
    }),
    { llamadas: 0, entrada: 0, salida: 0, cacheLeido: 0, cacheEscrito: 0 }
  );
}

/** Qué porcentaje del prompt entró por caché. `null` sin llamadas con cuenta:
 * un 0 % sin denominador diría «la caché no funciona» cuando lo cierto es que
 * no se sabe. */
export function ahorroDeCacheDe(t: TotalProveedor): number | null {
  if (t.llamadas === 0) return null;
  const total = t.entrada + t.cacheLeido;
  if (total <= 0) return null;
  return Math.round((t.cacheLeido / total) * 100);
}
