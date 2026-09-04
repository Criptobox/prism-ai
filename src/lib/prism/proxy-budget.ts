/** Prism AI — Presupuesto de `/api/proxy`: que no te usen de relé.
 *
 * El proxy ya tiene escudo anti-SSRF (`net-guard.ts`): valida el destino y
 * revalida cada redirección. Eso impide que te lo usen para llegar a la red
 * interna de quien despliega. Lo que NO impide es que te lo usen para
 * retransmitir tráfico legítimo: mil peticiones a un destino permitido pasan
 * todas, y el que paga el ancho de banda y se come el baneo del dominio es el
 * que desplegó la app.
 *
 * El `timeout` de 90 s tampoco sirve para esto: corta la petición que no
 * contesta, no la ráfaga de peticiones que sí contestan.
 *
 * Aquí va la cuenta, pura y sin estado global: quién ha pedido cuánto en la
 * ventana actual. El estado lo pone quien llama (la ruta), para que esto se
 * pueda probar sin servidor y sin reloj de verdad.
 *
 * ——— Lo que esto NO es ———
 *
 * No es protección contra un atacante decidido: sin cuentas no hay identidad,
 * y una IP se cambia. Es el guardarraíl que impide que un despliegue público
 * se convierta en relé abierto por accidente o por un script tonto. Para más
 * que eso está `PRISM_ACCESS_CODE`, que ya existe.
 */

/** Ventana de conteo. Una ventana corta castiga ráfagas legítimas (el chat
 * manda varias peticiones seguidas al arrancar); una larga tarda en soltar al
 * que se pasó. Un minuto es el punto donde una conversación normal cabe de
 * sobra y un script se topa enseguida. */
export const VENTANA_MS = 60_000;

/** Peticiones por ventana y por identidad.
 *
 * Una conversación activa manda del orden de 10-20 en un minuto contando el
 * probe de herramientas, el streaming y las llamadas del agente. 120 deja
 * margen de sobra para el uso de verdad —incluso con el agente en bucle— y
 * frena a quien lo use de tubería. */
export const MAX_POR_VENTANA = 120;

/** Tope del cuerpo que se acepta reenviar. Un prompt largo con adjuntos en
 * base64 sube rápido; 8 MB cubre una conversación con imágenes y corta el
 * intento de usar el proxy para mover archivos. */
export const MAX_BODY_BYTES = 8 * 1024 * 1024;

/** Lo que la ruta guarda entre peticiones. Un mapa normal: el proceso puede
 * reiniciarse y perderlo, y no pasa nada — se vuelve a contar desde cero. */
export type Contadores = Map<string, { desde: number; cuenta: number }>;

export interface Veredicto {
  ok: boolean;
  /** peticiones que quedan en esta ventana */
  restantes: number;
  /** segundos hasta que la ventana se abre, para `Retry-After` */
  reintentarEn: number;
  motivo?: string;
}

/**
 * Cuenta una petición y dice si pasa.
 *
 * `ahora` se inyecta a propósito: un contador que llama a `Date.now()` por su
 * cuenta no se puede probar sin esperar de verdad, y entonces el test o es
 * lento o es mentira.
 */
export function contar(
  contadores: Contadores,
  identidad: string,
  ahora: number,
  max = MAX_POR_VENTANA,
  ventana = VENTANA_MS
): Veredicto {
  const previo = contadores.get(identidad);
  // ventana caducada (o primera vez): se empieza de cero
  if (!previo || ahora - previo.desde >= ventana) {
    contadores.set(identidad, { desde: ahora, cuenta: 1 });
    return { ok: true, restantes: max - 1, reintentarEn: 0 };
  }
  const cuenta = previo.cuenta + 1;
  previo.cuenta = cuenta;
  const restanteMs = ventana - (ahora - previo.desde);
  if (cuenta > max) {
    return {
      ok: false,
      restantes: 0,
      reintentarEn: Math.max(1, Math.ceil(restanteMs / 1000)),
      motivo: `Demasiadas peticiones: ${max} por minuto. Esto es un límite del despliegue, no de tu proveedor de IA.`,
    };
  }
  return { ok: true, restantes: max - cuenta, reintentarEn: 0 };
}

/**
 * Tira las entradas de ventanas ya caducadas.
 *
 * Sin esto el mapa crece con cada IP que pase por aquí y nunca baja: en un
 * proceso de larga vida eso es una fuga de memoria disfrazada de contador.
 * Devuelve cuántas se tiraron, para poder comprobarlo en un test.
 */
export function limpiar(contadores: Contadores, ahora: number, ventana = VENTANA_MS): number {
  let fuera = 0;
  for (const [k, v] of contadores) {
    if (ahora - v.desde >= ventana) {
      contadores.delete(k);
      fuera++;
    }
  }
  return fuera;
}

/**
 * De quién es esta petición.
 *
 * Sin cuentas no hay identidad de verdad, así que se usa lo que la plataforma
 * ponga delante: la IP del cliente según las cabeceras del proxy de Vercel.
 * `x-forwarded-for` puede traer una cadena; la primera es el cliente.
 *
 * Si no hay ninguna, todos caen en el mismo cubo («desconocido»), que es lo
 * conservador: preferimos limitar de más a dejar el relé abierto. En local no
 * suele haber cabecera y por eso el límite es generoso.
 */
export function identidadDe(cabeceras: { get(n: string): string | null }): string {
  const ff = cabeceras.get("x-forwarded-for");
  if (ff) {
    const primera = ff.split(",")[0]?.trim();
    if (primera) return primera;
  }
  return cabeceras.get("x-real-ip")?.trim() || "desconocido";
}
