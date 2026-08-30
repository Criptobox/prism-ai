/** Prism AI — El código de traspaso, en un QR.
 *
 * La idea original era «sale un QR o un texto corto». El texto salió primero;
 * esto es el QR. Y trae una limitación que no se puede esconder, porque es
 * física: un QR guarda 2.953 bytes como mucho, y ni un byte más.
 *
 * Medido con datos reales, no a ojo:
 *
 *     solo las claves ................    473 caracteres
 *     claves + ajustes ...............    955
 *     + 1 conversación de 10 mensajes .  2.938   ← ya rozando el límite
 *     + 10 conversaciones ............. 20.626   ← siete veces el límite
 *
 * O sea: el QR sirve para lo que la gente quiere de verdad —no volver a
 * teclear las claves en el portátil— y no sirve para llevarse el historial.
 * Así que en vez de fallar cuando toca, la interfaz lo dice ANTES y ofrece el
 * texto, que no tiene límite. Un QR que a veces funciona y a veces no, sin
 * explicar cuándo, sería peor que no tenerlo.
 */

/** Máximo de un QR en modo binario: versión 40, corrección de errores L. */
export const CAPACIDAD_QR = 2953;

/**
 * A partir de aquí el QR es tan denso que cuesta enfocarlo con el móvil.
 * Por debajo entra a la primera; por encima entra, pero hay que acercarse.
 */
export const LIMITE_COMODO = 1200;

export type EstadoQr = "comodo" | "justo" | "no-cabe";

export function estadoQr(texto: string): EstadoQr {
  const n = texto.length;
  if (n > CAPACIDAD_QR) return "no-cabe";
  return n > LIMITE_COMODO ? "justo" : "comodo";
}

export function cabeEnQr(texto: string): boolean {
  return texto.length > 0 && texto.length <= CAPACIDAD_QR;
}

/**
 * Qué contarle a quien está mirando la pantalla.
 *
 * Cuando no cabe, lo importante no es el número: es que hay una salida a un
 * clic —quitar las conversaciones— y que si las quiere, el texto las lleva.
 */
export function consejoQr(texto: string, conConversaciones: boolean): string | null {
  switch (estadoQr(texto)) {
    case "comodo":
      return null;
    case "justo":
      return "El QR ha salido denso. Si el otro móvil no lo pilla, acércalo o usa el texto.";
    case "no-cabe":
      return conConversaciones
        ? "Con las conversaciones dentro no cabe en un QR: son demasiados datos. " +
          "Quita «Incluir también las conversaciones» y el QR sale al momento — las claves y " +
          "los ajustes son lo que de verdad no quieres volver a teclear. Si quieres llevarte " +
          "también el historial, usa el texto, que no tiene límite."
        : "Son demasiados datos para un QR. Usa el texto, que no tiene límite.";
  }
}

/** Lado del QR en módulos, y si cada módulo está pintado. */
export interface Matriz {
  lado: number;
  oscuro: (fila: number, col: number) => boolean;
}

/**
 * Dibuja la matriz como SVG.
 *
 * Fondo blanco y módulos negros SIEMPRE, en tema claro y en oscuro. Un QR
 * pintado en gris sobre gris no lo lee ninguna cámara, y el borde blanco
 * («zona tranquila») no es decorativo: sin él, el lector no encuentra dónde
 * empieza el código.
 */
export function matrizASvg(m: Matriz, margen = 4): string {
  const total = m.lado + margen * 2;
  const partes: string[] = [];
  for (let f = 0; f < m.lado; f++) {
    for (let c = 0; c < m.lado; c++) {
      if (m.oscuro(f, c)) partes.push(`M${c + margen} ${f + margen}h1v1h-1z`);
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" ` +
    // Medidas de verdad, no «100%»: un SVG sin tamaño propio se rasteriza al
    // que el navegador quiera (300x150 por defecto) y el QR sale deformado y
    // sin leer. Para que se vea grande, lo estira el CSS del contenedor.
    `shape-rendering="crispEdges" width="${total}" height="${total}">` +
    `<rect width="${total}" height="${total}" fill="#ffffff"/>` +
    `<path fill="#000000" d="${partes.join("")}"/>` +
    `</svg>`
  );
}

/* ------------------------------------------------------------------ */
/* la versión 23, esquivada a propósito                               */
/* ------------------------------------------------------------------ */

/**
 * Un QR de versión V tiene 4·V+17 módulos de lado. De aquí se saca la versión.
 */
export function versionDeModulos(modulos: number): number {
  return (modulos - 17) / 4;
}

/**
 * La versión 23 no se usa, aunque toque.
 *
 * Con datos idénticos, un lector de referencia lee las versiones 20, 21, 22,
 * 24, 25 y 26 y NO lee la 23. Probado forzando cada versión con el mismo
 * texto, así que no es cuestión de tamaño ni de densidad: es algo de esa
 * versión concreta.
 *
 * No se puede saber, con dos librerías, cuál de las dos falla. Y ahí está el
 * motivo de esquivarla: si el fallo está en quien la genera, un móvil de
 * verdad tampoco la leería, y el QR quedaría roto justo en el tamaño más
 * probable —el de las claves y los ajustes—. Subir a la 24 cuesta cuatro
 * módulos y quita un riesgo que no puedo descartar. Sale barato.
 */
export const VERSION_EVITADA = 23;

/** La que se usa en su lugar. Cuatro módulos más y ningún inconveniente. */
export const VERSION_ALTERNATIVA = 24;

/**
 * Versión que se le pide al codificador: 0 = que elija él.
 *
 * El tipo es estrecho a propósito. El codificador solo acepta versiones
 * concretas (0..40 como literales), y devolver `number` compilaba aquí y
 * reventaba en su firma: lo cazó la comprobación de tipos de la build.
 */
export function versionSegura(modulosAuto: number): 0 | typeof VERSION_ALTERNATIVA {
  return versionDeModulos(modulosAuto) === VERSION_EVITADA ? VERSION_ALTERNATIVA : 0;
}
