/** Prism AI — Qué modelos proponer al conectar un proveedor.
 *
 * Hasta aquí los «Sugeridos» salían SIEMPRE de `defaultModels`, una lista
 * escrita a mano en `providers.ts`. El problema no es que esté mal escrita:
 * es que los proveedores retiran y renombran modelos constantemente, así que
 * cualquier lista fija envejece sola. En OpenRouter, cuatro de los cinco
 * sugeridos ya no existían: los pulsabas, se añadían, y salían en rojo.
 *
 * Y lo peor es que la app YA tenía la respuesta buena delante: «Probar»
 * pregunta al proveedor y le contesta con su catálogo entero —423 modelos en
 * el caso que destapó esto— y esa lista se tiraba después de contarla.
 *
 * Aquí solo la decisión, sin red y sin React: con catálogo vivo se propone de
 * ahí; sin él, la lista de mano, y quien pinta lo dice para que se distinga
 * un modelo comprobado de una suposición.
 */
import type { ProviderId } from "./types";
import { isFreeModel } from "./free-models";

/** Cuántos se enseñan. Son atajos, no un catálogo: veinte no se leen. */
export const MAX_SUGERIDOS = 8;

export interface Sugerencias {
  /** los que se pintan, ya recortados al límite */
  modelos: string[];
  /**
   * `catalogo` = salen de lo que el proveedor acaba de contestar, así que
   * existen. `mano` = de la lista fija del código, que puede estar vieja.
   * La interfaz TIENE que distinguirlos: proponer como seguro algo que no se
   * ha comprobado es lo que hacía que el usuario añadiera modelos muertos.
   */
  origen: "catalogo" | "mano";
  /** cuántos candidatos había en total antes de recortar */
  total: number;
}

/** ¿Está ya en la lista del usuario? (los ids llegan con mayúsculas cambiadas
 *  según el proveedor, así que se compara en minúsculas) */
function yaLoTienes(actuales: string[], modelId: string): boolean {
  const m = modelId.toLowerCase();
  return actuales.some((x) => x.toLowerCase() === m);
}

/**
 * Propone modelos para añadir.
 *
 * `catalogoVivo` es lo que el proveedor contestó a «Probar» o a «Cargar
 * modelos». Si no hay (nunca se probó, o falló), se cae a `porDefecto` — pero
 * el `origen` lo dice, no se disimula.
 *
 * Del catálogo vivo solo se proponen los GRATIS: es lo que promete la app, y
 * proponer de pago sin avisar sería otra forma de mentir.
 */
export function sugerirModelos(
  providerId: ProviderId,
  actuales: string[],
  catalogoVivo: string[] | null | undefined,
  porDefecto: string[],
  limite = MAX_SUGERIDOS
): Sugerencias {
  if (catalogoVivo && catalogoVivo.length) {
    const gratis = catalogoVivo.filter(
      (m) => isFreeModel(providerId, m) && !yaLoTienes(actuales, m)
    );
    // si el catálogo vivo no trae ni un gratis que te falte, no se rellena con
    // la lista de mano: sería volver a proponer lo que no existe
    return { modelos: gratis.slice(0, limite), origen: "catalogo", total: gratis.length };
  }
  const restantes = porDefecto.filter((m) => !yaLoTienes(actuales, m));
  return { modelos: restantes.slice(0, limite), origen: "mano", total: restantes.length };
}
