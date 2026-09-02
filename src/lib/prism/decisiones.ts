/** Prism AI — Qué hacer cuando un intento sale mal.
 *
 * Estas decisiones vivían dentro del `useCallback` de `runGeneration`, en
 * `chat-app.tsx` (2.300+ líneas), enredadas con React, toasts y el store. Eso
 * significaba que **la única forma de probarlas era abrir un navegador**: cada
 * arreglo del failover costaba un ciclo de Playwright para comprobar algo que
 * es una función pura de cinco datos.
 *
 * Y no es teoría: sacar el bucle de tools de su hook (v3.17.0) destapó cuatro
 * fallos que los E2E no veían. Aquí se hace lo mismo con el failover.
 *
 * Estas funciones no tocan nada: reciben el estado del intento y devuelven qué
 * hacer. Los avisos, el store y el repintado se quedan en el componente.
 */

export interface Candidato {
  providerId: string;
  modelId: string;
}

/** Qué hacer después de un intento fallido. */
export type Decision =
  /** seguir por otro modelo de la cadena, en el índice dado */
  | { tipo: "siguiente"; indice: number }
  /** no hay más cadena: buscar otro proveedor (y llevarse lo escrito) */
  | { tipo: "failover" }
  /** no hay nada más que intentar: enseñar el error */
  | { tipo: "parar" };

export interface EstadoIntento {
  /** código HTTP del fallo, 0 si no hubo respuesta */
  status: number;
  /** mensaje del proveedor, para reconocer la cuota escrita en texto */
  mensajeCuota: boolean;
  /** modelo «Auto»: recorre la cadena en cualquier fallo */
  auto: boolean;
  /** saltos ya dados por esta misma respuesta */
  depth: number;
  /** tope de saltos */
  maxSaltos: number;
  /** posición actual dentro de la cadena */
  indice: number;
  cadena: Candidato[];
  /** lo que el modelo llegó a escribir antes de caerse */
  parcial: string;
  /** ese trozo vale la pena rescatar (largo suficiente y cortado) */
  rescatable: boolean;
}

/** Un fallo pasajero: merece reintentar con otro modelo aunque el modelo sea
 *  manual. Un 400 o un 404 no — ahí el problema es la petición, no el momento. */
export function esPasajero(status: number): boolean {
  return status === 0 || status === 408 || status >= 500;
}

/**
 * Siguiente candidato de la cadena.
 *
 * Con un fallo de cuota se salta al siguiente PROVEEDOR: dar tumbos entre los
 * modelos de uno que ya dijo «no te queda» es gastar intentos para nada. Con
 * cualquier otro fallo basta con el siguiente de la lista.
 */
export function siguienteIndice(e: Pick<EstadoIntento, "status" | "mensajeCuota" | "indice" | "cadena">): number {
  const cuota = e.status === 402 || e.status === 429 || e.mensajeCuota;
  if (cuota) {
    const actual = e.cadena[e.indice];
    return e.cadena.findIndex((c, i) => i > e.indice && c.providerId !== actual?.providerId);
  }
  return e.indice + 1 < e.cadena.length ? e.indice + 1 : -1;
}

/**
 * Qué hacer tras un intento que lanzó error.
 *
 * El orden importa: primero agotar la cadena que ya tenemos (es gratis y no
 * cambia el modelo elegido por el usuario), y solo después buscar fuera.
 */
export function decidirTrasError(e: EstadoIntento): Decision {
  const indice = siguienteIndice(e);
  const hayMas = indice >= 0;

  // Auto avanza en CUALQUIER fallo: para eso lo eligió el usuario.
  if (e.auto && hayMas) return { tipo: "siguiente", indice };

  // Con modelo manual solo se avanza en fallos pasajeros: si el modelo no
  // existe o la petición es inválida, probar otro es esconder el problema.
  if (!e.auto && hayMas && esPasajero(e.status) && e.depth < e.maxSaltos) {
    return { tipo: "siguiente", indice };
  }

  if (e.depth >= e.maxSaltos) return { tipo: "parar" };

  // Fuera de la cadena: cuota agotada, o un trabajo a medias que merece la
  // pena continuar con otro proveedor en vez de tirarlo.
  const sinCuota = e.status === 402 || (e.mensajeCuota && !e.parcial);
  if (sinCuota || e.rescatable) return { tipo: "failover" };

  // Y un fallo PASAJERO sin cadena que seguir. Aquí se paraba: elegías un
  // modelo a mano, el proveedor contestaba 503 «high demand», la cadena era de
  // uno solo y el error se quedaba en pantalla sin intentar nada más. Tener
  // otros proveedores conectados y no usarlos cuando el tuyo está caído es
  // justo lo que el failover existe para evitar.
  if (esPasajero(e.status)) return { tipo: "failover" };

  return { tipo: "parar" };
}

/** Por qué se está saltando de proveedor. Lo pide la interfaz: hasta ahora
 *  TODOS los avisos del failover decían «cuota gratis agotada», también cuando
 *  el proveedor estaba caído o la clave era de pago. Decirle a alguien con una
 *  clave Pro que se le acabó la cuota gratis manda a mirar donde no es. */
export type MotivoFailover = "cuota" | "caido" | "otro";

export function motivoDelFallo(status: number, mensajeCuota: boolean): MotivoFailover {
  if (status === 402 || status === 429 || mensajeCuota) return "cuota";
  if (esPasajero(status)) return "caido";
  return "otro";
}

/** Titular del aviso cuando SÍ hay a quién saltar. */
export function tituloFailover(motivo: MotivoFailover, proveedor: string): string {
  if (motivo === "cuota") return `Cuota agotada en ${proveedor}`;
  if (motivo === "caido") return `${proveedor} no está respondiendo`;
  return `${proveedor} falló`;
}

/** Titular cuando no queda ningún otro proveedor al que ir. */
export function tituloSinAlternativa(motivo: MotivoFailover, proveedor: string): string {
  if (motivo === "cuota") return `${proveedor} se quedó sin cuota`;
  if (motivo === "caido") return `${proveedor} no está respondiendo`;
  return `${proveedor} falló`;
}

/**
 * Qué hacer cuando el proveedor responde 200 pero el texto ES el aviso de
 * cuota. Lo hacen varios routers gratuitos, y contarlo como respuesta buena
 * dejaba al usuario leyendo un error del proveedor como si fuera la respuesta.
 */
export function decidirTrasCuotaEnTexto(e: EstadoIntento): Decision {
  const actual = e.cadena[e.indice];
  const indice = e.cadena.findIndex((c, i) => i > e.indice && c.providerId !== actual?.providerId);
  if (indice >= 0 && (e.auto || e.depth < e.maxSaltos)) return { tipo: "siguiente", indice };
  return e.depth < e.maxSaltos ? { tipo: "failover" } : { tipo: "parar" };
}

/**
 * Qué hacer cuando el modelo cierra el stream sin escribir nada.
 *
 * Pasa con los de razonamiento: gastan el presupuesto de salida pensando. Se
 * contaba como éxito y la burbuja se quedaba en blanco.
 */
export function decidirTrasVacio(e: EstadoIntento): Decision {
  const hayMas = e.indice + 1 < e.cadena.length;
  if (hayMas && (e.auto || e.depth < e.maxSaltos)) return { tipo: "siguiente", indice: e.indice + 1 };
  return e.depth < e.maxSaltos ? { tipo: "failover" } : { tipo: "parar" };
}
