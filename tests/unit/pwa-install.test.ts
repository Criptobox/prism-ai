/** Lo reportado: el botón se quedaba en «instalando» y no llegaba a instalar.
 *
 * Dos causas, las dos aquí fijadas: la invitación del navegador es de un solo
 * uso y reutilizarla lanza `InvalidStateError` —que dejaba el botón desactivado
 * para siempre—, y el evento llega antes de que React monte, así que había que
 * capturarlo fuera del componente o el botón no aparecía.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  _reiniciarParaTests,
  iniciarInstalacion,
  instalar,
  instruccionesManuales,
  leerEstado,
  suscribirse,
  enModoApp,
} from "../../src/lib/prism/pwa-install";

type Oyente = (e: unknown) => void;

/** Navegador de mentira con lo justo que toca el módulo. */
function fingirNavegador({ standalone = false, displayMode = "browser" } = {}) {
  const oyentes = new Map<string, Oyente[]>();
  const win = {
    addEventListener: (tipo: string, fn: Oyente) => {
      oyentes.set(tipo, [...(oyentes.get(tipo) ?? []), fn]);
    },
    matchMedia: (q: string) => ({ matches: q.includes(displayMode) }),
    navigator: { standalone, userAgent: "test" },
  };
  vi.stubGlobal("window", win);
  return {
    emitir(tipo: string, evento: unknown) {
      for (const fn of oyentes.get(tipo) ?? []) fn(evento);
    },
  };
}

/** La invitación del navegador: `prompt()` solo puede usarse una vez. */
function fingirInvitacion(resultado: "accepted" | "dismissed" = "accepted") {
  let usada = false;
  return {
    preventDefault: vi.fn(),
    prompt: vi.fn(async () => {
      if (usada) throw new DOMException("The prompt() method may only be called once.", "InvalidStateError");
      usada = true;
    }),
    userChoice: Promise.resolve({ outcome: resultado }),
  };
}

beforeEach(() => {
  _reiniciarParaTests();
  vi.unstubAllGlobals();
});

describe("captura del evento", () => {
  it("una invitación que llega antes de que nadie escuche no se pierde", () => {
    const nav = fingirNavegador();
    iniciarInstalacion();
    expect(leerEstado().disponible).toBe(false);

    // el navegador la ofrece mientras React todavía no ha montado nada
    nav.emitir("beforeinstallprompt", fingirInvitacion());

    // quien se suscriba después ya la encuentra puesta
    expect(leerEstado().disponible).toBe(true);
  });

  it("avisa a los suscriptores y frena la barra del navegador", () => {
    const nav = fingirNavegador();
    iniciarInstalacion();
    const avisado = vi.fn();
    suscribirse(avisado);

    const invitacion = fingirInvitacion();
    nav.emitir("beforeinstallprompt", invitacion);

    expect(avisado).toHaveBeenCalledTimes(1);
    expect(invitacion.preventDefault).toHaveBeenCalled();
  });

  it("el estado no cambia de referencia si no cambia nada", () => {
    fingirNavegador();
    iniciarInstalacion();
    expect(leerEstado()).toBe(leerEstado()); // si no, useSyncExternalStore entra en bucle
  });

  it("iniciar dos veces no duplica los oyentes", () => {
    const nav = fingirNavegador();
    iniciarInstalacion();
    iniciarInstalacion();
    const avisado = vi.fn();
    suscribirse(avisado);
    nav.emitir("beforeinstallprompt", fingirInvitacion());
    expect(avisado).toHaveBeenCalledTimes(1);
  });
});

describe("instalar", () => {
  it("sin invitación no hace nada y lo dice", async () => {
    fingirNavegador();
    iniciarInstalacion();
    expect(await instalar()).toBe("unavailable");
  });

  it("devuelve lo que eligió el usuario", async () => {
    const nav = fingirNavegador();
    iniciarInstalacion();
    nav.emitir("beforeinstallprompt", fingirInvitacion("accepted"));
    expect(await instalar()).toBe("accepted");
  });

  it("la invitación se gasta al usarla, aunque se cancele", async () => {
    const nav = fingirNavegador();
    iniciarInstalacion();
    nav.emitir("beforeinstallprompt", fingirInvitacion("dismissed"));

    expect(await instalar()).toBe("dismissed");
    expect(leerEstado().disponible).toBe(false);
    // el segundo intento NO reutiliza la misma invitación: eso era lo que
    // lanzaba InvalidStateError y dejaba el botón colgado
    expect(await instalar()).toBe("unavailable");
  });

  it("si el navegador falla, se entera quien llama en vez de romper", async () => {
    const nav = fingirNavegador();
    iniciarInstalacion();
    const rota = {
      preventDefault: vi.fn(),
      prompt: vi.fn(async () => {
        throw new DOMException("no", "InvalidStateError");
      }),
      userChoice: Promise.resolve({ outcome: "accepted" as const }),
    };
    nav.emitir("beforeinstallprompt", rota);
    await expect(instalar()).resolves.toBe("error");
  });
});

describe("ya instalada", () => {
  it("appinstalled deja el estado como instalada y sin invitación", () => {
    const nav = fingirNavegador();
    iniciarInstalacion();
    nav.emitir("beforeinstallprompt", fingirInvitacion());
    nav.emitir("appinstalled", {});
    expect(leerEstado()).toEqual({ disponible: false, instalada: true });
  });

  it("abrir ya en modo app se detecta al iniciar", () => {
    fingirNavegador({ displayMode: "standalone" });
    iniciarInstalacion();
    expect(leerEstado().instalada).toBe(true);
  });

  it("iOS se detecta por navigator.standalone", () => {
    fingirNavegador({ standalone: true });
    expect(enModoApp()).toBe(true);
  });
});

describe("instruccionesManuales", () => {
  it("iPhone manda a Compartir en Safari", () => {
    expect(instruccionesManuales("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")).toContain(
      "Añadir a pantalla de inicio"
    );
  });
  it("Android nombra el menú de Chrome", () => {
    expect(instruccionesManuales("Mozilla/5.0 (Linux; Android 14) Chrome/120")).toContain(
      "Instalar aplicación"
    );
  });
  it("Firefox tiene su propia ruta", () => {
    expect(instruccionesManuales("Mozilla/5.0 Firefox/121.0")).toContain("Firefox");
  });
  it("cualquier otro recibe algo útil igualmente", () => {
    expect(instruccionesManuales("navegador raro").length).toBeGreaterThan(20);
  });
});
