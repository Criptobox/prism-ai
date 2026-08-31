/** Prism AI — Lo que TE ha funcionado a ti, aplicado a «Auto».
 *
 * `useUsage` guarda de cada respuesta el modelo, si fue bien, los
 * milisegundos y los caracteres. Es un historial real de qué funciona en tu
 * cuenta, con tus claves y a tu hora del día. `buildTaskChain` no lo miraba:
 * ordenaba por una tabla estática de afinidad y por `lastGood`, el último
 * acierto. O sea, Auto no aprendía: recordaba una cosa.
 *
 * Aquí se convierte ese historial en un ajuste de la puntuación. Dos reglas
 * que mandan sobre cualquier otra consideración:
 *
 *  1. **Sin muestras suficientes no se opina.** Con dos respuestas no se sabe
 *     si un modelo es bueno; ajustar con eso sería la misma clase de invento
 *     que un porcentaje de cuota sacado de la manga.
 *  2. **El ajuste es un empujón, no un mandato.** Se suma a la afinidad por
 *     tipo de tarea, no la sustituye: un modelo con buen historial en general
 *     no es por eso el mejor para hacer una web.
 */

export interface MuestraModelo {
  requests: number;
  ok: number;
  fail: number;
  /** suma de duraciones de las respuestas correctas */
  totalMs: number;
}

/** Por debajo de esto no hay opinión que valga: se devuelve `null`. */
export const MIN_MUESTRAS = 5;

/** Cuánto puede mover la experiencia. La afinidad por tipo de tarea reparte
 * puntuaciones del orden de la decena, así que ±4 inclina la balanza entre
 * dos parecidos sin poder tumbar una afinidad clara. */
export const PESO_EXPERIENCIA = 4;

/** Una respuesta que tarda más de esto se considera lenta del todo. */
export const MS_LENTO = 25_000;

export interface Experiencia {
  /** 0..1, proporción de respuestas correctas */
  acierto: number;
  /** milisegundos medios de las correctas, o null si no hubo ninguna */
  mediaMs: number | null;
  muestras: number;
}

/** Resume el historial de un modelo. `null` si no hay muestras suficientes:
 *  es la diferencia entre «va bien» y «no lo sé todavía». */
export function experienciaDe(u: MuestraModelo | undefined): Experiencia | null {
  if (!u || u.requests < MIN_MUESTRAS) return null;
  const acierto = u.requests > 0 ? u.ok / u.requests : 0;
  return {
    acierto,
    mediaMs: u.ok > 0 ? u.totalMs / u.ok : null,
    muestras: u.requests,
  };
}

/**
 * Ajuste de puntuación a partir de la experiencia.
 *
 * Manda el acierto: un modelo rápido que falla la mitad de las veces no vale
 * nada, y uno lento que siempre contesta vale mucho. La velocidad solo
 * desempata, y con la mitad de peso.
 *
 * Devuelve 0 cuando no hay dato — que es lo mismo que decir «esto no opina» y
 * dejar mandar a la tabla de afinidad.
 */
export function ajustePorExperiencia(e: Experiencia | null): number {
  if (!e) return 0;
  // acierto: 0 → -1, 1 → +1 (centrado en la mitad)
  const porAcierto = e.acierto * 2 - 1;
  // velocidad: 0 ms → +1, MS_LENTO o más → -1. Sin tiempos, no desempata.
  const porVelocidad =
    e.mediaMs == null ? 0 : 1 - 2 * Math.min(1, e.mediaMs / MS_LENTO);
  const bruto = porAcierto + porVelocidad * 0.5;
  // se normaliza al rango del peso, con 1.5 como máximo teórico del bruto
  return (bruto / 1.5) * PESO_EXPERIENCIA;
}

/** Frase para la interfaz. `null` cuando no hay dato: decir «sin dato» es
 *  correcto, inventarse un porcentaje no. */
export function textoExperiencia(e: Experiencia | null): string | null {
  if (!e) return null;
  const pct = Math.round(e.acierto * 100);
  const seg = e.mediaMs == null ? null : (e.mediaMs / 1000).toFixed(1);
  return seg
    ? `${pct}% de aciertos · ${seg}s de media · ${e.muestras} respuestas`
    : `${pct}% de aciertos · ${e.muestras} respuestas`;
}
