/** Prism AI — Modos de agente: reglas cortas que se suman al prompt de sistema.
 *
 * La idea viene de leer cómo están escritos los prompts de los agentes serios,
 * no de copiarlos: son propietarios y además están hechos para sus propias
 * herramientas, así que pegarlos aquí le contaría al modelo herramientas que
 * en Prism no existen. Lo que sí se puede tomar es la ESTRUCTURA, que no es de
 * nadie:
 *
 *   · decir qué NO hacer, no solo qué hacer
 *   · condiciones de parada explícitas
 *   · un formato fijo de salida en vez de dejar improvisar
 *   · permiso expreso para decir «no lo sé»
 *
 * Y una restricción que aquí manda sobre todo lo demás: Prism apunta a modelos
 * GRATUITOS, de ventana corta y peor obediencia. Un prompt de 10.000 tokens se
 * come el contexto que hace falta para tu código. Por eso cada modo cabe en
 * unos pocos cientos de caracteres y hay un test que lo vigila: si un modo
 * engorda, deja de ser útil justo en los modelos para los que se escribió.
 *
 * Se combinan entre sí y se suman al prompt de sistema y al estilo de salida.
 */

export interface ModoAgente {
  id: string;
  /** nombre en la interfaz */
  nombre: string;
  /** una línea: qué te da y qué te cuesta */
  resumen: string;
  /** el texto que viaja al modelo */
  texto: string;
}

/** Tope por modo. Un modo que no cabe aquí es un modo mal escrito. */
export const LIMITE_MODO = 700;

/** Tope del bloque entero, con todos los modos activos a la vez. */
export const LIMITE_BLOQUE = 2200;

export const MODOS_AGENTE: ModoAgente[] = [
  {
    id: "sin-inventar",
    nombre: "Sin inventar",
    resumen: "Prefiere decir «no lo sé» antes que rellenar el hueco.",
    texto: [
      "[Modo: sin inventar]",
      "Si no tienes el dato, dilo con esas palabras: «no lo sé» o «no me lo has dado».",
      "No te inventes nombres de funciones, rutas de archivo, opciones de configuración,",
      "versiones ni citas. Si necesitas algo que no está en la conversación, pídelo en una",
      "línea y para ahí.",
      "Cuando algo sea una suposición tuya, escríbelo delante: «supongo que…».",
      "Vale más una respuesta corta y verdadera que una completa y a medias inventada.",
    ].join("\n"),
  },
  {
    id: "cambio-minimo",
    nombre: "Cambio mínimo",
    resumen: "Toca lo justo. No reordena ni reescribe lo que no le pediste.",
    texto: [
      "[Modo: cambio mínimo]",
      "Haz el cambio más pequeño que resuelva lo pedido y nada más.",
      "NO renombres cosas, NO reordenes el código, NO cambies el estilo, NO añadas",
      "dependencias ni «de paso» arregles otra cosa. Si ves otro problema, nómbralo al",
      "final en una línea y deja que se decida aparte.",
      "Conserva el estilo del archivo que tocas: sus comillas, su indentación y su idioma",
      "en los comentarios.",
      "Termina diciendo qué archivos tocaste y por qué, en una línea cada uno.",
    ].join("\n"),
  },
  {
    id: "archivos-completos",
    nombre: "Archivos completos",
    resumen: "Nada de «…resto igual»: el archivo entero, listo para pegar.",
    texto: [
      "[Modo: archivos completos]",
      "Cuando entregues código de un archivo, entrégalo ENTERO y listo para guardar.",
      "Prohibido escribir «…», «resto igual», «// el resto no cambia» o recortes",
      "parecidos: quien lo pegue se queda con un archivo roto.",
      "Cada bloque de código empieza con la ruta del archivo en la primera línea del",
      "cercado, así: ```ts src/lib/ejemplo.ts",
      "Un bloque por archivo. Si son varios, uno detrás de otro.",
      "Si un archivo es demasiado largo para entregarlo entero, dilo y propón partirlo,",
      "en vez de entregar la mitad.",
    ].join("\n"),
  },
  {
    id: "con-freno",
    nombre: "Con freno",
    resumen: "Comprueba y para. Evita el bucle de «ya casi está».",
    texto: [
      "[Modo: con freno]",
      "Antes de trabajar, di en dos líneas qué vas a hacer y cómo sabrás que está bien.",
      "Cuando eso se cumpla, PARA y entrega. No sigas puliendo por tu cuenta.",
      "Si tras dos intentos sigue sin salir, deja de intentarlo: explica qué falla, qué",
      "descartaste y qué necesitas para seguir. No repitas el mismo intento esperando",
      "otro resultado.",
      "No anuncies lo que vas a hacer y luego lo hagas en el mismo mensaje: hazlo.",
    ].join("\n"),
  },
];

/** Un modo por id, o undefined. */
export function modoPorId(id: string): ModoAgente | undefined {
  return MODOS_AGENTE.find((m) => m.id === id);
}

/**
 * El bloque que se añade al prompt de sistema.
 *
 * Respeta el orden del catálogo y no el de selección, para que dos usuarios con
 * los mismos modos manden exactamente el mismo texto: si el orden bailara, dos
 * pruebas de la Arena no serían comparables.
 */
export function textoDeModos(ids: readonly string[]): string {
  if (!ids.length) return "";
  const elegidos = MODOS_AGENTE.filter((m) => ids.includes(m.id));
  if (!elegidos.length) return "";
  return elegidos.map((m) => m.texto).join("\n\n");
}

/** Cuánto ocupa lo que se va a mandar, para poder enseñarlo en la interfaz. */
export function costeDeModos(ids: readonly string[]): number {
  return textoDeModos(ids).length;
}
