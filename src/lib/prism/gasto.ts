/** Prism AI — El techo de llamadas a modelos de pago.
 *
 * Con claves gratis, gastar de más cuesta un 429 y esperar. Con una clave de
 * pago cuesta dinero, y el orquestador (`orquesta.ts`) multiplica las llamadas
 * por encargo: seis en vez de una. Diez encargos seguidos son sesenta llamadas
 * y hoy nadie te para.
 *
 * Esto para. Y para **antes** de la petición, no después de haberla pagado.
 *
 * ——— Las decisiones ———
 *
 * · **Solo se cuentan las de pago.** Un techo que corta también lo gratis
 *   molesta sin proteger nada, y un límite que estorba se acaba quitando —y
 *   entonces tampoco protege cuando hace falta.
 * · **Por día natural, no por sesión.** Una sesión dura lo que dura una
 *   pestaña; el susto en la factura es del día.
 * · **Encendido de fábrica y generoso.** Apagado de fábrica no protege a quien
 *   no sabe que existe, que es justo quien se lleva el susto. 200 al día deja
 *   trabajar de sobra (una conversación normal son 1-3 llamadas, un encargo
 *   con equipo son 6) y frena un bucle antes de que duela.
 * · **Se cuenta lo intentado, no lo cobrado.** No hay forma de saber desde el
 *   dispositivo si el proveedor cobró la llamada. Una petición que sale es una
 *   petición que puede costar; se cuenta y se dice que se cuenta así.
 *
 * Lo que aquí NO se hace: convertir llamadas en dinero. Los precios varían por
 * proveedor, por modelo y con el tiempo. Un «≈ 2,40 $» inventado en pantalla
 * es peor que un número honesto de llamadas.
 */

/** Techo diario por defecto. Ver arriba el porqué del número. */
export const TOPE_DIARIO_POR_DEFECTO = 200;

/** Tope que se puede poner en Ajustes. Por debajo de 10 no se puede ni
 * mantener una conversación; por encima de 5.000 no está protegiendo nada. */
export const TOPE_MINIMO = 10;
export const TOPE_MAXIMO = 5_000;

/** El contador de un día. */
export interface Contador {
  /** día natural en `YYYY-MM-DD` local: el susto de la factura es por día */
  dia: string;
  /** llamadas a modelos de PAGO intentadas hoy */
  pago: number;
  /** llamadas a modelos gratis: se cuentan para poder enseñarlas, no se topan */
  gratis: number;
}

export const CONTADOR_VACIO: Contador = { dia: "", pago: 0, gratis: 0 };

/** El día natural de una fecha, en local.
 *
 * En local y no en UTC: si el techo se reiniciara a la 1 de la madrugada
 * porque el servidor está en otro huso, el usuario vería su límite saltar a
 * mitad de la tarde sin explicación. */
export function diaDe(ahora: number): string {
  const d = new Date(ahora);
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

export interface Veredicto {
  /** ¿puede salir esta llamada? */
  ok: boolean;
  /** las que quedan hoy; `null` si no hay tope puesto */
  restantes: number | null;
  motivo?: string;
}

/**
 * ¿Puede salir esta llamada? Y si sale, cuéntala.
 *
 * Muta el contador a propósito: el que llama guarda un único objeto y esto es
 * el punto por el que pasa todo. Devuelve el veredicto ANTES de sumar cuando
 * corta, para que una llamada rechazada no gaste cupo — si lo gastara, el
 * contador se dispararía solo al reintentar.
 */
export function contarLlamada(
  c: Contador,
  esDePago: boolean,
  tope: number | null,
  ahora: number
): Veredicto {
  const hoy = diaDe(ahora);
  if (c.dia !== hoy) {
    c.dia = hoy;
    c.pago = 0;
    c.gratis = 0;
  }
  if (!esDePago) {
    c.gratis++;
    return { ok: true, restantes: tope == null ? null : Math.max(0, tope - c.pago) };
  }
  if (tope != null && c.pago >= tope) {
    return {
      ok: false,
      restantes: 0,
      motivo:
        `Has llegado al techo de ${tope} llamadas de pago hoy. Es un límite TUYO, ` +
        `no de tu proveedor: cámbialo o quítalo en Ajustes → Chat. ` +
        `Los modelos gratis siguen funcionando.`,
    };
  }
  c.pago++;
  return { ok: true, restantes: tope == null ? null : Math.max(0, tope - c.pago) };
}

/** Sanea lo que venga de los ajustes. `null` = sin tope, y es una opción
 * legítima: quien sabe lo que hace puede quitarlo. */
export function normalizarTope(v: unknown): number | null {
  if (v === null) return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return TOPE_DIARIO_POR_DEFECTO;
  return Math.max(TOPE_MINIMO, Math.min(TOPE_MAXIMO, Math.trunc(n)));
}

/** A partir de cuánto conviene avisar de que queda poco. Un aviso al 100 % ya
 * no es un aviso, es una notificación de defunción. */
export const AVISAR_DESDE = 0.8;

/** ¿Toca avisar de que se está acabando? */
export function convieneAvisar(c: Contador, tope: number | null): boolean {
  if (tope == null || tope <= 0) return false;
  return c.pago >= Math.floor(tope * AVISAR_DESDE) && c.pago < tope;
}

/** Lo que se enseña del gasto de hoy. Llamadas, no dinero. */
export function resumenGasto(c: Contador, tope: number | null): string {
  const dePago = tope == null ? `${c.pago} de pago` : `${c.pago} de ${tope} de pago`;
  return `Hoy: ${dePago} · ${c.gratis} gratis`;
}
