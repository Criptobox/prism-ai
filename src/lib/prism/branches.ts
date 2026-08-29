/** Prism AI — Ramas e hilos de conversación.
 *
 * Hasta ahora, regenerar una respuesta la BORRABA: `truncateAfter` + `delete` y
 * a generar de nuevo. Si la anterior era mejor, no había vuelta atrás. Lo mismo
 * al editar un mensaje propio: se llevaba por delante todo lo que venía después.
 *
 * Aquí eso pasa a ser una bifurcación. Al regenerar, la conversación desde ese
 * punto se guarda como una rama y empieza otra; puedes moverte entre ellas con
 * las flechas y comparar. Nada se pierde.
 *
 * Y los hilos: archivar el tema actual y empezar otro DENTRO de la misma
 * conversación, sin ensuciar el contexto ni llenar la lista de conversaciones.
 *
 * Todo son funciones puras sobre la sesión: se prueban sin React ni store.
 */

import type { ChatMessage, Session } from "./types";

/** Ancla de las ramas que no cuelgan de ningún mensaje (bifurcar el primero). */
export const ROOT_ANCHOR = "__raiz__";

export interface Branch {
  /** la conversación desde el punto de bifurcación, inclusive */
  messages: ChatMessage[];
  createdAt: number;
}

export interface MessageFork {
  branches: Branch[];
  /** índice de la rama que se está viendo */
  active: number;
}

/** id del mensaje del que cuelgan las ramas que empiezan en `index`. */
export function anchorAt(messages: ChatMessage[], index: number): string {
  return index <= 0 ? ROOT_ANCHOR : messages[index - 1].id;
}

/** Cuántas ramas hay en un punto, contando la que se ve ahora. */
export function branchCount(session: Session, anchor: string): number {
  return session.forks?.[anchor]?.branches.length ?? 0;
}

/** Rama activa en un punto (0 si no hay bifurcación). */
export function activeBranch(session: Session, anchor: string): number {
  return session.forks?.[anchor]?.active ?? 0;
}

/**
 * Guarda la conversación desde `fromId` como una rama y la quita del hilo
 * actual, dejándolo listo para generar una alternativa.
 *
 * Devuelve la sesión nueva y el ancla de la bifurcación. Si el mensaje no
 * existe, devuelve la sesión intacta.
 */
export function beginBranch(
  session: Session,
  fromId: string,
  now = Date.now()
): { session: Session; anchor: string | null } {
  const idx = session.messages.findIndex((m) => m.id === fromId);
  if (idx < 0) return { session, anchor: null };

  const anchor = anchorAt(session.messages, idx);
  const cola = session.messages.slice(idx);
  const forks = { ...(session.forks ?? {}) };
  const previo = forks[anchor];

  // La cola actual se guarda como una rama más; la nueva queda vacía y se
  // rellenará con lo que se genere a continuación.
  const branches = previo
    ? previo.branches.map((b, i) => (i === previo.active ? { ...b, messages: cola } : b))
    : [{ messages: cola, createdAt: now }];
  branches.push({ messages: [], createdAt: now });

  forks[anchor] = { branches, active: branches.length - 1 };

  return {
    session: { ...session, messages: session.messages.slice(0, idx), forks, updatedAt: now },
    anchor,
  };
}

/**
 * Cambia a otra rama de un punto de bifurcación: guarda lo que hay ahora en la
 * rama activa y carga la pedida.
 */
export function switchBranch(
  session: Session,
  anchor: string,
  index: number,
  now = Date.now()
): Session {
  const fork = session.forks?.[anchor];
  if (!fork || index < 0 || index >= fork.branches.length || index === fork.active) return session;

  const corte =
    anchor === ROOT_ANCHOR ? 0 : session.messages.findIndex((m) => m.id === anchor) + 1;
  if (anchor !== ROOT_ANCHOR && corte === 0) return session; // el ancla ya no está

  const cabeza = session.messages.slice(0, corte);
  const colaActual = session.messages.slice(corte);

  const branches = fork.branches.map((b, i) =>
    i === fork.active ? { ...b, messages: colaActual } : b
  );

  return {
    ...session,
    messages: [...cabeza, ...branches[index].messages],
    forks: { ...session.forks, [anchor]: { branches, active: index } },
    updatedAt: now,
  };
}

/** Descarta la rama activa de un punto y vuelve a la anterior. */
export function dropBranch(session: Session, anchor: string, now = Date.now()): Session {
  const fork = session.forks?.[anchor];
  if (!fork || fork.branches.length <= 1) return session;

  const corte =
    anchor === ROOT_ANCHOR ? 0 : session.messages.findIndex((m) => m.id === anchor) + 1;
  if (anchor !== ROOT_ANCHOR && corte === 0) return session;

  const restantes = fork.branches.filter((_, i) => i !== fork.active);
  const siguiente = Math.max(0, Math.min(fork.active, restantes.length - 1));
  const forks = { ...session.forks };
  if (restantes.length <= 1) delete forks[anchor];
  else forks[anchor] = { branches: restantes, active: siguiente };

  return {
    ...session,
    messages: [...session.messages.slice(0, corte), ...restantes[siguiente].messages],
    forks,
    updatedAt: now,
  };
}

/** Deja la rama activa como única verdad y borra el resto (confirmar y limpiar). */
export function keepOnlyActive(session: Session, anchor: string, now = Date.now()): Session {
  if (!session.forks?.[anchor]) return session;
  const forks = { ...session.forks };
  delete forks[anchor];
  return { ...session, forks, updatedAt: now };
}

/** Limpia las bifurcaciones cuyo mensaje ancla ya no está en la conversación. */
export function pruneForks(session: Session): Session {
  if (!session.forks) return session;
  const vivos = new Set(session.messages.map((m) => m.id));
  const forks: Record<string, MessageFork> = {};
  for (const [anchor, fork] of Object.entries(session.forks)) {
    if (anchor === ROOT_ANCHOR || vivos.has(anchor)) forks[anchor] = fork;
  }
  return Object.keys(forks).length === Object.keys(session.forks).length
    ? session
    : { ...session, forks };
}

/* ------------------------------------------------------------------ */
/* hilos                                                              */
/* ------------------------------------------------------------------ */

export interface SessionThread {
  id: string;
  name: string;
  messages: ChatMessage[];
  forks?: Record<string, MessageFork>;
  archivedAt: number;
}

/** Nombre por defecto de un hilo, a partir de su primer mensaje del usuario. */
export function threadNameFrom(messages: ChatMessage[], fallback = "Hilo"): string {
  const primero = messages.find((m) => m.role === "user");
  if (!primero?.content.trim()) return fallback;
  return primero.content.slice(0, 40).replace(/\s+/g, " ").trim() || fallback;
}

/**
 * Archiva la conversación actual como hilo y deja la sesión vacía para empezar
 * otro tema. Sin mensajes no hace nada: no tiene sentido archivar la nada.
 */
export function startNewThread(session: Session, id: string, now = Date.now()): Session {
  if (!session.messages.length) return session;
  const hilo: SessionThread = {
    id,
    name: session.threadName?.trim() || threadNameFrom(session.messages),
    messages: session.messages,
    forks: session.forks,
    archivedAt: now,
  };
  return {
    ...session,
    messages: [],
    forks: undefined,
    threadName: undefined,
    threads: [...(session.threads ?? []), hilo],
    updatedAt: now,
  };
}

/** Vuelve a un hilo archivado, guardando antes el actual si tiene contenido. */
export function switchThread(
  session: Session,
  threadId: string,
  newId: string,
  now = Date.now()
): Session {
  const hilos = session.threads ?? [];
  const destino = hilos.find((t) => t.id === threadId);
  if (!destino) return session;

  const resto = hilos.filter((t) => t.id !== threadId);
  const actual: SessionThread[] = session.messages.length
    ? [
        {
          id: newId,
          name: session.threadName?.trim() || threadNameFrom(session.messages),
          messages: session.messages,
          forks: session.forks,
          archivedAt: now,
        },
      ]
    : [];

  return {
    ...session,
    messages: destino.messages,
    forks: destino.forks,
    threadName: destino.name,
    threads: [...resto, ...actual].sort((a, b) => a.archivedAt - b.archivedAt),
    updatedAt: now,
  };
}

/** Borra un hilo archivado. */
export function removeThread(session: Session, threadId: string, now = Date.now()): Session {
  const hilos = session.threads ?? [];
  if (!hilos.some((t) => t.id === threadId)) return session;
  return {
    ...session,
    threads: hilos.filter((t) => t.id !== threadId),
    updatedAt: now,
  };
}

/** Renombra un hilo archivado, o el actual si `threadId` es null. */
export function renameThread(
  session: Session,
  threadId: string | null,
  name: string,
  now = Date.now()
): Session {
  const limpio = name.trim();
  if (!limpio) return session;
  if (threadId === null) return { ...session, threadName: limpio, updatedAt: now };
  return {
    ...session,
    threads: (session.threads ?? []).map((t) => (t.id === threadId ? { ...t, name: limpio } : t)),
    updatedAt: now,
  };
}
