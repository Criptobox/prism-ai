import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  OFERTAS_BASE,
  OFERTAS_VERIFICADO,
  diasRestantes,
  estadoOferta,
  filtrarOfertas,
  fusionarOfertas,
  novedadesOfertas,
  resumenOfertas,
  validarOfertas,
  type Oferta,
} from "../../src/lib/prism/ofertas";
import { sumarDias } from "../../src/lib/prism/repaso";

function oferta(par: Partial<Oferta> = {}): Oferta {
  return {
    id: par.id ?? "of-prueba",
    proveedor: par.proveedor ?? "Proveedor",
    titulo: par.titulo ?? "Plan gratuito con cuotas diarias",
    tipo: par.tipo ?? "gratis",
    valor: par.valor ?? "Gratis",
    descripcion: par.descripcion ?? "Uso limitado sin tarjeta",
    url: par.url ?? "https://proveedor.example/oferta",
    termina: par.termina ?? null,
    verificado: par.verificado ?? "2026-09-06",
  };
}

describe("diasRestantes / estadoOferta", () => {
  const HOY = "2026-03-15";

  it("cuenta días hacia delante y hacia atrás con días enteros", () => {
    expect(diasRestantes("2026-03-15", HOY)).toBe(0);
    expect(diasRestantes("2026-03-20", HOY)).toBe(5);
    expect(diasRestantes("2026-03-12", HOY)).toBe(-3);
  });

  it("sin fecha de fin es oferta permanente: siempre vigente", () => {
    expect(estadoOferta(oferta({ termina: null }), HOY, 3)).toBe("vigente");
  });

  it("por expirar solo cuando falta dentro del margen de aviso", () => {
    expect(estadoOferta(oferta({ termina: "2026-03-25" }), HOY, 3)).toBe("vigente");
    // el límite es inclusivo: faltar exactamente los días de aviso ya avisa
    expect(estadoOferta(oferta({ termina: "2026-03-18" }), HOY, 3)).toBe("porExpirar");
    expect(estadoOferta(oferta({ termina: "2026-03-16" }), HOY, 3)).toBe("porExpirar");
  });

  it("el día mismo del vencimiento aún avisa; el día siguiente caducó", () => {
    expect(estadoOferta(oferta({ termina: HOY }), HOY, 3)).toBe("porExpirar");
    expect(estadoOferta(oferta({ termina: "2026-03-14" }), HOY, 3)).toBe("caducada");
  });
});

describe("novedadesOfertas", () => {
  const HOY = "2026-03-15";
  const A = oferta({ id: "of-a", titulo: "Oferta conocida" });
  const B = oferta({ id: "of-b", titulo: "Oferta recién cazada" });
  const C = oferta({ id: "of-c", titulo: "Casi fuera", termina: "2026-03-17" });
  const CADUCADA = oferta({ id: "of-d", titulo: "Ya se fue", termina: "2026-03-10" });

  it("marca como nuevas solo las que no estaban conocidas", () => {
    const { nuevas } = novedadesOfertas(new Set(["of-a"]), new Set(), [A, B], HOY, 3);
    expect(nuevas.map((o) => o.id)).toEqual(["of-b"]);
  });

  it("las caducadas no se anuncian como nuevas", () => {
    const { nuevas } = novedadesOfertas(new Set(), new Set(), [CADUCADA], HOY, 3);
    expect(nuevas).toEqual([]);
  });

  it("porExpirar entra dentro del margen y no repite si ya avisó", () => {
    const primera = novedadesOfertas(new Set(["of-a"]), new Set(), [A, C], HOY, 3);
    expect(primera.porExpirar.map((o) => o.id)).toEqual(["of-c"]);
    const repetida = novedadesOfertas(new Set(["of-a"]), new Set(["of-c"]), [A, C], HOY, 3);
    expect(repetida.porExpirar).toEqual([]);
  });

  it("el margen de aviso es inclusivo por ambos extremos", () => {
    const limite = novedadesOfertas(new Set(), new Set(), [oferta({ id: "of-e", termina: "2026-03-18" })], HOY, 3);
    expect(limite.porExpirar).toHaveLength(1);
    const fuera = novedadesOfertas(new Set(), new Set(), [oferta({ id: "of-f", termina: "2026-03-19" })], HOY, 3);
    expect(fuera.porExpirar).toHaveLength(0);
  });
});

describe("validarOfertas (fuente externa)", () => {
  it("acepta lo correcto y recorta espacios", () => {
    const r = validarOfertas([
      {
        id: " of-x ",
        proveedor: " Anthropic ",
        titulo: " Crédito de prueba ",
        tipo: "creditos",
        valor: " 5 $ ",
        descripcion: " Al verificar el teléfono ",
        url: " https://console.anthropic.com ",
        termina: null,
        verificado: "2026-09-06",
      },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe("of-x");
    expect(r[0].proveedor).toBe("Anthropic");
    expect(r[0].url).toBe("https://console.anthropic.com");
  });

  it("descarta entradas sin id, título, proveedor o url http(s)", () => {
    const r = validarOfertas([
      { titulo: "sin id", proveedor: "X", tipo: "gratis", valor: "", descripcion: "", url: "https://x.example" },
      { id: "a", titulo: "", proveedor: "X", tipo: "gratis", valor: "", descripcion: "", url: "https://x.example" },
      { id: "b", titulo: "T", proveedor: "", tipo: "gratis", valor: "", descripcion: "", url: "https://x.example" },
      { id: "c", titulo: "T", proveedor: "X", tipo: "gratis", valor: "", descripcion: "", url: "javascript:alert(1)" },
      { id: "d", titulo: "T", proveedor: "X", tipo: "gratis", valor: "", descripcion: "", url: "ftp://x.example" },
    ]);
    expect(r).toEqual([]);
  });

  it("descarta tipos desconocidos: el tipo se muestra en pantalla y no se inventa", () => {
    const r = validarOfertas([
      { id: "a", titulo: "T", proveedor: "X", tipo: "magia", valor: "", descripcion: "", url: "https://x.example" },
    ]);
    expect(r).toEqual([]);
  });

  it("una fecha de fin que no sea YYYY-MM-DD se ignora (queda permanente)", () => {
    const r = validarOfertas([
      { id: "a", titulo: "T", proveedor: "X", tipo: "dias", valor: "7 días", descripcion: "", url: "https://x.example", termina: "mañana" },
    ]);
    expect(r[0].termina).toBeNull();
  });

  it("recorta descripciones kilométricas y deduplica por id (gana la primera)", () => {
    const larga = "m".repeat(600);
    const r = validarOfertas([
      { id: "dup", titulo: "primera", proveedor: "X", tipo: "gratis", valor: "Gratis", descripcion: larga, url: "https://x.example" },
      { id: "dup", titulo: "segunda", proveedor: "Y", tipo: "gratis", valor: "Gratis", descripcion: "corta", url: "https://y.example" },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].titulo).toBe("primera");
    expect(r[0].descripcion.length).toBeLessThanOrEqual(501); // 500 + «…»
    expect(r[0].descripcion.endsWith("…")).toBe(true);
  });

  it("no revienta con basura: no-array, objetos raros o null", () => {
    expect(validarOfertas(null)).toEqual([]);
    expect(validarOfertas("ofertas")).toEqual([]);
    expect(validarOfertas([null, 42, "x", {}])).toEqual([]);
  });
});

describe("fusionarOfertas", () => {
  const base = [
    oferta({ id: "of-1", titulo: "Base uno" }),
    oferta({ id: "of-2", titulo: "Base dos" }),
  ];

  it("la fuente pisa a la base por id conservando la posición", () => {
    const r = fusionarOfertas(base, [oferta({ id: "of-1", titulo: "Pisada", valor: "Mejorada" })]);
    expect(r.map((o) => o.id)).toEqual(["of-1", "of-2"]);
    expect(r[0].titulo).toBe("Pisada");
  });

  it("las ofertas nuevas de la fuente se añaden al final", () => {
    const r = fusionarOfertas(base, [oferta({ id: "of-9", titulo: "Extra" })]);
    expect(r.map((o) => o.id)).toEqual(["of-1", "of-2", "of-9"]);
  });
});

describe("filtrarOfertas / resumenOfertas", () => {
  const HOY = "2026-03-15";
  const lista = [
    oferta({ id: "of-1", proveedor: "Groq", titulo: "API gratuita", tipo: "gratis" }),
    oferta({ id: "of-2", proveedor: "Windsurf", titulo: "7 días de Pro", tipo: "dias", termina: "2026-03-16" }),
    oferta({ id: "of-3", proveedor: "Together", titulo: "Crédito inicial", tipo: "creditos" }),
    oferta({ id: "of-4", proveedor: "Vieja", titulo: "Terminada", tipo: "gratis", termina: "2026-03-01" }),
  ];
  const favoritas = new Set(["of-3"]);

  it("siempre excluye las caducadas", () => {
    const r = filtrarOfertas(lista, { consulta: "", tipo: "todas", favoritas, hoy: HOY, diasAviso: 3 });
    expect(r.map((o) => o.id)).toEqual(["of-1", "of-2", "of-3"]);
  });

  it("busca sin tildes ni mayúsculas en proveedor, título y descripción", () => {
    const r = filtrarOfertas(lista, { consulta: "API GRATUITA", tipo: "todas", favoritas, hoy: HOY, diasAviso: 3 });
    expect(r.map((o) => o.id)).toEqual(["of-1"]);
    const conTilde = filtrarOfertas(lista, { consulta: "credito", tipo: "todas", favoritas, hoy: HOY, diasAviso: 3 });
    expect(conTilde.map((o) => o.id)).toEqual(["of-3"]);
  });

  it("filtra por tipo y por favoritas", () => {
    const porTipo = filtrarOfertas(lista, { consulta: "", tipo: "dias", favoritas, hoy: HOY, diasAviso: 3 });
    expect(porTipo.map((o) => o.id)).toEqual(["of-2"]);
    const porFav = filtrarOfertas(lista, { consulta: "", tipo: "favoritas", favoritas, hoy: HOY, diasAviso: 3 });
    expect(porFav.map((o) => o.id)).toEqual(["of-3"]);
  });

  it("el resumen separa vigentes de por expirar y cuenta favoritas", () => {
    const r = resumenOfertas(lista, HOY, 3, favoritas);
    expect(r).toEqual({ vigentes: 2, porExpirar: 1, favoritas: 1 });
  });
});

describe("catálogo base", () => {
  it("es honesto: ids únicos, https, sin campos vacíos y con fecha de verificación común", () => {
    const ids = new Set(OFERTAS_BASE.map((o) => o.id));
    expect(ids.size).toBe(OFERTAS_BASE.length);
    expect(OFERTAS_BASE.length).toBeGreaterThanOrEqual(10);
    for (const o of OFERTAS_BASE) {
      expect(o.url.startsWith("https://")).toBe(true);
      expect(o.proveedor.length).toBeGreaterThan(0);
      expect(o.titulo.length).toBeGreaterThan(0);
      expect(o.descripcion.length).toBeGreaterThan(0);
      expect(o.valor.length).toBeGreaterThan(0);
      expect(o.verificado).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(o.verificado).toBe(OFERTAS_VERIFICADO);
      if (o.termina) expect(o.termina).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("los tipos del catálogo son solo los cinco previstos", () => {
    const validos = new Set(["gratis", "dias", "descuento", "creditos", "estudiantes"]);
    for (const o of OFERTAS_BASE) expect(validos.has(o.tipo)).toBe(true);
  });
});

describe("propiedad: el estado solo depende de los días que faltan", () => {
  it("cualquier fecha dentro del margen avisa y fuera no", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 365 }), fc.integer({ min: 0, max: 14 }), (faltan, aviso) => {
        const hoy = "2026-03-15";
        const o = oferta({ termina: sumarDias(hoy, faltan) });
        expect(estadoOferta(o, hoy, aviso)).toBe(faltan <= aviso ? "porExpirar" : "vigente");
      })
    );
  });
});
