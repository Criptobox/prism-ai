/** Prism AI — Qué imágenes viajan en cada petición.
 *
 * El fallo: los adjuntos se quedaban pegados a su mensaje y el historial
 * entero se reenvía en cada turno, así que **una imagen mandada una vez
 * viajaba en todas las peticiones siguientes**. Escribías «Hola» sin adjuntar
 * nada y el proveedor contestaba «404: No endpoints found that support image
 * input», porque el modelo de texto que habías elegido recibía la foto de
 * hace veinte mensajes.
 *
 * Y no se puede resolver mirando si el modelo admite imágenes: aquí no hay
 * catálogo de capacidades —OpenRouter tiene cientos de ids y ninguno dice si
 * ve— y suponerlo sería inventar.
 *
 * Regla: **las imágenes viajan solo en el turno en el que las mandas.** En los
 * mensajes anteriores se quedan como una nota de texto, para que el modelo
 * sepa que hubo una imagen sin tener que recibirla otra vez. De paso deja de
 * reenviarse un base64 por turno, que era la otra factura silenciosa.
 */
import type { Attachment } from "./types";

/** Lo mínimo que necesita esta decisión de un mensaje del historial. */
export interface MensajeEnviable {
  role: string;
  content: string;
  attachments?: Attachment[];
}

/** La nota que sustituye a una imagen que ya no se reenvía. */
export function notaDeAdjuntos(adjuntos: Attachment[]): string {
  const nombres = adjuntos.map((a) => a.name).filter(Boolean);
  if (!nombres.length) {
    return adjuntos.length === 1
      ? "[imagen adjunta en este mensaje]"
      : `[${adjuntos.length} imágenes adjuntas en este mensaje]`;
  }
  return `[adjuntado en este mensaje: ${nombres.join(", ")}]`;
}

/**
 * Deja las imágenes solo en el ÚLTIMO mensaje del usuario —el turno que se
 * está mandando ahora— y convierte las de los anteriores en una nota.
 *
 * Si el último mensaje del usuario no lleva imagen (el caso del «Hola»), la
 * petición sale **sin ninguna**, que es lo que arregla el 404.
 */
export function soloAdjuntosDelTurno<T extends MensajeEnviable>(historial: T[]): T[] {
  let ultimoUsuario = -1;
  for (let i = historial.length - 1; i >= 0; i--) {
    if (historial[i].role === "user") {
      ultimoUsuario = i;
      break;
    }
  }
  return historial.map((m, i) => {
    if (i === ultimoUsuario || !m.attachments?.length) return m;
    const { attachments, ...resto } = m;
    const nota = notaDeAdjuntos(attachments);
    return {
      ...(resto as T),
      content: m.content ? `${m.content}\n\n${nota}` : nota,
    };
  });
}
