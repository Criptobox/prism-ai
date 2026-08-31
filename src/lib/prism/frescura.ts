/** Prism AI — Cuándo se verificó por última vez lo que enseña el radar.
 *
 * El radar es, en su mayor parte, un catálogo escrito a mano: proveedores con
 * capa gratuita, ofertas del momento, páginas que seguir. Eso no cambia solo,
 * y ahí está el problema que reportó el usuario —«siempre pone lo mismo»—.
 *
 * Se puede arreglar de dos formas y hacen falta las dos. Una es traer datos de
 * verdad (los modelos que tu clave puede usar hoy). La otra es esta: **dejar
 * de presentar una lista congelada como si fuera actual**.
 *
 * Una oferta que dice «Vigente» sin fecha sigue diciéndolo dos años después.
 * Con fecha, el usuario sabe de qué se fía. Es la misma regla de la cuota: si
 * no se puede saber que sigue vigente, no se afirma.
 */

/** A partir de aquí una entrada deja de presentarse como vigente. Un mes es
 * generoso para este mercado: las capas gratuitas cambian por semanas. */
export const DIAS_PARA_CADUCAR = 30;
/** Y a partir de aquí ya es directamente vieja. */
export const DIAS_PARA_VIEJA = 90;

export type Frescura = "reciente" | "por-revisar" | "vieja" | "sin-fecha";

export function frescuraDe(verificadoEl: string | undefined, ahora = Date.now()): Frescura {
  if (!verificadoEl) return "sin-fecha";
  const t = Date.parse(verificadoEl);
  if (Number.isNaN(t)) return "sin-fecha";
  const dias = Math.floor((ahora - t) / 86_400_000);
  if (dias < 0) return "reciente"; // fecha futura: no se castiga, pero tampoco se premia
  if (dias >= DIAS_PARA_VIEJA) return "vieja";
  if (dias >= DIAS_PARA_CADUCAR) return "por-revisar";
  return "reciente";
}

/** Texto para la interfaz. Nunca afirma que algo sigue vigente: dice cuándo se
 *  miró por última vez, que es lo único que se sabe. */
export function textoFrescura(verificadoEl: string | undefined, ahora = Date.now()): string | null {
  const f = frescuraDe(verificadoEl, ahora);
  if (f === "sin-fecha") return "sin fecha de verificación";
  const dias = Math.max(0, Math.floor((ahora - Date.parse(verificadoEl!)) / 86_400_000));
  if (dias === 0) return "verificado hoy";
  if (dias === 1) return "verificado ayer";
  if (dias < 30) return `verificado hace ${dias} días`;
  const meses = Math.round(dias / 30);
  return `sin verificar desde hace ${meses} ${meses === 1 ? "mes" : "meses"}`;
}

/** ¿Hay que avisar de que esto puede haber cambiado? */
export function pideRevision(f: Frescura): boolean {
  return f === "por-revisar" || f === "vieja" || f === "sin-fecha";
}
