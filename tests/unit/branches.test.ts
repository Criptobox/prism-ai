import { describe, it, expect } from "vitest";
import {
  activeBranch,
  anchorAt,
  beginBranch,
  branchCount,
  dropBranch,
  keepOnlyActive,
  pruneForks,
  removeThread,
  renameThread,
  ROOT_ANCHOR,
  startNewThread,
  switchBranch,
  switchThread,
  threadNameFrom,
} from "../../src/lib/prism/branches";
import type { ChatMessage, Session } from "../../src/lib/prism/types";

let reloj = 1000;
const ahora = () => ++reloj;

function msg(id: string, role: ChatMessage["role"], content = id): ChatMessage {
  return { id, role, content, createdAt: 1 };
}

/** u1 → a1 → u2 → a2 */
function sesion(): Session {
  return {
    id: "s1",
    title: "Conversación",
    createdAt: 1,
    updatedAt: 1,
    messages: [msg("u1", "user"), msg("a1", "assistant"), msg("u2", "user"), msg("a2", "assistant")],
  };
}

const textos = (s: Session) => s.messages.map((m) => m.id);

describe("anchorAt", () => {
  it("el ancla es el mensaje anterior", () => {
    const s = sesion();
    expect(anchorAt(s.messages, 3)).toBe("u2");
    expect(anchorAt(s.messages, 1)).toBe("u1");
  });
  it("bifurcar el primero cuelga de la raíz", () => {
    expect(anchorAt(sesion().messages, 0)).toBe(ROOT_ANCHOR);
  });
});

describe("beginBranch — regenerar ya no borra", () => {
  it("guarda la respuesta anterior en vez de perderla", () => {
    const { session, anchor } = beginBranch(sesion(), "a2", ahora());
    expect(anchor).toBe("u2");
    // la conversación queda lista para generar la alternativa
    expect(textos(session)).toEqual(["u1", "a1", "u2"]);
    // …y la respuesta vieja sigue guardada
    expect(session.forks?.["u2"].branches[0].messages.map((m) => m.id)).toEqual(["a2"]);
    expect(branchCount(session, "u2")).toBe(2);
    expect(activeBranch(session, "u2")).toBe(1);
  });

  it("archiva TODO lo que venía después, no solo el mensaje", () => {
    const { session } = beginBranch(sesion(), "a1", ahora());
    expect(textos(session)).toEqual(["u1"]);
    expect(session.forks?.["u1"].branches[0].messages.map((m) => m.id)).toEqual(["a1", "u2", "a2"]);
  });

  it("editar el primer mensaje cuelga de la raíz", () => {
    const { session, anchor } = beginBranch(sesion(), "u1", ahora());
    expect(anchor).toBe(ROOT_ANCHOR);
    expect(textos(session)).toEqual([]);
    expect(session.forks?.[ROOT_ANCHOR].branches[0].messages).toHaveLength(4);
  });

  it("regenerar dos veces deja tres ramas", () => {
    let s = beginBranch(sesion(), "a2", ahora()).session;
    s = { ...s, messages: [...s.messages, msg("a2b", "assistant")] };
    s = beginBranch(s, "a2b", ahora()).session;
    expect(branchCount(s, "u2")).toBe(3);
    expect(s.forks?.["u2"].branches[0].messages.map((m) => m.id)).toEqual(["a2"]);
    expect(s.forks?.["u2"].branches[1].messages.map((m) => m.id)).toEqual(["a2b"]);
    expect(s.forks?.["u2"].branches[2].messages).toEqual([]);
  });

  it("con un id que no existe no toca nada", () => {
    const original = sesion();
    const { session, anchor } = beginBranch(original, "nope", ahora());
    expect(anchor).toBeNull();
    expect(session).toBe(original);
  });
});

describe("switchBranch — moverse entre versiones", () => {
  /** dos ramas: la original «a2» y una nueva «a2b» */
  function conDosRamas(): Session {
    let s = beginBranch(sesion(), "a2", ahora()).session;
    s = { ...s, messages: [...s.messages, msg("a2b", "assistant")] };
    return s;
  }

  it("vuelve a la respuesta original", () => {
    const s = conDosRamas();
    expect(textos(s)).toEqual(["u1", "a1", "u2", "a2b"]);
    const atras = switchBranch(s, "u2", 0, ahora());
    expect(textos(atras)).toEqual(["u1", "a1", "u2", "a2"]);
    expect(activeBranch(atras, "u2")).toBe(0);
  });

  it("ir y volver conserva las dos versiones", () => {
    const s = conDosRamas();
    const ida = switchBranch(s, "u2", 0, ahora());
    const vuelta = switchBranch(ida, "u2", 1, ahora());
    expect(textos(vuelta)).toEqual(["u1", "a1", "u2", "a2b"]);
    expect(branchCount(vuelta, "u2")).toBe(2);
  });

  it("guarda lo que hubieras seguido escribiendo en la rama activa", () => {
    let s = conDosRamas();
    // se sigue conversando en la rama nueva
    s = { ...s, messages: [...s.messages, msg("u3", "user"), msg("a3", "assistant")] };
    const ida = switchBranch(s, "u2", 0, ahora());
    expect(textos(ida)).toEqual(["u1", "a1", "u2", "a2"]);
    const vuelta = switchBranch(ida, "u2", 1, ahora());
    expect(textos(vuelta)).toEqual(["u1", "a1", "u2", "a2b", "u3", "a3"]);
  });

  it("ignora índices fuera de rango o la rama que ya se ve", () => {
    const s = conDosRamas();
    expect(switchBranch(s, "u2", 9, ahora())).toBe(s);
    expect(switchBranch(s, "u2", -1, ahora())).toBe(s);
    expect(switchBranch(s, "u2", 1, ahora())).toBe(s);
    expect(switchBranch(s, "no-existe", 0, ahora())).toBe(s);
  });

  it("funciona con ramas colgadas de la raíz", () => {
    let s = beginBranch(sesion(), "u1", ahora()).session;
    s = { ...s, messages: [msg("u1b", "user"), msg("a1b", "assistant")] };
    const atras = switchBranch(s, ROOT_ANCHOR, 0, ahora());
    expect(textos(atras)).toEqual(["u1", "a1", "u2", "a2"]);
  });
});

describe("dropBranch — descartar una versión", () => {
  function conDosRamas(): Session {
    let s = beginBranch(sesion(), "a2", ahora()).session;
    s = { ...s, messages: [...s.messages, msg("a2b", "assistant")] };
    return s;
  }

  it("descarta la activa y recupera la otra, quitando la bifurcación", () => {
    const s = dropBranch(conDosRamas(), "u2", ahora());
    expect(textos(s)).toEqual(["u1", "a1", "u2", "a2"]);
    expect(s.forks?.["u2"]).toBeUndefined(); // con una sola versión ya no hay elección
  });

  it("con tres ramas mantiene la bifurcación", () => {
    let s = conDosRamas();
    s = beginBranch(s, "a2b", ahora()).session;
    s = { ...s, messages: [...s.messages, msg("a2c", "assistant")] };
    const tras = dropBranch(s, "u2", ahora());
    expect(branchCount(tras, "u2")).toBe(2);
  });

  it("no hace nada si no hay bifurcación", () => {
    const s = sesion();
    expect(dropBranch(s, "u2", ahora())).toBe(s);
  });
});

describe("keepOnlyActive y pruneForks", () => {
  it("quedarse con la activa borra el resto", () => {
    let s = beginBranch(sesion(), "a2", ahora()).session;
    s = { ...s, messages: [...s.messages, msg("a2b", "assistant")] };
    const limpia = keepOnlyActive(s, "u2", ahora());
    expect(limpia.forks?.["u2"]).toBeUndefined();
    expect(textos(limpia)).toEqual(["u1", "a1", "u2", "a2b"]);
  });

  it("las bifurcaciones huérfanas se limpian", () => {
    let s = beginBranch(sesion(), "a2", ahora()).session;
    // desaparece el mensaje ancla
    s = { ...s, messages: s.messages.filter((m) => m.id !== "u2") };
    const limpia = pruneForks(s);
    expect(limpia.forks?.["u2"]).toBeUndefined();
  });

  it("no toca nada si todas las anclas siguen vivas", () => {
    const s = beginBranch(sesion(), "a2", ahora()).session;
    expect(pruneForks(s)).toBe(s);
  });
});

/* ------------------------------------------------------------------ */
/* hilos                                                              */
/* ------------------------------------------------------------------ */

describe("threadNameFrom", () => {
  it("usa el primer mensaje del usuario", () => {
    expect(threadNameFrom([msg("a", "assistant", "hola"), msg("b", "user", "Arreglar el login")])).toBe(
      "Arreglar el login"
    );
  });
  it("recorta y normaliza los espacios", () => {
    const largo = msg("u", "user", "  palabra ".repeat(20));
    expect(threadNameFrom([largo]).length).toBeLessThanOrEqual(40);
    expect(threadNameFrom([largo])).not.toContain("  ");
  });
  it("sin mensajes del usuario usa el respaldo", () => {
    expect(threadNameFrom([msg("a", "assistant")], "Sin título")).toBe("Sin título");
  });
});

describe("startNewThread", () => {
  it("archiva lo actual y deja la conversación limpia", () => {
    const s = startNewThread(sesion(), "t1", ahora());
    expect(s.messages).toEqual([]);
    expect(s.threads).toHaveLength(1);
    expect(s.threads?.[0].messages.map((m) => m.id)).toEqual(["u1", "a1", "u2", "a2"]);
    expect(s.threads?.[0].name).toBe("u1");
  });

  it("se lleva también las ramas del hilo archivado", () => {
    const conRamas = beginBranch(sesion(), "a2", ahora()).session;
    const s = startNewThread(conRamas, "t1", ahora());
    expect(s.threads?.[0].forks?.["u2"]).toBeDefined();
    expect(s.forks).toBeUndefined();
  });

  it("no archiva una conversación vacía", () => {
    const vacia: Session = { ...sesion(), messages: [] };
    expect(startNewThread(vacia, "t1", ahora())).toBe(vacia);
  });
});

describe("switchThread", () => {
  it("vuelve a un hilo guardando antes el actual", () => {
    let s = startNewThread(sesion(), "t1", ahora());
    s = { ...s, messages: [msg("u9", "user"), msg("a9", "assistant")] };
    const vuelta = switchThread(s, "t1", "t2", ahora());
    expect(textos(vuelta)).toEqual(["u1", "a1", "u2", "a2"]);
    expect(vuelta.threadName).toBe("u1");
    // el tema nuevo quedó archivado, no perdido
    expect(vuelta.threads?.map((t) => t.id)).toContain("t2");
    expect(vuelta.threads?.find((t) => t.id === "t2")?.messages.map((m) => m.id)).toEqual([
      "u9",
      "a9",
    ]);
  });

  it("si el actual está vacío no archiva un hilo en blanco", () => {
    const s = startNewThread(sesion(), "t1", ahora());
    const vuelta = switchThread(s, "t1", "t2", ahora());
    expect(vuelta.threads).toHaveLength(0);
  });

  it("con un hilo que no existe no cambia nada", () => {
    const s = startNewThread(sesion(), "t1", ahora());
    expect(switchThread(s, "nope", "t2", ahora())).toBe(s);
  });
});

describe("removeThread y renameThread", () => {
  it("borra un hilo archivado", () => {
    const s = removeThread(startNewThread(sesion(), "t1", ahora()), "t1", ahora());
    expect(s.threads).toHaveLength(0);
  });

  it("borrar uno que no existe no cambia nada", () => {
    const s = startNewThread(sesion(), "t1", ahora());
    expect(removeThread(s, "nope", ahora())).toBe(s);
  });

  it("renombra un hilo archivado y el actual", () => {
    const s = renameThread(startNewThread(sesion(), "t1", ahora()), "t1", "Login", ahora());
    expect(s.threads?.[0].name).toBe("Login");
    const actual = renameThread(s, null, "Tema nuevo", ahora());
    expect(actual.threadName).toBe("Tema nuevo");
  });

  it("un nombre vacío no se acepta", () => {
    const s = startNewThread(sesion(), "t1", ahora());
    expect(renameThread(s, "t1", "   ", ahora())).toBe(s);
  });
});
