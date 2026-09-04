/** Prism AI — Qué contexto viajó de verdad con tu mensaje.
 *
 * Cada turno se manda mucho más que lo que escribes: el mapa del proyecto, tus
 * notas, las reglas «no tocar», las skills activas, las reglas aprendidas de
 * fallos anteriores, los adjuntos y N mensajes de historial. **Nada de eso se
 * ve.** El usuario escribe una línea, recibe una respuesta rara, y no tiene
 * forma de saber que el modelo estaba leyendo doce archivos y tres decisiones
 * viejas.
 *
 * Esto lo hace visible. Es la idea «Auto Context» de `PLAN-EVOLUCION.md` §12,
 * en la parte que se puede hacer sin inventar: **enseñar lo que se usó**, no
 * adivinar lo que haría falta.
 *
 * ——— La regla de esta casa ———
 *
 * Se cuenta lo que ENTRÓ en el prompt, no lo que hay guardado. El mapa puede
 * tener cuarenta archivos y viajar doce; decir «40» sería mentir con la
 * verdad. Por eso el resumen se calcula en el mismo sitio donde se construyen
 * las piezas (`prompt-actual.ts`) y no por su cuenta: un contador que se lo
 * imagina se desincroniza a la primera pieza nueva. Es la misma lección que
 * está escrita en `presupuesto.ts`.
 */

/** Lo que viajó, contado. */
export interface ContextoUsado {
  /** archivos del mapa que entraron en el prompt (nombres, no cuántos hay) */
  archivos: string[];
  /** notas de memoria que entraron */
  notas: number;
  /** reglas «no tocar» activas */
  reglas: number;
  /** skills encendidas cuyo texto viajó */
  skills: string[];
  /** reglas aprendidas de fallos anteriores */
  fallos: number;
  /** mensajes del historial que se enviaron (sin contar el tuyo) */
  mensajes: number;
  /** documentos adjuntos que viajaron como texto */
  documentos: number;
  /** imágenes adjuntas */
  imagenes: number;
  /** caracteres del prompt de sistema, ya montado */
  chars: number;
}

export const CONTEXTO_VACIO: ContextoUsado = {
  archivos: [],
  notas: 0,
  reglas: 0,
  skills: [],
  fallos: 0,
  mensajes: 0,
  documentos: 0,
  imagenes: 0,
  chars: 0,
};

/** ¿Hay algo que merezca enseñarse?
 *
 * Los caracteres solos no cuentan: el prompt de sistema base viaja siempre y
 * enseñar «0 archivos · 0 notas» en cada respuesta es ruido que la gente
 * aprende a ignorar en dos días, y entonces tampoco lo mira cuando sí hay algo.
 */
export function hayContexto(c: ContextoUsado): boolean {
  return (
    c.archivos.length > 0 ||
    c.notas > 0 ||
    c.reglas > 0 ||
    c.skills.length > 0 ||
    c.fallos > 0 ||
    c.documentos > 0 ||
    c.imagenes > 0
  );
}

interface Parte {
  n: number;
  uno: string;
  varios: string;
}

/** Las partes en el orden en que se enseñan: de lo más concreto del proyecto
 * a lo más general. Lo que vale cero no se escribe. */
function partes(c: ContextoUsado): Parte[] {
  return [
    { n: c.archivos.length, uno: "archivo", varios: "archivos" },
    { n: c.notas, uno: "nota", varios: "notas" },
    { n: c.reglas, uno: "regla", varios: "reglas" },
    { n: c.skills.length, uno: "skill", varios: "skills" },
    { n: c.fallos, uno: "fallo aprendido", varios: "fallos aprendidos" },
    { n: c.documentos, uno: "documento", varios: "documentos" },
    { n: c.imagenes, uno: "imagen", varios: "imágenes" },
    { n: c.mensajes, uno: "mensaje", varios: "mensajes" },
  ];
}

/** La línea de una sola frase: «4 archivos · 3 notas · 8 mensajes». */
export function lineaContexto(c: ContextoUsado): string {
  const trozos = partes(c)
    .filter((p) => p.n > 0)
    .map((p) => `${p.n} ${p.n === 1 ? p.uno : p.varios}`);
  return trozos.join(" · ");
}

/** El desglose largo, para el panel que se abre.
 *
 * Los archivos y las skills se nombran: saber que viajaron «4 archivos» sirve
 * de poco si no sabes cuáles, y es justo lo que hace falta para entender por
 * qué el modelo contestó lo que contestó.
 */
export function detalleContexto(c: ContextoUsado): string[] {
  const out: string[] = [];
  if (c.archivos.length) out.push(`Archivos del mapa: ${c.archivos.join(", ")}`);
  if (c.skills.length) out.push(`Skills activas: ${c.skills.join(", ")}`);
  if (c.notas) out.push(`${c.notas} nota(s) de memoria del proyecto`);
  if (c.reglas) out.push(`${c.reglas} regla(s) «no tocar»`);
  if (c.fallos) out.push(`${c.fallos} regla(s) aprendida(s) de fallos anteriores`);
  if (c.documentos) out.push(`${c.documentos} documento(s) adjunto(s), como texto`);
  if (c.imagenes) out.push(`${c.imagenes} imagen(es) adjunta(s)`);
  if (c.mensajes) out.push(`${c.mensajes} mensaje(s) anteriores de esta conversación`);
  if (c.chars) out.push(`${c.chars.toLocaleString("es")} caracteres de instrucciones de sistema`);
  return out;
}
