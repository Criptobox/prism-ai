/** Prism AI — Propiedades del perímetro y de lo que rompió esta semana.
 *
 * Un test de ejemplo comprueba un caso; una propiedad comprueba una REGLA
 * sobre miles de casos generados. La diferencia no es teórica: los tres fallos
 * que aparecieron esta semana —el QA que nunca llegaba al agente, el ZIP con
 * carpeta que no resolvía, el escudo PII que rompía los adjuntos— pasaron por
 * delante de tests de ejemplo verdes. Ninguno de esos tests preguntaba la
 * regla, solo un caso.
 *
 * Aquí se preguntan las reglas.
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  contar,
  limpiar,
  identidadDe,
  VENTANA_MS,
  MAX_POR_VENTANA,
  type Contadores,
} from "../../../src/lib/prism/proxy-budget";
import { TOOL_CATALOG } from "../../../src/lib/prism/tools-catalog";
import {
  EFECTOS,
  filtrarCatalogo,
  toolPermitida,
  efectosDe,
  type PermisosConcedidos,
} from "../../../src/lib/prism/tool-permissions";
import { escudoHistorial } from "../../../src/lib/prism/pii";
import { buildRunHtml, raizComun, resolvePath } from "../../../src/lib/prism/sandbox";
import { diagnosticar, arregloDeUnClic } from "../../../src/lib/prism/faltantes";
import {
  contarLlamada,
  normalizarTope,
  TOPE_MINIMO,
  TOPE_MAXIMO,
  type Contador,
} from "../../../src/lib/prism/gasto";
import { sinVetados, alternarVeto } from "../../../src/lib/prism/vetados";
import type { ProviderId } from "../../../src/lib/prism/types";

/* ------------------------------------------------------------------ */
/* Presupuesto del proxy                                               */
/* ------------------------------------------------------------------ */

describe("proxy-budget", () => {
  it("nunca deja pasar más de `max` en una ventana, sea cual sea el reparto", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }), // max
        fc.array(fc.integer({ min: 0, max: VENTANA_MS - 1 }), { minLength: 1, maxLength: 200 }),
        (max, offsets) => {
          const c: Contadores = new Map();
          const t0 = 1_000_000;
          // todas las llamadas caen DENTRO de la misma ventana
          const pasadas = offsets.filter((d) => contar(c, "ip", t0 + d, max).ok).length;
          expect(pasadas).toBeLessThanOrEqual(max);
        }
      )
    );
  });

  it("dos identidades nunca se gastan el presupuesto la una a la otra", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), (max) => {
        const c: Contadores = new Map();
        const t0 = 1_000_000;
        // A agota lo suyo
        for (let i = 0; i < max + 5; i++) contar(c, "A", t0, max);
        // B llega nuevo y tiene su presupuesto entero
        expect(contar(c, "B", t0, max).ok).toBe(true);
      })
    );
  });

  it("pasada la ventana siempre se vuelve a poder", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: VENTANA_MS, max: VENTANA_MS * 10 }),
        (max, salto) => {
          const c: Contadores = new Map();
          const t0 = 1_000_000;
          for (let i = 0; i < max + 3; i++) contar(c, "ip", t0, max);
          expect(contar(c, "ip", t0 + salto, max).ok).toBe(true);
        }
      )
    );
  });

  it("cuando corta, siempre da un Retry-After usable (>= 1 s)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: VENTANA_MS - 1 }), (d) => {
        const c: Contadores = new Map();
        const t0 = 1_000_000;
        contar(c, "ip", t0, 1);
        const v = contar(c, "ip", t0 + d, 1);
        if (!v.ok) {
          expect(v.reintentarEn).toBeGreaterThanOrEqual(1);
          expect(v.reintentarEn).toBeLessThanOrEqual(Math.ceil(VENTANA_MS / 1000));
        }
      })
    );
  });

  it("`limpiar` nunca tira una ventana viva, y el mapa no crece sin fin", () => {
    // Sin esto el contador es una fuga de memoria disfrazada.
    fc.assert(
      fc.property(fc.array(fc.string({ minLength: 1 }), { maxLength: 50 }), (ips) => {
        const c: Contadores = new Map();
        const t0 = 1_000_000;
        for (const ip of ips) contar(c, ip, t0);
        limpiar(c, t0 + VENTANA_MS - 1); // todas siguen vivas
        expect(c.size).toBe(new Set(ips).size);
        limpiar(c, t0 + VENTANA_MS); // todas caducadas
        expect(c.size).toBe(0);
      })
    );
  });

  it("`identidadDe` nunca devuelve vacío: sin cabecera, todos al mismo cubo", () => {
    // Lo conservador: preferimos limitar de más a dejar el relé abierto.
    fc.assert(
      fc.property(fc.option(fc.string(), { nil: null }), (valor) => {
        const id = identidadDe({ get: () => valor });
        expect(id.length).toBeGreaterThan(0);
      })
    );
  });
});

/* ------------------------------------------------------------------ */
/* Permisos del agente                                                 */
/* ------------------------------------------------------------------ */

const permisosArb = fc.record(
  Object.fromEntries(EFECTOS.map((e) => [e, fc.boolean()])) as Record<string, fc.Arbitrary<boolean>>
) as fc.Arbitrary<PermisosConcedidos>;

describe("tool-permissions", () => {
  it("lo que se ofrece al modelo NUNCA incluye un efecto apagado", () => {
    // La regla que convierte el interruptor en un permiso de verdad.
    fc.assert(
      fc.property(permisosArb, (permisos) => {
        for (const t of filtrarCatalogo(TOOL_CATALOG, permisos)) {
          for (const efecto of efectosDe(t.name)) {
            expect(permisos[efecto], `${t.name} necesita ${efecto}`).toBe(true);
          }
        }
      })
    );
  });

  it("con TODO concedido pasa el catálogo entero; con todo apagado, ninguna", () => {
    const todo = (v: boolean) =>
      Object.fromEntries(EFECTOS.map((e) => [e, v])) as PermisosConcedidos;
    expect(filtrarCatalogo(TOOL_CATALOG, todo(true)).length).toBe(TOOL_CATALOG.length);
    expect(filtrarCatalogo(TOOL_CATALOG, todo(false)).length).toBe(0);
  });

  it("apagar un permiso nunca añade herramientas: el catálogo solo puede encoger", () => {
    fc.assert(
      fc.property(permisosArb, fc.constantFrom(...EFECTOS), (permisos, efecto) => {
        const antes = filtrarCatalogo(TOOL_CATALOG, permisos).length;
        const despues = filtrarCatalogo(TOOL_CATALOG, { ...permisos, [efecto]: false }).length;
        expect(despues).toBeLessThanOrEqual(antes);
      })
    );
  });

  it("una herramienta que no está declarada nunca se permite", () => {
    fc.assert(
      fc.property(fc.string(), permisosArb, (nombre, permisos) => {
        const conocida = TOOL_CATALOG.some((t) => t.name === nombre);
        if (!conocida) expect(toolPermitida(nombre, permisos).permitida).toBe(false);
      })
    );
  });
});

/* ------------------------------------------------------------------ */
/* Escudo PII                                                          */
/* ------------------------------------------------------------------ */

/** Texto que DE VERDAD lleva datos personales.
 *
 * `fc.string()` no vale aquí: genera ruido que casi nunca contiene un correo
 * válido, así que la propiedad se cumplía sin llegar a ver nunca el caso
 * interesante — y pasaba en verde con el fallo puesto. Una propiedad que no
 * genera el dato que le importa no prueba nada. */
const conPII = fc
  .tuple(
    // El texto de delante NO acaba en dígito: un dígito suelto pegado a una
    // tarjeta hace que la ventana del patrón coja 17 cifras, Luhn falle —con
    // razón— y no se enmascare. Es un límite conocido y se deja escrito aquí
    // en vez de esconderlo: se intentó arreglar buscando la tarjeta dentro de
    // la ventana y el remedio fue peor (enmascaraba «el pedido 1234 5678 9012
    // 3456 7»), así que se prefiere no estropear texto del usuario.
    fc.stringMatching(/^[a-zA-Z ,.:;()-]{0,40}$/),
    fc.constantFrom(
      "ana@ejemplo.com",
      "soporte@midominio.org",
      "+34 611 22 33 44",
      "ES91 2100 0418 4502 0005 1332",
      "4111 1111 1111 1111",
      "12345678Z"
    ),
    fc.string({ maxLength: 40 })
  )
  .map(([a, dato, b]) => `${a} ${dato} ${b}`);

describe("escudo PII", () => {
  it("límite conocido: un dígito suelto pegado delante esconde la tarjeta", () => {
    // Documentado, no escondido. El patrón coge 16 cifras desde el límite de
    // palabra; con «0 » delante quedan 17 y Luhn dice que no. Con cualquier
    // otro carácter (letra, dos puntos, paréntesis) se detecta bien.
    expect(escudoHistorial([{ role: "user", content: "0 4111 1111 1111 1111" }], true).total).toBe(0);
    expect(
      escudoHistorial([{ role: "user", content: "Tarjeta 1: 4111 1111 1111 1111" }], true).total
    ).toBe(1);
    expect(
      escudoHistorial([{ role: "user", content: "ref9 4111 1111 1111 1111" }], true).total
    ).toBe(1);
  });

  it("el generador de este bloque produce PII de verdad", () => {
    // Guardia del propio test: si esto deja de encontrar nada, las
    // propiedades de abajo se vuelven verdes por vacío y no protegen nada.
    fc.assert(
      fc.property(conPII, (texto) => {
        expect(escudoHistorial([{ role: "user", content: texto }], true).total).toBeGreaterThan(0);
      })
    );
  });

  it("nunca toca lo que NO escribió el usuario", () => {
    // El fallo de la semana: enmascaraba adjuntos y respuestas del modelo, y
    // le devolvía al usuario su propio HTML con el correo roto.
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            role: fc.constantFrom("assistant", "system", "tool"),
            content: conPII,
          }),
          { maxLength: 15 }
        ),
        (mensajes) => {
          const r = escudoHistorial(mensajes, true);
          expect(r.contenidos).toEqual(mensajes.map((m) => m.content));
          expect(r.total).toBe(0);
        }
      )
    );
  });

  it("apagado es la identidad: mismo número de mensajes y mismo contenido", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ role: fc.constantFrom("user", "assistant"), content: conPII }),
          { maxLength: 20 }
        ),
        (mensajes) => {
          const r = escudoHistorial(mensajes, false);
          expect(r.contenidos).toEqual(mensajes.map((m) => m.content));
          expect(r.total).toBe(0);
          expect(r.enEsteMensaje).toBe(false);
        }
      )
    );
  });

  it("es idempotente: enmascarar lo ya enmascarado no encuentra nada nuevo", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ role: fc.constant("user"), content: conPII }), { maxLength: 10 }),
        (mensajes) => {
          const una = escudoHistorial(mensajes, true);
          const dos = escudoHistorial(
            una.contenidos.map((content) => ({ role: "user", content })),
            true
          );
          expect(dos.total).toBe(0);
        }
      )
    );
  });

  it("el resultado tiene siempre la misma longitud que la entrada", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ role: fc.constantFrom("user", "assistant"), content: conPII })),
        (mensajes) => {
          expect(escudoHistorial(mensajes, true).contenidos.length).toBe(mensajes.length);
        }
      )
    );
  });
});

/* ------------------------------------------------------------------ */
/* Sandbox: resolución de recursos                                     */
/* ------------------------------------------------------------------ */

const segmento = fc.stringMatching(/^[a-z][a-z0-9-]{0,7}$/);

describe("sandbox", () => {
  it("`raizComun` devuelve una carpeta que TODOS los archivos comparten, o nada", () => {
    fc.assert(
      fc.property(
        fc.array(fc.array(segmento, { minLength: 1, maxLength: 4 }), { minLength: 1, maxLength: 8 }),
        (partes) => {
          const paths = partes.map((p) => p.join("/"));
          const raiz = raizComun(paths);
          if (raiz) {
            for (const p of paths) expect(p.startsWith(`${raiz}/`)).toBe(true);
          }
        }
      )
    );
  });

  it("un CSS referenciado como quiera SIEMPRE se inlinea si existe", () => {
    // La regla que faltaba: daba igual la carpeta del ZIP y la forma de la
    // ruta, el estilo tenía que llegar. Antes fallaba con carpeta + «/ruta».
    fc.assert(
      fc.property(
        fc.option(segmento, { nil: null }), // carpeta del ZIP (o ninguna)
        fc.constantFrom("", "css/", "assets/estilos/"), // subcarpeta del css
        fc.constantFrom("", "./", "/"), // cómo se escribe la ref
        (carpeta, sub, prefijo) => {
          const base = carpeta ? `${carpeta}/` : "";
          const rutaCss = `${base}${sub}estilo.css`;
          const ref = `${prefijo}${sub}estilo.css`;
          const files = new Map<string, Uint8Array>([
            [
              `${base}index.html`,
              new TextEncoder().encode(
                `<!doctype html><html><head><link rel="stylesheet" href="${ref}"></head><body></body></html>`
              ),
            ],
            [rutaCss, new TextEncoder().encode("body{color:rebeccapurple}")],
          ]);
          const r = buildRunHtml(`${base}index.html`, files);
          expect(r.html, `carpeta=${carpeta} sub=${sub} pref=${prefijo}`).toContain("rebeccapurple");
          expect(r.missing).toEqual([]);
        }
      )
    );
  });

  it("`htmlBytes` nunca cuenta la instrumentación que inyecta Prism", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 300 }), (texto) => {
        const html = `<!doctype html><html><head></head><body>${texto.replace(/[<>&]/g, "")}</body></html>`;
        const files = new Map([["index.html", new TextEncoder().encode(html)]]);
        const r = buildRunHtml("index.html", files);
        expect(r.htmlBytes).toBeLessThan(r.html.length);
      })
    );
  });

  it("`resolvePath` nunca se escapa hacia arriba de la raíz", () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom("..", ".", "a", "b"), { maxLength: 12 }), (segs) => {
        const p = resolvePath("x/y", segs.join("/"));
        expect(p.startsWith("..")).toBe(false);
        expect(p.includes("/../")).toBe(false);
      })
    );
  });
});

/* ------------------------------------------------------------------ */
/* Diagnóstico de archivos que faltan                                  */
/* ------------------------------------------------------------------ */

describe("faltantes", () => {
  it("un candidato propuesto SIEMPRE existe en el proyecto", () => {
    // Proponer un archivo que tampoco está sería peor que no proponer nada.
    fc.assert(
      fc.property(
        fc.array(fc.stringMatching(/^[a-z]{1,6}\.(css|js|png)$/), { maxLength: 8 }),
        fc.array(fc.stringMatching(/^[a-z]{1,6}\.(css|js|png)$/), { maxLength: 8 }),
        (faltan, hay) => {
          for (const f of diagnosticar(faltan, hay)) {
            for (const c of f.candidatos) expect(hay).toContain(c);
          }
        }
      )
    );
  });

  it("el arreglo de un clic solo se ofrece con UN candidato: nunca se adivina", () => {
    fc.assert(
      fc.property(
        fc.array(fc.stringMatching(/^[a-z]{1,6}\.(css|js)$/), { maxLength: 6 }),
        fc.array(fc.stringMatching(/^[a-z]{1,6}\.(css|js)$/), { maxLength: 6 }),
        (faltan, hay) => {
          for (const f of diagnosticar(faltan, hay)) {
            if (arregloDeUnClic(f)) expect(f.candidatos.length).toBe(1);
          }
        }
      )
    );
  });

  it("nunca se propone un candidato de otra extensión", () => {
    fc.assert(
      fc.property(
        fc.array(fc.stringMatching(/^[a-z]{1,6}\.(css|js|png)$/), { maxLength: 6 }),
        fc.array(fc.stringMatching(/^[a-z]{1,6}\.(css|js|png)$/), { maxLength: 6 }),
        (faltan, hay) => {
          const ext = (p: string) => p.slice(p.lastIndexOf(".") + 1).toLowerCase();
          for (const f of diagnosticar(faltan, hay)) {
            for (const c of f.candidatos) expect(ext(c)).toBe(f.ext);
          }
        }
      )
    );
  });
});

/* el techo se documenta aquí para que no se cambie sin querer */
it("los topes del presupuesto son los declarados", () => {
  expect(MAX_POR_VENTANA).toBe(120);
  expect(VENTANA_MS).toBe(60_000);
});

/* ------------------------------------------------------------------ */
/* Techo de gasto y veto de proveedores                                */
/* ------------------------------------------------------------------ */

describe("gasto", () => {
  it("NUNCA pasan más de `tope` llamadas de pago en un día, sea cual sea la mezcla", () => {
    // La regla que hace que se pueda prometer un número. Se generan mezclas
    // arbitrarias de llamadas gratis y de pago dentro del mismo día.
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 }),
        fc.array(fc.boolean(), { minLength: 1, maxLength: 200 }),
        (tope, esPago) => {
          const c: Contador = { dia: "", pago: 0, gratis: 0 };
          const t = new Date("2026-09-04T10:00:00").getTime();
          let pasaron = 0;
          for (const p of esPago) {
            if (contarLlamada(c, p, tope, t).ok && p) pasaron++;
          }
          expect(pasaron).toBeLessThanOrEqual(tope);
        }
      )
    );
  });

  it("lo gratis nunca se ve frenado por el techo, ni con el tope agotado", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), fc.integer({ min: 1, max: 50 }), (tope, n) => {
        const c: Contador = { dia: "", pago: 0, gratis: 0 };
        const t = Date.now();
        for (let i = 0; i < tope + 5; i++) contarLlamada(c, true, tope, t);
        for (let i = 0; i < n; i++) expect(contarLlamada(c, false, tope, t).ok).toBe(true);
      })
    );
  });

  it("`normalizarTope` nunca devuelve un número fuera del rango usable", () => {
    fc.assert(
      fc.property(fc.oneof(fc.integer(), fc.string(), fc.double()), (v) => {
        const t = normalizarTope(v);
        if (t !== null) {
          expect(t).toBeGreaterThanOrEqual(TOPE_MINIMO);
          expect(t).toBeLessThanOrEqual(TOPE_MAXIMO);
        }
      })
    );
  });
});

describe("vetados", () => {
  const IDS: ProviderId[] = ["openrouter", "groq", "gemini", "aihubmix", "kimi"];

  it("un proveedor vetado NUNCA sobrevive al filtro, esté donde esté en la lista", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...IDS), { maxLength: 12 }),
        fc.array(fc.constantFrom(...IDS), { maxLength: 5 }),
        (candidatos, vetados) => {
          const lista = candidatos.map((providerId) => ({ providerId, modelId: "m" }));
          for (const c of sinVetados(lista, vetados)) {
            expect(vetados).not.toContain(c.providerId);
          }
        }
      )
    );
  });

  it("vetar nunca añade candidatos: la lista solo puede encoger", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...IDS), { maxLength: 12 }),
        fc.constantFrom(...IDS),
        (candidatos, veto) => {
          const lista = candidatos.map((providerId) => ({ providerId, modelId: "m" }));
          expect(sinVetados(lista, [veto]).length).toBeLessThanOrEqual(lista.length);
        }
      )
    );
  });

  it("alternar dos veces deja la lista como estaba", () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...IDS), { maxLength: 5 }), fc.constantFrom(...IDS), (v, id) => {
        const unicos = [...new Set(v)];
        expect([...alternarVeto(alternarVeto(unicos, id), id)].sort()).toEqual([...unicos].sort());
      })
    );
  });
});
