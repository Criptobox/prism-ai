/** Prism AI — Pulsar los botones de lo que genera el agente.
 *
 * La revisión de la v3.28.0 solo caza lo que revienta **al cargar**. Pero en
 * una página generada, la mayoría de los fallos viven detrás de un clic: el
 * manejador que llama a una función que no existe, el `getElementById` de un
 * id que se renombró. Si aquel `pintarTodo()` hubiera estado dentro de un
 * `onclick`, la revisión lo habría dado por bueno.
 *
 * Lo delicado aquí NO es pulsar: es qué se puede AFIRMAR después.
 *
 * «Este botón no funciona» es indecidible. Un botón que no hace nada visible
 * puede estar perfecto —un «Cancelar» que cierra algo ya cerrado—. Y no vale
 * mirar si tiene manejador: los listeners puestos con `addEventListener` no se
 * pueden inspeccionar desde JavaScript, así que un botón bien cableado saldría
 * como roto. Acusar en falso es peor que no mirar.
 *
 * Así que solo se reportan dos cosas, las dos comprobables:
 *   · al pulsarlo saltó un error  → roto, y se le devuelve al modelo
 *   · se pulsó y nada cambió      → dato, no veredicto
 */

/** Cuántos se pulsan. Con más, el barrido tarda más que la propia respuesta y
 * el orden empieza a contaminar el resultado. */
export const MAX_BOTONES = 10;

/** Lo que se espera tras cada clic antes de mirar si cambió algo. Un manejador
 * con `setTimeout` o una animación necesita un respiro; más de esto ya es
 * hacer esperar al usuario por si acaso. */
export const ESPERA_CLIC_MS = 250;

export interface ResultadoBoton {
  rotulo: string;
  /** el clic no lanzó ninguna excepción ni error de consola */
  ok: boolean;
  /** error de la excepción o de la consola, tal cual */
  error?: string;
  /** la página cambió de alguna forma tras pulsarlo */
  cambio: boolean;
}

export interface InformeBotones {
  /** false si no se pudo hacer el barrido (no respondió, no había botones) */
  hecho: boolean;
  resultados: ResultadoBoton[];
  /** botones que había en total, aunque solo se pulsaran los primeros */
  total: number;
  motivo?: string;
}

export function botonesRotos(inf: InformeBotones): ResultadoBoton[] {
  return inf.resultados.filter((r) => !r.ok);
}

/** Los que se pulsaron sin error y sin que cambiara nada. NO son un fallo: son
 *  lo que hay que mirar a mano. */
export function botonesSinEfecto(inf: InformeBotones): ResultadoBoton[] {
  return inf.resultados.filter((r) => r.ok && !r.cambio);
}

/** ¿Hay algo que devolverle al modelo? Solo los errores. Un botón sin efecto
 *  observable no se le manda: le haríamos perseguir un fallo que puede no
 *  existir, y eso gasta cuota y empeora la página. */
export function hayBotonesQueCorregir(inf: InformeBotones): boolean {
  return inf.hecho && botonesRotos(inf).length > 0;
}

/** Lo que se le manda al modelo con los botones que reventaron. */
export function promptDeBotones(inf: InformeBotones, entry: string): string {
  const rotos = botonesRotos(inf);
  const lista = rotos
    .map((r) => `- «${r.rotulo}» → ${r.error ?? "lanzó un error al pulsarlo"}`)
    .join("\n");
  return `He pulsado los botones de tu página y ${rotos.length} ${
    rotos.length === 1 ? "ha fallado" : "han fallado"
  }:

${lista}

Arréglalos y vuelve a entregar **${entry} completo** (y los demás archivos que toques). Lo habitual es una función que no existe o un id que no coincide con el HTML. No expliques el error: corrígelo.`;
}

/** Frase para la interfaz. Sin veredictos sobre lo que no se sabe. */
export function resumenBotones(inf: InformeBotones): string {
  if (!inf.hecho) return inf.motivo ?? "No se pudieron probar los botones.";
  const n = inf.resultados.length;
  if (!n) return "La página no tiene botones que pulsar.";
  const rotos = botonesRotos(inf).length;
  const sinEfecto = botonesSinEfecto(inf).length;
  const de = inf.total > n ? ` (de ${inf.total})` : "";
  if (rotos > 0) {
    return `${rotos} de ${n} botones${de} dieron error al pulsarlos.`;
  }
  if (sinEfecto > 0) {
    return `${n} botones${de} pulsados sin errores. ${sinEfecto} no cambiaron nada visible: puede ser correcto, míralo si no lo esperabas.`;
  }
  return `${n} botones${de} pulsados y todos hicieron algo.`;
}

/** Regla para la memoria de fallos. Solo lo verificado pulsando. */
export function reglaDeBotones(inf: InformeBotones): { titulo: string; regla: string } | null {
  const rotos = botonesRotos(inf);
  if (!rotos.length) return null;
  return {
    titulo: `${rotos.length} ${rotos.length === 1 ? "botón falló" : "botones fallaron"} al pulsarlos: ${rotos[0].rotulo} — ${rotos[0].error ?? "error"}`,
    regla:
      "Antes de entregar, comprueba que cada botón llama a una función que existe y que los ids que usa el JavaScript están en el HTML. Un botón que revienta al pulsarlo es el fallo más común de una página generada.",
  };
}
