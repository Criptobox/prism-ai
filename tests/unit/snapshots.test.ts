/** Tests de los puntos de restauración (tool git_snapshot). */
import { beforeEach, describe, expect, it } from "vitest";
import {
  borrarSnapshot,
  charsDeFiles,
  crearSnapshot,
  guardarSnapshot,
  listarSnapshots,
  memoriaComoStorage,
  obtenerSnapshot,
  MAX_CHARS_SNAPSHOT,
  MAX_SNAPSHOTS,
} from "../../src/lib/prism/snapshots";

function files(n = 2): Record<string, string> {
  return Object.fromEntries(
    Array.from({ length: n }, (_, i) => [`f${i}.txt`, "contenido ".repeat(10)])
  );
}

describe("crearSnapshot", () => {
  it("copia los archivos con id, mensaje y fecha", () => {
    const f = files(2);
    const s = crearSnapshot(f, "antes del refactor", 1700000000000)!;
    expect(s).not.toBeNull();
    expect(s.mensaje).toBe("antes del refactor");
    expect(Object.keys(s.files)).toEqual(["f0.txt", "f1.txt"]);
    // copia, no referencia: tocar el original no corrompe el snapshot
    f["f0.txt"] = "cambiado";
    expect(s.files["f0.txt"]).not.toBe("cambiado");
  });

  it("rechaza proyectos vacíos", () => {
    expect(crearSnapshot({}, "vacío")).toBeNull();
  });

  it("rechaza proyectos que superan el tope de caracteres", () => {
    const grande = { "big.txt": "x".repeat(MAX_CHARS_SNAPSHOT + 1) };
    expect(crearSnapshot(grande, "grande")).toBeNull();
  });

  it("mensaje vacío cae a «sin mensaje»", () => {
    const s = crearSnapshot(files(1), "   ")!;
    expect(s.mensaje).toBe("sin mensaje");
  });
});

describe("almacenamiento", () => {
  let st: Storage;
  beforeEach(() => {
    st = memoriaComoStorage();
  });

  it("guarda y lista (el más nuevo primero)", () => {
    const a = crearSnapshot(files(1), "primero", 1000)!;
    const b = crearSnapshot(files(1), "segundo", 2000)!;
    guardarSnapshot(a, st);
    guardarSnapshot(b, st);
    const lista = listarSnapshots(st);
    expect(lista.map((s) => s.mensaje)).toEqual(["segundo", "primero"]);
  });

  it("obtener por id y borrar", () => {
    const a = crearSnapshot(files(1), "quedarme", 1000)!;
    const b = crearSnapshot(files(1), "borrarme", 2000)!;
    guardarSnapshot(a, st);
    guardarSnapshot(b, st);
    expect(obtenerSnapshot(a.id, st)?.mensaje).toBe("quedarme");
    expect(obtenerSnapshot("no-existe", st)).toBeNull();
    const restantes = borrarSnapshot(b.id, st);
    expect(restantes).toHaveLength(1);
    expect(obtenerSnapshot(b.id, st)).toBeNull();
  });

  it("respeta el tope de snapshots conservando los más recientes", () => {
    for (let i = 0; i < MAX_SNAPSHOTS + 5; i++) {
      guardarSnapshot(crearSnapshot(files(1), `s${i}`, 1000 + i)!, st);
    }
    const lista = listarSnapshots(st);
    expect(lista).toHaveLength(MAX_SNAPSHOTS);
    // los más nuevos sobreviven, los más viejos se caen
    expect(lista[0].mensaje).toBe(`s${MAX_SNAPSHOTS + 4}`);
    expect(lista[lista.length - 1].mensaje).toBe("s5");
  });

  it("JSON corrupto no rompe: lista vacía", () => {
    st.setItem("prism-snapshots-v1", "{esto no es json");
    expect(listarSnapshots(st)).toEqual([]);
  });
});

describe("charsDeFiles", () => {
  it("suma los caracteres de todos los archivos", () => {
    expect(charsDeFiles({ "a.txt": "hola", "b.txt": "mundo" })).toBe(9);
  });
});
