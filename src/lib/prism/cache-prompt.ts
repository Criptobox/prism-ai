/** Prism AI — Puntos de caché en la petición, y el uso REAL que devuelve el proveedor.
 *
 * ——— El problema ———
 *
 * Un cliente de chat reenvía toda la conversación en cada turno. Con claves
 * gratis eso solo gasta cuota; con una de pago se paga entera cada vez. Y el
 * prompt de Prism no es corto: mapa del proyecto, notas, reglas «no tocar»,
 * skills y N mensajes de historial viajan en todos los turnos.
 *
 * Anthropic (y otros) cobran mucho menos por la parte del prompt que ya vieron
 * hace poco, si se les dice dónde cortar. Eso es lo que hace este módulo:
 * marcar los cortes. No es una optimización de más o menos texto — es el mismo
 * texto, a otro precio.
 *
 * ——— Cómo funciona, y por qué el orden importa ———
 *
 * La caché es por PREFIJO EXACTO: se reutiliza mientras los bytes anteriores
 * al corte sean idénticos. Un solo carácter distinto al principio invalida
 * todo lo que viene detrás. De ahí dos decisiones de esta casa:
 *
 *  · **El corte del sistema va al final del prompt de sistema**, que en Prism
 *    no lleva ni fecha ni hora ni nada que cambie solo (comprobado: las piezas
 *    se montan en `prompt-actual.ts` y ninguna es volátil).
 *  · **Comprimir el historial y cachearlo son incompatibles.** La compresión
 *    reescribe los mensajes viejos, así que el prefijo cambia y la caché nunca
 *    acierta. Ahorrar un puñado de caracteres para perder el descuento del
 *    prefijo entero es un mal negocio, y por eso `modoEfectivo()` apaga la
 *    compresión en los protocolos que sí saben cachear.
 *
 * ——— Lo que NO se promete ———
 *
 * Marcar un corte no garantiza que se cachee: por debajo de un mínimo de
 * tokens (depende del modelo) el proveedor lo ignora en silencio, y la caché
 * caduca en minutos. Por eso lo que se enseña en pantalla NO es lo que
 * pedimos, sino lo que el proveedor dice que hizo — `leerUso()` de aquí abajo.
 * Si el proveedor no lo dice, es «sin dato».
 */
import type { ProviderProtocol } from "./types";

/** La marca de corte de Anthropic. `ephemeral` es la única que existe hoy. */
export const MARCA_CACHE = { type: "ephemeral" } as const;

/** ¿Este protocolo admite marcar cortes de caché en la petición?
 *
 * Solo Anthropic, y a propósito: OpenAI cachea por su cuenta sin que se lo
 * pidas y Gemini tiene su propio mecanismo, con otra forma. Marcar donde no
 * toca sería mandar campos que el proveedor no entiende. */
export function admiteCortes(protocolo: ProviderProtocol): boolean {
  return protocolo === "anthropic";
}

export interface BloqueSistema {
  type: "text";
  text: string;
  cache_control?: typeof MARCA_CACHE;
}

/** El prompt de sistema como un bloque con el corte al final.
 *
 * Devuelve `null` si no hay prompt: un bloque de texto vacío es un error de
 * la API, no un caso borde silencioso. */
export function sistemaCacheable(system: string | undefined | null): BloqueSistema[] | null {
  const t = (system ?? "").trim();
  if (!t) return null;
  return [{ type: "text", text: t, cache_control: MARCA_CACHE }];
}

/** Cuántos cortes puede llevar una petición de Anthropic, en total. */
export const MAX_CORTES = 4;

/** Qué mensajes del historial llevan corte.
 *
 * Dos, y no más:
 *  · **el último** — para que el turno siguiente encuentre TODO esto en caché;
 *  · **uno anterior** — red de seguridad: la caché caduca en minutos, y si la
 *    del último turno ya expiró, esta otra puede seguir viva y salvar la mayor
 *    parte del prefijo.
 *
 * Con el corte del sistema son tres de los cuatro que permite la API. El
 * cuarto se deja libre a propósito: gastarlos todos aquí impediría marcar nada
 * más adelante sin romper esto.
 */
export function cortesDeHistorial(n: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [0];
  // dos mensajes atrás = el turno anterior en una conversación normal
  const anterior = Math.max(0, n - 3);
  return anterior === n - 1 ? [n - 1] : [anterior, n - 1];
}

/** Añade el corte al contenido de un mensaje.
 *
 * El contenido de Anthropic puede ser una cadena o una lista de bloques. El
 * corte solo existe en los bloques, así que una cadena se envuelve. Se marca
 * el ÚLTIMO bloque: el corte incluye todo lo anterior. */
export function conCorte(contenido: string | unknown[]): unknown[] {
  const bloques: unknown[] = typeof contenido === "string"
    ? [{ type: "text", text: contenido }]
    : [...contenido];
  if (bloques.length === 0) return bloques;
  const ultimo = bloques[bloques.length - 1];
  if (typeof ultimo !== "object" || ultimo === null) return bloques;
  bloques[bloques.length - 1] = { ...(ultimo as object), cache_control: MARCA_CACHE };
  return bloques;
}

/** Modo de compresión que de verdad se aplica, y por qué.
 *
 * Comprimir reescribe el historial; la caché exige que el historial no cambie.
 * Donde hay caché, la caché gana: el descuento del prefijo (una fracción del
 * precio de entrada) es mucho mayor que lo que se ahorra recortando espacios.
 */
export function modoEfectivo<M extends string>(
  modo: M,
  protocolo: ProviderProtocol
): { modo: M | "off"; motivo: string | null } {
  if (modo === "off" || !admiteCortes(protocolo)) return { modo, motivo: null };
  return {
    modo: "off",
    motivo:
      "La compresión queda apagada con Anthropic: reescribir el historial " +
      "rompería la caché del prompt, que ahorra mucho más.",
  };
}

/** Lo que el proveedor dice que gastó. `null` en cada campo que no reporte:
 * un cero inventado aquí acabaría pintado como un dato medido. */
export interface UsoProveedor {
  entrada: number | null;
  salida: number | null;
  /** tokens servidos DESDE la caché (los baratos) */
  cacheLeido: number | null;
  /** tokens escritos a la caché (se pagan un poco más caros, una vez) */
  cacheEscrito: number | null;
}

const VACIO: UsoProveedor = { entrada: null, salida: null, cacheLeido: null, cacheEscrito: null };

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

/** Lee el uso de la respuesta, sea del protocolo que sea.
 *
 * Devuelve `null` si el proveedor no mandó nada de esto —que es lo normal en
 * el streaming de OpenAI si no se le pide—, y entonces la pantalla dice «sin
 * dato» en vez de enseñar ceros.
 */
export function leerUso(protocolo: ProviderProtocol, json: unknown): UsoProveedor | null {
  if (typeof json !== "object" || json === null) return null;
  const j = json as Record<string, unknown>;

  if (protocolo === "anthropic") {
    // no-streaming: `usage` arriba. streaming: viene en `message_start`
    // dentro de `message.usage`, y el `message_delta` final trae la salida.
    const directo = j.usage as Record<string, unknown> | undefined;
    const enMensaje = (j.message as Record<string, unknown> | undefined)?.usage as
      | Record<string, unknown>
      | undefined;
    const u = directo ?? enMensaje;
    if (!u) return null;
    const out: UsoProveedor = {
      entrada: num(u.input_tokens),
      salida: num(u.output_tokens),
      cacheLeido: num(u.cache_read_input_tokens),
      cacheEscrito: num(u.cache_creation_input_tokens),
    };
    return hayUso(out) ? out : null;
  }

  if (protocolo === "gemini") {
    const u = j.usageMetadata as Record<string, unknown> | undefined;
    if (!u) return null;
    const out: UsoProveedor = {
      entrada: num(u.promptTokenCount),
      salida: num(u.candidatesTokenCount),
      cacheLeido: num(u.cachedContentTokenCount),
      cacheEscrito: null,
    };
    return hayUso(out) ? out : null;
  }

  const u = j.usage as Record<string, unknown> | undefined;
  if (!u) return null;
  const detalles = u.prompt_tokens_details as Record<string, unknown> | undefined;
  const out: UsoProveedor = {
    entrada: num(u.prompt_tokens),
    salida: num(u.completion_tokens),
    // OpenAI cachea por su cuenta y lo reporta aquí cuando ocurre
    cacheLeido: num(detalles?.cached_tokens),
    cacheEscrito: null,
  };
  return hayUso(out) ? out : null;
}

/** ¿Trae algo que enseñar? */
export function hayUso(u: UsoProveedor | null | undefined): boolean {
  if (!u) return false;
  return u.entrada != null || u.salida != null || u.cacheLeido != null || u.cacheEscrito != null;
}

/** Junta dos lecturas del mismo turno.
 *
 * En streaming, Anthropic manda la entrada al principio y la salida al final:
 * quedarse con la última perdería la entrada, que es justo la que dice si la
 * caché acertó. Gana el valor que EXISTE; si los dos existen, el mayor —el
 * `message_delta` final trae el total acumulado. */
export function fundirUso(a: UsoProveedor | null, b: UsoProveedor | null): UsoProveedor | null {
  if (!a) return b;
  if (!b) return a;
  const mayor = (x: number | null, y: number | null) =>
    x == null ? y : y == null ? x : Math.max(x, y);
  return {
    entrada: mayor(a.entrada, b.entrada),
    salida: mayor(a.salida, b.salida),
    cacheLeido: mayor(a.cacheLeido, b.cacheLeido),
    cacheEscrito: mayor(a.cacheEscrito, b.cacheEscrito),
  };
}

/** Suma dos lecturas de LLAMADAS DISTINTAS del mismo turno.
 *
 * No es lo mismo que `fundirUso`: ahí se juntan trozos de una sola respuesta
 * (Anthropic manda la entrada al empezar y la salida al acabar) y gana el
 * mayor; aquí son llamadas de verdad distintas —cada vuelta del bucle del
 * agente es una— y lo que corresponde es sumarlas. Confundirlas haría que un
 * agente de seis vueltas reportara el gasto de una.
 *
 * `null` + número = el número: un campo que un proveedor no reporta no puede
 * convertir en cero lo que otro sí reportó. */
export function sumarUso(a: UsoProveedor | null, b: UsoProveedor | null): UsoProveedor | null {
  if (!a) return b;
  if (!b) return a;
  const suma = (x: number | null, y: number | null) =>
    x == null ? y : y == null ? x : x + y;
  return {
    entrada: suma(a.entrada, b.entrada),
    salida: suma(a.salida, b.salida),
    cacheLeido: suma(a.cacheLeido, b.cacheLeido),
    cacheEscrito: suma(a.cacheEscrito, b.cacheEscrito),
  };
}

/** Qué parte del prompt vino de la caché, en tanto por ciento.
 *
 * `null` cuando no se puede saber: sin entrada ni caché reportadas no hay
 * denominador, y un 0 % ahí se leería como «la caché no acertó» cuando lo
 * cierto es que no se sabe. */
export function aciertoDeCache(u: UsoProveedor | null): number | null {
  if (!u) return null;
  const leido = u.cacheLeido;
  if (leido == null) return null;
  const nuevo = u.entrada ?? 0;
  const total = leido + nuevo;
  if (total <= 0) return null;
  return Math.round((leido / total) * 100);
}

/** El resumen de una línea, para el chip del mensaje. `null` si no hay dato. */
export function lineaUso(u: UsoProveedor | null): string | null {
  if (!hayUso(u) || !u) return null;
  const trozos: string[] = [];
  if (u.entrada != null) trozos.push(`${u.entrada} entrada`);
  if (u.cacheLeido != null && u.cacheLeido > 0) trozos.push(`${u.cacheLeido} de caché`);
  if (u.salida != null) trozos.push(`${u.salida} salida`);
  return trozos.length ? trozos.join(" · ") : null;
}
