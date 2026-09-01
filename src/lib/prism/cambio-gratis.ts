/** Prism AI — Detectar cuándo un modelo gratis deja de serlo.
 *
 * `isFreeModel` (free-models.ts) es una heurística ESTÁTICA: nada vigila el
 * cambio. Si mañana un proveedor retira la capa gratuita de un modelo, Prism
 * lo sigue tratando como gratis hasta que llega el 402. Esto compara *la foto
 * de la última vez que miraste* con *la de ahora* y saca las tres listas.
 *
 * Aquí solo la decisión (pura, sin red y sin store), igual que radar-propio.ts:
 * la red la pone el llamador, que ya sabe a quién preguntar
 * (`proveedoresConsultables`) y cómo (`fetchModels`).
 *
 * Tres listas, y NO son lo mismo:
 *  · DEJÓ DE SER GRATIS  — estaba en la foto gratis, sigue en el catálogo y
 *                          ya no pasa `isFreeModel`. La mala noticia.
 *  · NUEVO Y GRATIS      — pasa `isFreeModel` ahora y no estaba en la foto.
 *  · DESAPARECIÓ         — estaba en la foto gratis y ya no está en el
 *                          catálogo. No se puede decir que «dejó de ser
 *                          gratis»: el modelo ya no existe para ti.
 */
import type { ProviderId } from "./types";
import { isFreeModel } from "./free-models";

/** Foto del catálogo gratis: qué era gratis, por proveedor, y cuándo se miró. */
export interface FotoGratis {
  /** epoch ms del momento de la foto */
  fecha: number;
  /** ids de modelos que eran gratis, por proveedor */
  gratisPorProveedor: Partial<Record<ProviderId, string[]>>;
}

/** Un modelo que cambió de estado respecto a la foto anterior. */
export interface CambioGratis {
  providerId: ProviderId;
  modelId: string;
}

export interface ResultadoCambio {
  dejoDeSerGratis: CambioGratis[];
  nuevoGratis: CambioGratis[];
  desaparecidos: CambioGratis[];
  /** totales SIN truncar por el límite, para el «y N más» honesto */
  totalDejoDeSerGratis: number;
  totalNuevoGratis: number;
  totalDesaparecidos: number;
}

/** Cuántos avisos se enseñan de cada lista. Igual que MAX_NOVEDADES en el
 * radar: veinte líneas de modelos parecidos no se leen. */
export const MAX_CAMBIOS = 12;

/** ¿Sigue siendo este id del mismo modelo gratis hoy? (comparación tolerante
 * a mayúsculas: los proveedores cambian el casing entre llamadas) */
function incluye(lista: string[], modelId: string): boolean {
  const m = modelId.toLowerCase();
  return lista.some((x) => x.toLowerCase() === m);
}

/** Compara la foto anterior con el catálogo de ahora, por proveedor.
 *
 * `catalogo` solo debe traer los proveedores que RESPONDIERON: un proveedor
 * caído no es un proveedor sin modelos gratis, y compararlo enseñaría «te has
 * quedado sin todo» por un corte de red. El llamador se salta a los que
 * `fetchModels` les lance (ver nuevaFoto, que conserva su foto vieja).
 *
 * Primera vez (foto null): las tres listas vacías. No hay aviso, ni «0
 * modelos dejaron de ser gratis»: no se enseña un aviso vacío. Se guarda la
 * foto y ya.
 */
export function compararFoto(
  foto: FotoGratis | null,
  catalogo: Array<{ providerId: ProviderId; modelos: string[] }>,
  limite = MAX_CAMBIOS
): ResultadoCambio {
  const dejo: CambioGratis[] = [];
  const nuevos: CambioGratis[] = [];
  const desaparecidos: CambioGratis[] = [];

  if (!foto) {
    return {
      dejoDeSerGratis: dejo,
      nuevoGratis: nuevos,
      desaparecidos,
      totalDejoDeSerGratis: 0,
      totalNuevoGratis: 0,
      totalDesaparecidos: 0,
    };
  }

  for (const { providerId, modelos } of catalogo) {
    const antesGratis = foto.gratisPorProveedor[providerId] ?? [];

    // lo que era gratis y sigue en el catálogo pero YA NO es gratis
    for (const modelId of antesGratis) {
      if (incluye(modelos, modelId) && !isFreeModel(providerId, modelId)) {
        dejo.push({ providerId, modelId });
      }
    }
    // lo que era gratis y ya ni siquiera está en el catálogo
    for (const modelId of antesGratis) {
      if (!incluye(modelos, modelId)) {
        desaparecidos.push({ providerId, modelId });
      }
    }
    // lo que hoy es gratis y no estaba en la foto
    for (const modelId of modelos) {
      if (isFreeModel(providerId, modelId) && !incluye(antesGratis, modelId)) {
        nuevos.push({ providerId, modelId });
      }
    }
  }

  return {
    dejoDeSerGratis: dejo.slice(0, limite),
    nuevoGratis: nuevos.slice(0, limite),
    desaparecidos: desaparecidos.slice(0, limite),
    totalDejoDeSerGratis: dejo.length,
    totalNuevoGratis: nuevos.length,
    totalDesaparecidos: desaparecidos.length,
  };
}

/** La foto nueva: lo gratis de HOY en los proveedores que respondieron.
 *
 * Los proveedores que NO están en `catalogo` (fallaron al responder) conservan
 * su foto anterior: no se puede afirmar que se quedaron sin nada cuando lo
 * que pasó es que no contestaron.
 */
export function nuevaFoto(
  foto: FotoGratis | null,
  catalogo: Array<{ providerId: ProviderId; modelos: string[] }>,
  ahora = Date.now()
): FotoGratis {
  const gratisPorProveedor: Partial<Record<ProviderId, string[]>> = {
    ...(foto?.gratisPorProveedor ?? {}),
  };
  for (const { providerId, modelos } of catalogo) {
    gratisPorProveedor[providerId] = modelos.filter((m) => isFreeModel(providerId, m));
  }
  return { fecha: ahora, gratisPorProveedor };
}

/** Frase honesta del aviso. Se enseña la fecha que se tiene — la de la última
 * foto —, nunca un «desde hace 3 días» calculado sobre otra cosa. */
export function resumenCambio(c: ResultadoCambio, fechaFoto: number | null): string | null {
  if (!c.dejoDeSerGratis.length && !c.desaparecidos.length && !c.nuevoGratis.length) {
    return null;
  }
  const partes: string[] = [];
  if (c.totalDejoDeSerGratis) {
    partes.push(
      `${c.totalDejoDeSerGratis} ${c.totalDejoDeSerGratis === 1 ? "modelo dejó de ser gratis" : "modelos dejaron de ser gratis"}`
    );
  }
  if (c.totalDesaparecidos) {
    partes.push(
      `${c.totalDesaparecidos} ${c.totalDesaparecidos === 1 ? "desapareció" : "desaparecieron"} del catálogo`
    );
  }
  if (c.totalNuevoGratis) {
    partes.push(
      `${c.totalNuevoGratis} ${c.totalNuevoGratis === 1 ? "nuevo gratis" : "nuevos gratis"}`
    );
  }
  const cuando = fechaFoto
    ? ` Cambios desde la foto del ${new Date(fechaFoto).toLocaleDateString("es")}.`
    : "";
  return `${partes.join(" · ")}.${cuando}`;
}
