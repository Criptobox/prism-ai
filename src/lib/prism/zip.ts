/** Prism AI — ZIP mínimo sin dependencias (para el Sandbox).
 * Lector: usa DecompressionStream nativo del navegador (deflate-raw) + stored.
 * Escritor: método STORE (sin comprimir) con CRC32 — válido y universal.
 * Soporta nombres UTF-8 y carpetas anidadas. Sin zip64 (proyectos pequeños).
 */

export interface ZipEntry {
  path: string;
  size: number;
  data: Uint8Array;
}

const MAX_ENTRIES = 5000;
const MAX_TOTAL = 256 * 1024 * 1024; // 256 MB descomprimidos
const EOCD_SIG = 0x06054b50;
const CDH_SIG = 0x02014b50;
const LFH_SIG = 0x04034b50;

function u16(v: DataView, off: number): number {
  return v.getUint16(off, true);
}
function u32(v: DataView, off: number): number {
  return v.getUint32(off, true);
}

/** Encuentra el EOCD escaneando hacia atrás (máx. 64 KB de comentario). */
function findEocd(v: DataView): number {
  const min = Math.max(0, v.byteLength - 22 - 65535);
  for (let i = v.byteLength - 22; i >= min; i--) {
    if (u32(v, i) === EOCD_SIG) return i;
  }
  return -1;
}

export async function readZip(buf: ArrayBuffer): Promise<ZipEntry[]> {
  const v = new DataView(buf);
  const eocd = findEocd(v);
  if (eocd < 0) throw new Error("El archivo no parece un ZIP válido.");
  const count = u16(v, eocd + 10);
  let cdOff = u32(v, eocd + 16);
  if (count > MAX_ENTRIES) throw new Error(`Demasiados archivos en el ZIP (${count}).`);

  const out: ZipEntry[] = [];
  let total = 0;
  const dec = new TextDecoder();

  for (let i = 0; i < count; i++) {
    if (cdOff + 46 > v.byteLength || u32(v, cdOff) !== CDH_SIG)
      throw new Error("ZIP corrupto: cabecera central no válida.");
    const method = u16(v, cdOff + 10);
    const compSize = u32(v, cdOff + 20);
    const nameLen = u16(v, cdOff + 28);
    const extraLen = u16(v, cdOff + 30);
    const commentLen = u16(v, cdOff + 32);
    const lfhOff = u32(v, cdOff + 42);
    const path = dec.decode(new Uint8Array(buf, cdOff + 46, nameLen));
    cdOff += 46 + nameLen + extraLen + commentLen;

    if (path.endsWith("/")) continue; // carpeta
    if (method !== 0 && method !== 8) continue; // método no soportado: se ignora

    if (compSize === 0) {
      // archivo vacío válido
      total += 0;
      out.push({ path: path.replace(/\\/g, "/"), size: 0, data: new Uint8Array(0) });
      continue;
    }

    // cabecera local (tiene sus propias longitudes de nombre/extra)
    if (lfhOff + 30 > v.byteLength || u32(v, lfhOff) !== LFH_SIG)
      throw new Error("ZIP corrupto: cabecera local no válida.");
    const lNameLen = u16(v, lfhOff + 26);
    const lExtraLen = u16(v, lfhOff + 28);
    const dataStart = lfhOff + 30 + lNameLen + lExtraLen;
    if (dataStart + compSize > v.byteLength)
      throw new Error("ZIP corrupto: datos truncados.");
    const raw = new Uint8Array(buf.slice(dataStart, dataStart + compSize));

    let data: Uint8Array;
    if (method === 0) {
      data = raw;
    } else {
      const ds = new DecompressionStream("deflate-raw");
      const stream = new Blob([raw as BlobPart]).stream().pipeThrough(ds);
      const ab = await new Response(stream).arrayBuffer();
      data = new Uint8Array(ab);
    }
    total += data.length;
    if (total > MAX_TOTAL) throw new Error("El ZIP descomprimido es demasiado grande (máx. 256 MB).");
    out.push({ path: path.replace(/\\/g, "/"), size: data.length, data });
  }
  return out;
}

/* ---------- escritor (STORE) ---------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Crea un ZIP (STORE) válido con los archivos dados. Rutas con «/». */
export function writeZip(files: { path: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const push = (arr: Uint8Array) => {
    chunks.push(arr);
    offset += arr.length;
  };

  for (const f of files) {
    const path = f.path.replace(/\\/g, "/").replace(/^\/+/, "");
    const name = enc.encode(path);
    const crc = crc32(f.data);
    const size = f.data.length;

    const lfh = new Uint8Array(30 + name.length);
    const lv = new DataView(lfh.buffer);
    lv.setUint32(0, LFH_SIG, true);
    lv.setUint16(4, 20, true); // versión
    lv.setUint16(6, 0x0800, true); // flag UTF-8
    lv.setUint16(8, 0, true); // STORE
    lv.setUint16(10, 0, true); // hora
    lv.setUint16(12, 0x21, true); // fecha (1980-01-01)
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true); // comprimido
    lv.setUint32(22, size, true); // original
    lv.setUint16(26, name.length, true);
    lfh.set(name, 30);
    push(lfh);
    push(f.data);

    const cdh = new Uint8Array(46 + name.length);
    const cv = new DataView(cdh.buffer);
    cv.setUint32(0, CDH_SIG, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset - size - lfh.length, true); // offset local
    cdh.set(name, 46);
    central.push(cdh);
  }

  const cdStart = offset;
  let cdSize = 0;
  for (const c of central) {
    push(c);
    cdSize += c.length;
  }
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, EOCD_SIG, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdStart, true);
  push(eocd);

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}
