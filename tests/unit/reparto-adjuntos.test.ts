/** Prism AI — Qué se hace con cada archivo que sueltas en el chat.
 *
 * Esta lógica vivía dentro de `attachFiles`, mezclada con el I/O y con los
 * avisos, y por eso no tenía un solo test. Los fallos de esta semana —un `.py`
 * que se caía en silencio, un ZIP que no se aceptaba— pasaron sin que nada se
 * pusiera rojo. Ahora está aparte, y esto es lo que faltaba.
 */
import { describe, expect, it } from "vitest";
import {
  clasificar,
  repartir,
  avisoIgnorados,
  MAX_DOCUMENTOS,
  MAX_IMAGENES,
} from "../../src/lib/prism/reparto-adjuntos";

const f = (name: string, type = "") => ({ name, type });

describe("clasificar", () => {
  it("manda cada archivo a su cajón", () => {
    const r = clasificar([
      f("foto.png", "image/png"),
      f("manual.pdf", "application/pdf"),
      f("datos.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
      f("web.zip", "application/zip"),
      f("notas.txt", "text/plain"),
    ]);
    expect(r.imagenes.map((x) => x.name)).toEqual(["foto.png"]);
    expect(r.documentos.map((x) => x.name)).toEqual(["manual.pdf", "notas.txt"]);
    expect(r.hojas.map((x) => x.name)).toEqual(["datos.xlsx"]);
    expect(r.zips.map((x) => x.name)).toEqual(["web.zip"]);
    expect(r.ignorados).toEqual([]);
  });

  it("el CÓDIGO es un documento, no basura", () => {
    // Antes un .py o un .js caía por el filtro y se ignoraba en silencio:
    // soltabas el archivo y no pasaba nada ni te decían por qué.
    const r = clasificar([f("app.py"), f("main.js"), f("estilos.css"), f("App.tsx"), f("Main.java")]);
    expect(r.documentos).toHaveLength(5);
    expect(r.ignorados).toEqual([]);
  });

  it("un .zip es un ZIP aunque el navegador no le ponga tipo", () => {
    expect(clasificar([f("web.zip")]).zips).toHaveLength(1);
    expect(clasificar([f("WEB.ZIP")]).zips).toHaveLength(1);
  });

  it("un .csv es hoja, no documento: el orden de las preguntas importa", () => {
    // `isTextPath` también lo aceptaría, así que se pregunta por hoja antes.
    const r = clasificar([f("datos.csv", "text/csv")]);
    expect(r.hojas).toHaveLength(1);
    expect(r.documentos).toEqual([]);
  });

  it("lo que no se puede leer va a ignorados, no se pierde", () => {
    const r = clasificar([f("video.mp4", "video/mp4"), f("programa.exe"), f("audio.mp3", "audio/mpeg")]);
    expect(r.ignorados).toHaveLength(3);
    expect(r.documentos).toEqual([]);
  });

  it("sin archivos, todos los cajones vacíos", () => {
    const r = clasificar([]);
    expect([...r.imagenes, ...r.hojas, ...r.zips, ...r.documentos, ...r.ignorados]).toEqual([]);
  });
});

describe("repartir", () => {
  const vacio = { docs: 0, imagenes: 0 };

  it("ZIP, hojas y documentos comparten el cupo de 3", () => {
    const c = repartir(
      { zips: [f("a.zip")], hojas: [f("b.csv")], documentos: [f("c.pdf"), f("d.pdf")], imagenes: [] },
      vacio
    );
    expect(c.zips).toHaveLength(1);
    expect(c.hojas).toHaveLength(1);
    expect(c.documentos).toHaveLength(1);
    expect(c.textosFuera).toBe(1);
  });

  it("descuenta lo ASIGNADO, no lo que traías", () => {
    // Antes se restaba `zips.length` —los candidatos— aunque el cupo solo
    // hubiera dado para uno: mandar cinco ZIP dejaba a las hojas sin sitio
    // incluso habiendo hueco.
    const c = repartir(
      { zips: [f("1.zip")], hojas: [f("a.csv"), f("b.csv"), f("c.csv")], documentos: [], imagenes: [] },
      vacio
    );
    expect(c.zips).toHaveLength(1);
    expect(c.hojas, "quedan 2 sitios y hay 3 hojas").toHaveLength(2);
    expect(c.textosFuera).toBe(1);
  });

  it("respeta lo que ya está adjunto en el mensaje", () => {
    const c = repartir({ zips: [], hojas: [], documentos: [f("a.pdf"), f("b.pdf")], imagenes: [] }, {
      docs: 2,
      imagenes: 0,
    });
    expect(c.documentos).toHaveLength(1);
    expect(c.textosFuera).toBe(1);
  });

  it("con el cupo lleno no entra ninguno, y se dice cuántos se quedaron fuera", () => {
    const c = repartir({ zips: [f("a.zip")], hojas: [], documentos: [], imagenes: [] }, {
      docs: MAX_DOCUMENTOS,
      imagenes: 0,
    });
    expect(c.zips).toEqual([]);
    expect(c.textosFuera).toBe(1);
  });

  it("las imágenes tienen su propio cupo, que no toca al de los textos", () => {
    const imagenes = Array.from({ length: 8 }, (_, i) => f(`i${i}.png`, "image/png"));
    const c = repartir({ zips: [], hojas: [], documentos: [f("a.pdf")], imagenes }, vacio);
    expect(c.imagenes).toHaveLength(MAX_IMAGENES);
    expect(c.imagenesFuera).toBe(2);
    expect(c.documentos, "el documento entra igual").toHaveLength(1);
  });

  it("sin nada que repartir no sobra nada", () => {
    const c = repartir({ zips: [], hojas: [], documentos: [], imagenes: [] }, vacio);
    expect(c.textosFuera).toBe(0);
    expect(c.imagenesFuera).toBe(0);
  });
});

describe("avisoIgnorados", () => {
  it("con uno solo lo NOMBRA: si no, hay que adivinar cuál de los seis fue", () => {
    expect(avisoIgnorados([f("video.mp4")])).toContain("video.mp4");
  });

  it("con varios da el número", () => {
    expect(avisoIgnorados([f("a.mp4"), f("b.exe")])).toContain("2 archivos");
  });

  it("sin ignorados no hay aviso", () => {
    expect(avisoIgnorados([])).toBeNull();
  });
});
