/** Prism AI — Lo que se ve de una conversación en la lista lateral.
 *
 * La lista mostraba solo el título. Con tres conversaciones que empiezan por
 * «Hola» no hay forma de saber cuál es cuál sin abrirlas una por una, ni de
 * distinguir la de hace diez minutos de la del mes pasado.
 *
 * Funciones puras: se prueban sin React y sin reloj real.
 */

import type { Session } from "./types";
import { threadNameFrom } from "./branches";

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

/**
 * Antigüedad en palabras, corta porque va en un hueco de cuatro caracteres.
 * A partir de una semana se prefiere la fecha: «hace 23 días» no dice nada,
 * «14 mar» sí.
 */
export function tiempoRelativo(ts: number, ahora = Date.now()): string {
  const delta = ahora - ts;
  if (delta < 0) return "ahora"; // reloj del dispositivo movido hacia atrás
  if (delta < MINUTO) return "ahora";
  if (delta < HORA) return `${Math.floor(delta / MINUTO)} min`;
  if (delta < DIA) return `${Math.floor(delta / HORA)} h`;
  if (delta < 7 * DIA) return `${Math.floor(delta / DIA)} d`;

  const fecha = new Date(ts);
  const mismoAno = fecha.getFullYear() === new Date(ahora).getFullYear();
  return fecha.toLocaleDateString("es", {
    day: "numeric",
    month: "short",
    ...(mismoAno ? {} : { year: "2-digit" }),
  });
}

const MAX_VISTA = 90;

/**
 * Una línea de lo último que se dijo. Se prefiere la respuesta del modelo
 * cuando la hay: el mensaje propio ya suele ser el título.
 */
export function vistaPrevia(session: Session): string {
  const fuente = session.messages.length
    ? session.messages
    : (session.threads ?? []).at(-1)?.messages ?? [];

  const ultimo = [...fuente].reverse().find((m) => m.role !== "system" && m.content.trim());
  if (!ultimo) return "";

  const limpio = ultimo.content
    .replace(/```[\s\S]*?```/g, " [código] ") // un bloque entero no cabe ni aporta
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " [imagen] ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#*_>`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!limpio) return "";
  const prefijo = ultimo.role === "assistant" ? "" : "Tú: ";
  const texto = prefijo + limpio;
  return texto.length > MAX_VISTA ? texto.slice(0, MAX_VISTA).trimEnd() + "…" : texto;
}

/** Título a mostrar, con respaldo para las conversaciones sin nombre propio. */
export function tituloVisible(session: Session): string {
  const t = session.title?.trim();
  if (t && t !== "Nueva conversación") return t;
  return session.messages.length ? threadNameFrom(session.messages, t || "Sin título") : t || "Nueva conversación";
}
