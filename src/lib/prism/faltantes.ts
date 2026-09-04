/** Prism AI — Qué hacer cuando el HTML pide un archivo que no está.
 *
 * Reportado con captura: un ZIP con `index.html`, `css.css` y `javascript.js`
 * se abría en la vista previa sin estilos y sin scripts. El fallo NO era de
 * Prism resolviendo rutas: el HTML pedía `styles.css` y `script.js`, y en el
 * ZIP los archivos se llamaban de otra forma. Ese `index.html` se ve igual de
 * pelado en cualquier navegador.
 *
 * Lo que sí era fallo de Prism es habérselo callado. `buildRunHtml` ya
 * apuntaba los archivos ausentes, pero se enseñaban en un aviso que se va solo
 * a los pocos segundos y que además no decía lo evidente: «pides styles.css y
 * en el proyecto tienes UN css, que se llama css.css».
 *
 * Aquí se convierte esa lista en un diagnóstico con nombre y apellidos. Y
 * NADA se arregla solo: se propone y decide el usuario. Resolver `styles.css`
 * como `css.css` por nuestra cuenta haría que la vista previa mintiera sobre
 * lo que pasaría en un servidor de verdad.
 */

/** Un archivo que el HTML pide y no está, con lo que se ha encontrado. */
export interface Faltante {
  /** ruta completa tal como quedó al resolver, ej. «mi-web/styles.css» */
  path: string;
  /** solo el nombre, ej. «styles.css» */
  nombre: string;
  /** extensión en minúsculas y sin punto, ej. «css» («» si no tiene) */
  ext: string;
  /**
   * Candidatos del proyecto, del más al menos probable:
   *  1. el mismo nombre en otra carpeta (es una ruta mal escrita)
   *  2. el único archivo de esa extensión que hay (es un nombre distinto)
   */
  candidatos: string[];
  /** por qué se proponen esos candidatos, en una línea para la pantalla */
  motivo: "misma-ruta-otra-carpeta" | "unico-de-su-tipo" | "varios-del-tipo" | "ninguno";
}

function nombreDe(p: string): string {
  return p.split("/").pop() ?? p;
}

function extDe(p: string): string {
  const n = nombreDe(p);
  const i = n.lastIndexOf(".");
  return i > 0 ? n.slice(i + 1).toLowerCase() : "";
}

/** Cuántos candidatos se proponen cuando hay varios del mismo tipo. */
export const MAX_CANDIDATOS = 4;

/**
 * Diagnostica los archivos ausentes contra los que sí están en el proyecto.
 *
 * Puro y sin sorpresas. Los candidatos son una PROPUESTA: si el nombre no
 * casa con nada, se dice que no hay candidato en vez de sugerir el archivo
 * que más se parezca, que es como se acierta a veces y se confunde siempre.
 */
export function diagnosticar(missing: readonly string[], enElProyecto: readonly string[]): Faltante[] {
  // el mismo archivo puede faltar varias veces (varias etiquetas lo piden)
  const unicos = [...new Set(missing)];
  return unicos.map((path) => {
    const nombre = nombreDe(path);
    const ext = extDe(path);

    // 1. ¿existe con ESE nombre en otra carpeta? Entonces es la ruta.
    const mismaRuta = enElProyecto.filter((p) => p !== path && nombreDe(p) === nombre);
    if (mismaRuta.length) {
      return { path, nombre, ext, candidatos: mismaRuta.slice(0, MAX_CANDIDATOS), motivo: "misma-ruta-otra-carpeta" };
    }

    // 2. ¿hay archivos de ese tipo? Con UNO solo, es casi seguro ese.
    const delTipo = ext ? enElProyecto.filter((p) => extDe(p) === ext) : [];
    if (delTipo.length === 1) {
      return { path, nombre, ext, candidatos: delTipo, motivo: "unico-de-su-tipo" };
    }
    if (delTipo.length > 1) {
      return { path, nombre, ext, candidatos: delTipo.slice(0, MAX_CANDIDATOS), motivo: "varios-del-tipo" };
    }
    return { path, nombre, ext, candidatos: [], motivo: "ninguno" };
  });
}

/** El diagnóstico en una frase, para la pantalla y para el modelo. */
export function explicar(f: Faltante): string {
  const uno = f.candidatos[0];
  switch (f.motivo) {
    case "misma-ruta-otra-carpeta":
      return `El HTML pide «${f.path}» y ese archivo está en «${uno}». Es la ruta, no el nombre.`;
    case "unico-de-su-tipo":
      return `El HTML pide «${f.nombre}» y en el proyecto no está. El único .${f.ext} que hay se llama «${nombreDe(uno)}». Son nombres distintos: renómbralo o cambia la referencia en el HTML.`;
    case "varios-del-tipo":
      return `El HTML pide «${f.nombre}» y no está. Hay ${f.candidatos.length} archivo(s) .${f.ext} en el proyecto (${f.candidatos.map(nombreDe).join(", ")}), pero ninguno se llama así.`;
    default:
      return `El HTML pide «${f.path}» y no está en el proyecto${f.ext ? `, ni hay ningún .${f.ext}` : ""}.`;
  }
}

/**
 * ¿Se puede proponer un arreglo de un clic?
 *
 * Solo cuando hay UN candidato y la propuesta es inequívoca. Con varios, se
 * enseña la lista y elige el usuario: adivinar entre tres es acertar una de
 * cada tres veces y haberlo estropeado las otras dos.
 */
export function arregloDeUnClic(f: Faltante): { de: string; a: string } | null {
  if (f.candidatos.length !== 1) return null;
  if (f.motivo !== "unico-de-su-tipo" && f.motivo !== "misma-ruta-otra-carpeta") return null;
  return { de: f.candidatos[0], a: f.path };
}

/** Resumen corto: cuántos faltan y cuántos tienen arreglo propuesto. */
export function resumenFaltantes(fs: readonly Faltante[]): string {
  if (!fs.length) return "";
  const conArreglo = fs.filter((f) => arregloDeUnClic(f)).length;
  const cabeza = `${fs.length} archivo${fs.length === 1 ? "" : "s"} que el HTML pide no está${fs.length === 1 ? "" : "n"} en el proyecto`;
  if (!conArreglo) return `${cabeza}.`;
  return `${cabeza}. ${conArreglo === fs.length ? (conArreglo === 1 ? "Tiene" : "Todos tienen") : `${conArreglo} tiene${conArreglo === 1 ? "" : "n"}`} un candidato claro.`;
}

/* ------------------------------------------------------------------ */
/* Aplicar el arreglo                                                  */
/* ------------------------------------------------------------------ */

/** Ruta de `destino` escrita desde la carpeta de `baseDir`. */
function relativaDesde(baseDir: string, destino: string): string {
  if (!baseDir) return destino;
  return destino.startsWith(`${baseDir}/`) ? destino.slice(baseDir.length + 1) : `/${destino}`;
}

export interface ArregloAplicado {
  html: string;
  /** cuántas referencias se cambiaron (0 = no se encontró ninguna) */
  cambios: number;
  /** lo que había escrito en el HTML, para poder contarlo */
  refAnterior: string | null;
  /** lo que se escribió en su lugar */
  refNueva: string;
}

/**
 * Cambia en el HTML las referencias que apuntaban a un archivo ausente para
 * que apunten al que sí existe.
 *
 * Se toca el HTML y NO se renombra el archivo del usuario, por dos razones:
 * su archivo se llama como él quiso, y una edición de texto sobre un archivo
 * que ya existe aparece en la pestaña «Cambios» como cualquier otra — se ve
 * qué se tocó y se puede deshacer.
 *
 * Solo se sustituyen las referencias que resuelven EXACTAMENTE al archivo que
 * falta. Una cadena suelta que se parezca, dentro de un script o de un texto,
 * no se toca.
 */
export function aplicarArreglo(
  html: string,
  baseDir: string,
  pathAusente: string,
  pathReal: string,
  resolver: (baseDir: string, ref: string) => string
): ArregloAplicado {
  const refNueva = relativaDesde(baseDir, pathReal);
  let cambios = 0;
  let refAnterior: string | null = null;
  const out = html.replace(
    /\b(href|src)\s*=\s*(["'])([^"']+)\2/gi,
    (todo, attr: string, comilla: string, ref: string) => {
      const limpia = ref.trim();
      // enlaces externos, anclas y data: no son archivos del proyecto
      if (/^(https?:)?\/\//i.test(limpia) || /^(data|blob|mailto|tel|javascript|#)/i.test(limpia)) {
        return todo;
      }
      if (resolver(baseDir, limpia.split("#")[0].split("?")[0]) !== pathAusente) return todo;
      cambios++;
      refAnterior = limpia;
      return `${attr}=${comilla}${refNueva}${comilla}`;
    }
  );
  return { html: cambios ? out : html, cambios, refAnterior, refNueva };
}
