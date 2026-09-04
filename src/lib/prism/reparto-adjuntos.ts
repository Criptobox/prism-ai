/** Prism AI — Qué se hace con cada archivo que sueltas en el chat.
 *
 * Esta lógica vivía dentro de `attachFiles`, en `chat-app.tsx`, mezclada con
 * el I/O (leer el ZIP, parsear la hoja, comprimir la imagen) y con los avisos.
 * Por eso no tenía ni un test propio, y por eso los fallos de esta semana
 * —un `.py` que se caía en silencio, un ZIP que no se aceptaba— pasaron sin
 * que nada se pusiera rojo.
 *
 * Aquí está la parte que decide, sin tocar disco ni pantalla: qué es cada
 * archivo y cuántos caben. El hook se queda con lo que de verdad necesita al
 * navegador.
 */
import { isSheetFile } from "./sheets";
import { isTextPath } from "./sandbox";

/** Lo mínimo que hace falta saber de un archivo para clasificarlo. Se toma un
 * objeto y no un `File` para poder probarlo sin navegador. */
export interface ArchivoEntrante {
  name: string;
  type: string;
}

/** Cuántas imágenes caben en un mensaje. */
export const MAX_IMAGENES = 6;

/** Cuántos «textos» caben: documentos, hojas y ZIP comparten cupo, porque
 * todos acaban siendo lo mismo — texto pegado al mensaje. */
export const MAX_DOCUMENTOS = 3;

export interface Reparto<T> {
  imagenes: T[];
  hojas: T[];
  zips: T[];
  documentos: T[];
  /** lo que no encaja en ningún cajón. NO se tira en silencio: se avisa. */
  ignorados: T[];
}

function esZip(name: string): boolean {
  return /\.zip$/i.test(name);
}

/**
 * Clasifica los archivos soltados.
 *
 * El orden de las preguntas importa y por eso está escrito: una hoja de
 * cálculo `.csv` también pasaría por `isTextPath`, así que se pregunta por
 * hoja antes que por documento. Y un `.zip` no es ni lo uno ni lo otro.
 *
 * `isTextPath` cubre el código además del texto plano. Sin eso, un `.py` o un
 * `.js` caía por el filtro y se ignoraba EN SILENCIO: soltabas el archivo y no
 * pasaba nada, ni te decían por qué.
 */
export function clasificar<T extends ArchivoEntrante>(archivos: readonly T[]): Reparto<T> {
  const imagenes: T[] = [];
  const hojas: T[] = [];
  const zips: T[] = [];
  const documentos: T[] = [];
  const ignorados: T[] = [];

  for (const f of archivos) {
    if (f.type.startsWith("image/")) imagenes.push(f);
    else if (esZip(f.name)) zips.push(f);
    else if (isSheetFile(f.name, f.type)) hojas.push(f);
    else if (f.type === "application/pdf" || f.type === "text/plain" || isTextPath(f.name)) {
      documentos.push(f);
    } else ignorados.push(f);
  }
  return { imagenes, hojas, zips, documentos, ignorados };
}

export interface Cupos<T> {
  /** los que se procesan, ya recortados al cupo */
  zips: T[];
  hojas: T[];
  documentos: T[];
  imagenes: T[];
  /** cuántos textos se quedan fuera por el cupo de 3 */
  textosFuera: number;
  /** cuántas imágenes se quedan fuera por el cupo de 6 */
  imagenesFuera: number;
}

/**
 * Reparte el cupo entre ZIP, hojas y documentos.
 *
 * El reparto es por orden —primero ZIP, luego hojas, luego documentos— y se
 * descuenta lo YA ASIGNADO, no lo que había de candidatos. Antes se restaba
 * `zips.length`, o sea los que traías, aunque el cupo solo hubiera dado para
 * uno: mandar cinco ZIP dejaba a las hojas sin sitio incluso habiendo hueco.
 *
 * @param yaAdjuntos cuántos documentos e imágenes hay ya puestos en el mensaje
 */
export function repartir<T>(
  r: Pick<Reparto<T>, "zips" | "hojas" | "documentos" | "imagenes">,
  yaAdjuntos: { docs: number; imagenes: number },
  maxDocs = MAX_DOCUMENTOS,
  maxImgs = MAX_IMAGENES
): Cupos<T> {
  let sitio = Math.max(0, maxDocs - yaAdjuntos.docs);

  const zips = r.zips.slice(0, sitio);
  sitio -= zips.length;
  const hojas = r.hojas.slice(0, sitio);
  sitio -= hojas.length;
  const documentos = r.documentos.slice(0, sitio);

  const pedidos = r.zips.length + r.hojas.length + r.documentos.length;
  const aceptados = zips.length + hojas.length + documentos.length;

  const imagenes = r.imagenes.slice(0, Math.max(0, maxImgs - yaAdjuntos.imagenes));
  return {
    zips,
    hojas,
    documentos,
    imagenes,
    textosFuera: pedidos - aceptados,
    imagenesFuera: r.imagenes.length - imagenes.length,
  };
}

/** El aviso de lo que no se puede leer, o null si todo encajó.
 *
 * Se nombra el archivo cuando es uno solo: «no se pudo leer un archivo» obliga
 * al usuario a adivinar cuál de los seis que soltó.
 */
export function avisoIgnorados(ignorados: readonly ArchivoEntrante[]): string | null {
  if (!ignorados.length) return null;
  return ignorados.length === 1
    ? `«${ignorados[0].name}» no se puede leer aquí`
    : `${ignorados.length} archivos no se pueden leer aquí`;
}

/** Qué sí se acepta, para decirlo debajo del aviso. */
export const TIPOS_ACEPTADOS =
  "Se aceptan imágenes, PDF, texto, código, hojas de cálculo y ZIP.";
