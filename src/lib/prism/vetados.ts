/** Prism AI — Proveedores a los que NO se les manda nada.
 *
 * Tener una clave conectada y querer que un proveedor concreto no vea tu
 * código son cosas compatibles. Hoy no lo eran: en cuanto el proveedor está
 * conectado, el failover, el panel de consenso y los ejecutores del
 * orquestador pueden acabar mandándole tu conversación sin que tú lo decidas.
 *
 * Un veto aquí es tajante: **ni una petición**. No es «prefiéreme otros», es
 * «este no».
 *
 * ——— Por qué esto y no borrar la clave ———
 *
 * Borrar la clave también funciona, y es lo que había. Pero entonces pierdes
 * el proveedor para todo: para lo que sí querías usarlo y para el radar de
 * modelos gratis. El veto es más fino: lo dejas conectado y decides tú cuándo
 * entra. Y sobre todo, deja de entrar **por caminos automáticos** —failover,
 * panel, ejecutores— que son justo donde nadie se fija.
 *
 * ——— Lo que un veto NO es ———
 *
 * No es cifrado ni anonimato. Si eliges a mano un modelo de un proveedor
 * vetado, la app te lo dice y no lo manda; pero lo que ya le mandaste antes de
 * vetarlo, ya está mandado. Un veto vale hacia delante.
 */
import type { ProviderId } from "./types";

/** Lo que el usuario tiene vetado. Un `Set` en el uso, un array al guardar. */
export type Vetados = readonly ProviderId[];

/** ¿Se le puede mandar algo a este proveedor? */
export function permitido(id: ProviderId, vetados: Vetados | null | undefined): boolean {
  return !(vetados ?? []).includes(id);
}

/** Quita de una lista de candidatos los que están vetados.
 *
 * Se usa en los tres caminos automáticos —failover, panel de consenso y
 * ejecutores del orquestador— porque son los que eligen por ti. */
export function sinVetados<T extends { providerId: ProviderId }>(
  candidatos: readonly T[],
  vetados: Vetados | null | undefined
): T[] {
  return candidatos.filter((c) => permitido(c.providerId, vetados));
}

/** El motivo del rechazo, para la pantalla.
 *
 * Se dice que es una decisión TUYA y dónde se cambia: un bloqueo sin puerta de
 * salida se lee como un fallo de la app y acaba en «esto no funciona».
 */
export function motivoVetado(nombre: string): string {
  return `«${nombre}» está vetado: tú decidiste que no reciba nada. Se cambia en Ajustes → Proveedores.`;
}

/** Añade o quita un veto. Idempotente. */
export function alternarVeto(vetados: Vetados, id: ProviderId): ProviderId[] {
  return vetados.includes(id) ? vetados.filter((v) => v !== id) : [...vetados, id];
}

/** ¿Vetarlos a todos dejaría la app sin poder responder?
 *
 * Se comprueba ANTES de guardar: quedarse sin ningún proveedor disponible y
 * descubrirlo al enviar es la peor forma de enterarse.
 */
export function quedaAlguno(
  conectados: readonly ProviderId[],
  vetados: Vetados,
  aVetar: ProviderId
): boolean {
  const futuros = new Set([...vetados, aVetar]);
  return conectados.some((c) => !futuros.has(c));
}
