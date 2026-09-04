/** Prism AI — De tokens a dinero, y solo cuando se puede de verdad.
 *
 * Durante muchas versiones esta app se negó a enseñar un importe, y la razón
 * escrita era «los precios no se pueden saber desde el navegador». Era falsa:
 * no se pueden *adivinar*, que es otra cosa. Existen catálogos públicos que los
 * mantienen al día, y uno de ellos —el de LiteLLM— cubre **los 17 modelos que
 * Prism cuenta como de pago, los 17**. Comprobado, no supuesto.
 *
 * Así que ahora sí hay importes. Con una regla que no se salta nunca:
 *
 *   **Dinero = (tokens que dijo el proveedor) × (precio fechado del catálogo).**
 *
 * Las dos mitades tienen que existir. Si falta una, no hay importe: hay «sin
 * dato», y se dice cuál de las dos falta. En concreto:
 *
 *  · **Nunca se multiplica nuestra estimación de caracteres ÷ 4.** Ese número
 *    sirve para hacerse una idea del tamaño de un prompt; multiplicado por un
 *    precio se convierte en una factura inventada con pinta de exacta.
 *  · **Nunca se rellena un modelo que no está en el catálogo.** Ni con el
 *    precio de un modelo «parecido», ni con la media del proveedor.
 *  · **La fecha viaja con el número.** Un precio de hace ocho meses en pantalla
 *    sin decir de cuándo es, es peor que no enseñar nada.
 *
 * La tabla se regenera con `npm run precios` (ver `scripts/precios.mjs`) y se
 * puede refrescar en caliente desde `/api/precios`. Aquí no hay ni un número
 * escrito a mano.
 */
import { PRECIOS, PRECIOS_FECHA, type PrecioToken } from "./precios-datos";
import type { UsoProveedor } from "./cache-prompt";

export { PRECIOS_FECHA, PRECIOS_FUENTE, PRECIOS_FUENTE_NOMBRE } from "./precios-datos";
export type { PrecioToken } from "./precios-datos";

export type TablaPrecios = Record<string, PrecioToken>;

/** A partir de cuántos días la instantánea deja de ser de fiar.
 *
 * No es que a los 45 días el precio esté mal: es que a los 45 días ya no se
 * puede afirmar que esté bien. Pasado eso la app sigue enseñando el número
 * pero avisa de que es viejo, que es distinto de esconderlo. */
export const DIAS_PARA_AVISAR = 45;

/** Normaliza un id de modelo para poder compararlo.
 *
 * Los mismos modelos aparecen escritos de formas distintas según por dónde
 * pasen: con el proveedor delante (`anthropic/claude-opus-5`), con sufijos de
 * fecha (`-20250929`), en mayúsculas, o con el sufijo de gratis de cada
 * pasarela (`:free`, `-free`). */
function pelar(id: string): string {
  return id
    .trim()
    .toLowerCase()
    .replace(/:free$/, "")
    .replace(/-free$/, "");
}

/** Los candidatos con los que buscar un modelo en la tabla, en orden de menos
 * a más permisivo. El orden importa: primero lo exacto. */
function candidatos(providerId: string, modelId: string): string[] {
  const m = pelar(modelId);
  const sinFecha = m.replace(/-20\d{6}$/, "");
  const ultimo = m.includes("/") ? m.slice(m.lastIndexOf("/") + 1) : m;
  return [...new Set([m, `${providerId}/${m}`, sinFecha, `${providerId}/${sinFecha}`, ultimo])];
}

export interface PrecioEncontrado {
  precio: PrecioToken;
  /** con qué clave del catálogo se encontró: se enseña para que se pueda
   * comprobar que no se ha cogido el precio de otro modelo */
  clave: string;
  /** true si hubo que quitar el sufijo de fecha o el prefijo del proveedor */
  aproximada: boolean;
}

/** Busca el precio de un modelo. `null` si no está: no se inventa uno parecido.
 *
 * La coincidencia se hace contra el id del modelo, no contra el proveedor con
 * el que lo llamas: el mismo modelo servido por dos pasarelas puede costar
 * distinto, y en ese caso lo honesto es no afirmar el precio de una cuando
 * estás usando la otra. Por eso una coincidencia solo cuenta si el proveedor
 * del catálogo es el mismo, salvo en las pasarelas que revenden de todo
 * (donde el precio del catálogo es el del modelo, no el de la pasarela).
 */
export function buscarPrecio(
  providerId: string,
  modelId: string,
  tabla: TablaPrecios = PRECIOS
): PrecioEncontrado | null {
  const cands = candidatos(providerId, modelId);
  for (const [i, c] of cands.entries()) {
    const p = tabla[c];
    if (!p) continue;
    if (p.p !== providerId) continue;
    return { precio: p, clave: c, aproximada: i > 1 };
  }
  return null;
}

export interface Coste {
  /** dólares de los tokens de entrada nuevos */
  entrada: number;
  /** dólares de los tokens generados */
  salida: number;
  /** dólares de lo servido desde la caché (mucho más barato) */
  cache: number;
  /** dólares de escribir la caché */
  cacheEscrito: number;
  total: number;
  /** lo que habría costado sin caché, para poder decir cuánto ahorró */
  sinCache: number;
}

/** Lo que costó una llamada. `null` si falta cualquiera de las dos mitades.
 *
 * Se exige que el proveedor haya dicho los tokens: `uso.entrada` o
 * `uso.salida`. Con `null` en los dos no hay nada que multiplicar, y devolver
 * 0 sería afirmar que fue gratis.
 */
export function costeDe(uso: UsoProveedor | null, precio: PrecioToken | null): Coste | null {
  if (!uso || !precio) return null;
  if (uso.entrada == null && uso.salida == null) return null;

  const cin = precio.in;
  const cout = precio.out ?? 0;
  // Sin precio de caché declarado no se supone un descuento: se cobra como
  // entrada normal, que es lo conservador —nunca enseña un gasto menor del que
  // pudo ser.
  const ccr = precio.cr ?? cin;
  const ccw = precio.cw ?? cin;

  const entrada = (uso.entrada ?? 0) * cin;
  const salida = (uso.salida ?? 0) * cout;
  const cache = (uso.cacheLeido ?? 0) * ccr;
  const cacheEscrito = (uso.cacheEscrito ?? 0) * ccw;
  const total = entrada + salida + cache + cacheEscrito;
  // sin caché, todo lo que entró habría sido entrada nueva
  const sinCache =
    ((uso.entrada ?? 0) + (uso.cacheLeido ?? 0) + (uso.cacheEscrito ?? 0)) * cin + salida;

  return { entrada, salida, cache, cacheEscrito, total, sinCache };
}

/** Lo que la caché ahorró en dinero. `null` si no hubo caché o no hay precio. */
export function ahorroEnDinero(c: Coste | null): number | null {
  if (!c) return null;
  const dif = c.sinCache - c.total;
  return dif > 0 ? dif : null;
}

/** Un importe, escrito para que no engañe.
 *
 * Los importes de una llamada suelta son diminutos —céntimos de céntimo—, y
 * redondearlos a dos decimales los convierte todos en «0,00 $», que se lee
 * como «esto es gratis». Por eso los pequeños llevan más decimales y los muy
 * pequeños se dicen con un «<».
 */
export function fmtDinero(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return "sin dato";
  if (usd === 0) return "0 $";
  if (usd < 0.0001) return "< 0,0001 $";
  const dec = usd < 0.01 ? 4 : usd < 1 ? 3 : 2;
  return `${usd.toFixed(dec).replace(".", ",")} $`;
}

/** Días desde la instantánea de precios. */
export function diasDesde(fecha: string, ahora: number): number {
  const t = Date.parse(`${fecha}T00:00:00Z`);
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return Math.floor((ahora - t) / 86_400_000);
}

/** ¿Hay que avisar de que los precios son viejos? */
export function preciosViejos(fecha: string, ahora: number): boolean {
  return diasDesde(fecha, ahora) > DIAS_PARA_AVISAR;
}

/** La coletilla que acompaña SIEMPRE a un importe. Sin esto, un número en
 * pantalla parece una factura; con esto, es una estimación con fuente. */
export function pieDePrecios(fecha: string, ahora: number): string {
  const d = diasDesde(fecha, ahora);
  const base = `Precios del catálogo público de LiteLLM, instantánea del ${fecha}`;
  if (!Number.isFinite(d)) return `${base}.`;
  if (d > DIAS_PARA_AVISAR) {
    return `${base} — hace ${d} días. Puede haber cambiado: vuelve a generarla con «npm run precios».`;
  }
  return `${base}. Es una estimación con fuente, no tu factura.`;
}

/** Por qué no hay importe. Se enseña en vez del número, para que se sepa qué
 * falta en vez de pensar que la app no sabe hacerlo. */
export function motivoSinCoste(uso: UsoProveedor | null, precio: PrecioToken | null): string {
  if (!precio && (!uso || (uso.entrada == null && uso.salida == null))) {
    return "sin dato: ni el proveedor dijo los tokens ni este modelo está en el catálogo de precios";
  }
  if (!precio) return "sin dato: este modelo no está en el catálogo de precios";
  return "sin dato: tu proveedor no dijo cuántos tokens gastó";
}

/** El coste de algo que ya se sabe con qué modelo se hizo.
 *
 * Es el punto de unión de las dos mitades: los tokens del proveedor por un
 * lado, el precio fechado por el otro. Devuelve también POR QUÉ no hay importe
 * cuando no lo hay, que es lo que convierte un hueco en una explicación.
 */
export interface CosteConMotivo {
  coste: Coste | null;
  /** rellenado solo cuando `coste` es null */
  motivo: string | null;
  /** la clave del catálogo con la que se calculó, para poder comprobarlo */
  clave: string | null;
}

export function costeDeModelo(
  providerId: string,
  modelId: string,
  uso: UsoProveedor | null,
  tabla: TablaPrecios = PRECIOS
): CosteConMotivo {
  const encontrado = buscarPrecio(providerId, modelId, tabla);
  const coste = costeDe(uso, encontrado?.precio ?? null);
  if (coste) return { coste, motivo: null, clave: encontrado?.clave ?? null };
  return {
    coste: null,
    motivo: motivoSinCoste(uso, encontrado?.precio ?? null),
    clave: encontrado?.clave ?? null,
  };
}

/** Suma de costes, para los totales. `null` si no se pudo calcular ninguno:
 * sumar solo los que se sabían y enseñarlo como total mentiría por defecto. */
export function sumaCostes(costes: readonly (Coste | null)[]): Coste | null {
  const validos = costes.filter((c): c is Coste => c != null);
  if (validos.length === 0) return null;
  return validos.reduce((a, c) => ({
    entrada: a.entrada + c.entrada,
    salida: a.salida + c.salida,
    cache: a.cache + c.cache,
    cacheEscrito: a.cacheEscrito + c.cacheEscrito,
    total: a.total + c.total,
    sinCache: a.sinCache + c.sinCache,
  }));
}

/** ¿El total de arriba cubre TODO lo gastado, o solo una parte?
 *
 * Si de diez modelos solo tres tenían precio, el total es de tres, y decirlo
 * «total» a secas se lee como el gasto entero. Esto devuelve cuántos quedaron
 * fuera para poder escribirlo al lado. */
export function cuantosSinPrecio(costes: readonly (Coste | null)[]): number {
  return costes.filter((c) => c == null).length;
}
