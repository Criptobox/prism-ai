/** Prism AI — Las decisiones del failover, probadas sin navegador.
 *
 * Vivían dentro del `useCallback` de `runGeneration`, enredadas con React y
 * los toasts, así que la única forma de probarlas era abrir Chromium: cada
 * arreglo costaba tres minutos de Playwright para comprobar algo que es una
 * función pura. Aquí cuestan milisegundos.
 */
import { describe, it, expect } from "vitest";
import {
  decidirTrasError,
  decidirTrasCuotaEnTexto,
  decidirTrasVacio,
  siguienteIndice,
  esPasajero,
  motivoDelFallo,
  tituloFailover,
  tituloSinAlternativa,
  type EstadoIntento,
} from "../../src/lib/prism/decisiones";

const CADENA = [
  { providerId: "groq", modelId: "a" },
  { providerId: "groq", modelId: "b" },
  { providerId: "gemini", modelId: "c" },
];

const base = (over: Partial<EstadoIntento> = {}): EstadoIntento => ({
  status: 500,
  mensajeCuota: false,
  auto: true,
  depth: 0,
  maxSaltos: 4,
  indice: 0,
  cadena: CADENA,
  parcial: "",
  rescatable: false,
  ...over,
});

describe("esPasajero", () => {
  it("sin respuesta, timeout y 5xx sí", () => {
    expect(esPasajero(0)).toBe(true);
    expect(esPasajero(408)).toBe(true);
    expect(esPasajero(503)).toBe(true);
  });
  it("un 400 o un 404 no: ahí el problema es la petición, no el momento", () => {
    expect(esPasajero(400)).toBe(false);
    expect(esPasajero(404)).toBe(false);
    expect(esPasajero(401)).toBe(false);
  });
});

describe("siguienteIndice", () => {
  it("un fallo normal pasa al siguiente de la lista", () => {
    expect(siguienteIndice({ status: 500, mensajeCuota: false, indice: 0, cadena: CADENA })).toBe(1);
  });

  it("un fallo de cuota SALTA de proveedor: dar tumbos entre los modelos de uno que ya dijo que no queda es gastar intentos", () => {
    expect(siguienteIndice({ status: 402, mensajeCuota: false, indice: 0, cadena: CADENA })).toBe(2);
    expect(siguienteIndice({ status: 429, mensajeCuota: false, indice: 0, cadena: CADENA })).toBe(2);
    expect(siguienteIndice({ status: 200, mensajeCuota: true, indice: 0, cadena: CADENA })).toBe(2);
  });

  it("al final de la cadena no hay siguiente", () => {
    expect(siguienteIndice({ status: 500, mensajeCuota: false, indice: 2, cadena: CADENA })).toBe(-1);
  });
});

describe("decidirTrasError", () => {
  it("Auto avanza ante cualquier fallo: para eso se eligió", () => {
    expect(decidirTrasError(base({ status: 400 }))).toEqual({ tipo: "siguiente", indice: 1 });
  });

  it("un modelo manual solo avanza en fallos pasajeros", () => {
    const manual = base({ auto: false });
    expect(decidirTrasError({ ...manual, status: 503 })).toEqual({ tipo: "siguiente", indice: 1 });
    // un 400 con modelo manual no se esconde probando otro
    expect(decidirTrasError({ ...manual, status: 400 })).toEqual({ tipo: "parar" });
  });

  it("agotada la cadena y sin cuota, se busca otro proveedor", () => {
    expect(decidirTrasError(base({ indice: 2, status: 402 }))).toEqual({ tipo: "failover" });
  });

  it("un trabajo a medias merece el salto aunque el fallo no sea de cuota", () => {
    expect(
      decidirTrasError(base({ indice: 2, status: 0, parcial: "media web", rescatable: true }))
    ).toEqual({ tipo: "failover" });
  });

  it("sin nada que rescatar y sin cuota, se para y se enseña el error", () => {
    expect(decidirTrasError(base({ indice: 2, status: 400 }))).toEqual({ tipo: "parar" });
  });

  it("el tope de saltos se respeta: no se encadena para siempre", () => {
    expect(
      decidirTrasError(base({ indice: 2, status: 402, depth: 4, maxSaltos: 4 }))
    ).toEqual({ tipo: "parar" });
  });

  it("pero mientras quede tope, el segundo salto SÍ se permite", () => {
    // el fallo original: `depth === 0` cerraba la puerta al segundo salto
    expect(decidirTrasError(base({ indice: 2, status: 402, depth: 1 }))).toEqual({
      tipo: "failover",
    });
  });
});

describe("decidirTrasCuotaEnTexto", () => {
  it("salta al siguiente proveedor, no al siguiente modelo del mismo", () => {
    expect(decidirTrasCuotaEnTexto(base({ indice: 0 }))).toEqual({ tipo: "siguiente", indice: 2 });
  });
  it("y si no queda proveedor, busca fuera", () => {
    expect(decidirTrasCuotaEnTexto(base({ indice: 2 }))).toEqual({ tipo: "failover" });
  });
});

describe("decidirTrasVacio", () => {
  it("una respuesta vacía avanza al siguiente de la cadena", () => {
    expect(decidirTrasVacio(base({ indice: 0 }))).toEqual({ tipo: "siguiente", indice: 1 });
  });
  it("y al final de la cadena, busca otro proveedor", () => {
    expect(decidirTrasVacio(base({ indice: 2 }))).toEqual({ tipo: "failover" });
  });
  it("con el tope agotado, para", () => {
    expect(decidirTrasVacio(base({ indice: 2, depth: 4, maxSaltos: 4 }))).toEqual({ tipo: "parar" });
  });
});

/** El caso reportado: eliges Gemini a mano, contesta 503 «high demand», la
 *  cadena es de un solo modelo, y ahí se quedaba el error en pantalla. Tener
 *  otros proveedores conectados y no usarlos cuando el tuyo está caído es
 *  justo lo que el failover existe para evitar. */
describe("un fallo pasajero sin cadena salta de proveedor, no se para", () => {
  const base: EstadoIntento = {
    status: 503,
    mensajeCuota: false,
    auto: false,
    depth: 0,
    maxSaltos: 4,
    indice: 0,
    cadena: [{ providerId: "gemini", modelId: "gemini-3.7-flash" }],
    parcial: "",
    rescatable: false,
  };

  it("un 503 con la cadena agotada va a failover", () => {
    expect(decidirTrasError(base).tipo).toBe("failover");
  });

  it("una petición caída (status 0) también", () => {
    expect(decidirTrasError({ ...base, status: 0 }).tipo).toBe("failover");
  });

  it("pero un 400 o un 404 NO: ahí el problema es la petición, no el momento", () => {
    expect(decidirTrasError({ ...base, status: 400 }).tipo).toBe("parar");
    expect(decidirTrasError({ ...base, status: 404 }).tipo).toBe("parar");
  });

  it("y el tope de saltos sigue mandando", () => {
    expect(decidirTrasError({ ...base, depth: 4 }).tipo).toBe("parar");
  });
});

/** «Cuota gratis agotada» se decía en TODOS los avisos del failover, también
 *  con un 503 y con una clave de pago. A quien tiene Gemini Pro eso le manda a
 *  mirar su facturación por un problema que está en el proveedor. */
describe("el aviso del failover dice la causa real", () => {
  it("un 503 es «no responde», no «cuota»", () => {
    expect(motivoDelFallo(503, false)).toBe("caido");
    expect(tituloFailover("caido", "Google Gemini")).toBe("Google Gemini no está respondiendo");
    expect(tituloSinAlternativa("caido", "Google Gemini")).not.toMatch(/cuota/i);
  });

  it("un 402 o un 429 sí son cuota", () => {
    expect(motivoDelFallo(402, false)).toBe("cuota");
    expect(motivoDelFallo(429, false)).toBe("cuota");
    expect(tituloFailover("cuota", "OpenRouter")).toMatch(/cuota/i);
  });

  it("el aviso de cuota escrito en el cuerpo también cuenta", () => {
    expect(motivoDelFallo(200, true)).toBe("cuota");
  });

  it("un 400 no es ni cuota ni caída", () => {
    expect(motivoDelFallo(400, false)).toBe("otro");
    expect(tituloFailover("otro", "X")).not.toMatch(/cuota/i);
  });
});
