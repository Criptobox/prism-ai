/** Prism AI — Hojas de cálculo (CSV / TSV / XLSX / XLS) leídas EN LOCAL.
 *
 * El archivo no sale del dispositivo: se parsea en el navegador y lo único que
 * viaja al modelo es una tabla markdown, igual que el texto de un PDF. El
 * parser de CSV/TSV es propio (sin dependencias) y las hojas de Excel usan
 * `xlsx` cargada BAJO DEMANDA, solo cuando adjuntas un .xlsx/.xls.
 *
 * Todo lo de este archivo salvo `readSheetFile` es puro: se prueba en Node.
 */

/** Filas máximas que se convierten a markdown (el resto se resume en una nota) */
export const MAX_SHEET_ROWS = 200;
/** Columnas máximas por fila */
export const MAX_SHEET_COLS = 40;
/** Tope de caracteres del texto que viaja al modelo */
export const MAX_SHEET_CHARS = 120_000;

/** Una hoja ya normalizada: nombre + matriz de celdas en texto */
export interface SheetTable {
  name: string;
  rows: string[][];
}

const DELIMS = [",", ";", "\t", "|"] as const;
export type Delimiter = (typeof DELIMS)[number];

/** Extensiones que sabemos abrir */
export function sheetKind(name: string): "csv" | "tsv" | "excel" | null {
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (!ext) return null;
  if (ext === "csv") return "csv";
  if (ext === "tsv" || ext === "tab") return "tsv";
  if (ext === "xlsx" || ext === "xls" || ext === "xlsm") return "excel";
  return null;
}

/** ¿Este archivo es una hoja de cálculo que podemos leer en local? */
export function isSheetFile(name: string, mime?: string): boolean {
  if (sheetKind(name)) return true;
  const t = (mime ?? "").toLowerCase();
  return (
    t === "text/csv" ||
    t === "text/tab-separated-values" ||
    t === "application/vnd.ms-excel" ||
    t === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

/** Adivina el separador contando cuál da el reparto más regular en columnas. */
export function detectDelimiter(text: string): Delimiter {
  const sample = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  if (!sample.length) return ",";

  let best: Delimiter = ",";
  let bestScore = -1;
  for (const d of DELIMS) {
    const counts = sample.map((line) => countOutsideQuotes(line, d));
    if (counts.every((c) => c === 0)) continue;
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    // regularidad: cuantas más líneas con el mismo número de separadores, mejor
    const consistent = counts.filter((c) => c === counts[0]).length / counts.length;
    const score = consistent * 10 + Math.min(avg, 10);
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

function countOutsideQuotes(line: string, delim: string): number {
  let n = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') i++;
      else inQuotes = !inQuotes;
    } else if (ch === delim && !inQuotes) {
      n++;
    }
  }
  return n;
}

/** Parser CSV/TSV con comillas, comillas escapadas («""») y saltos dentro de celda. */
export function parseDelimited(text: string, delim?: string): string[][] {
  // BOM de Excel: si se cuela, la primera cabecera sale con basura delante
  const src = text.replace(/^\uFEFF/, "");
  const d = delim ?? detectDelimiter(src);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === d) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      // \r\n: el \n siguiente cierra la fila
      if (src[i + 1] !== "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      }
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }

  // fuera filas totalmente vacías (líneas en blanco del final)
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Una celda dentro de una tabla markdown: las barras romperían las columnas. */
export function escapeCell(value: string): string {
  return value
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ")
    .trim();
}

/** Matriz → tabla markdown (primera fila = cabecera). */
export function rowsToMarkdown(
  rows: string[][],
  opts: { maxRows?: number; maxCols?: number } = {}
): string {
  const maxRows = opts.maxRows ?? MAX_SHEET_ROWS;
  const maxCols = opts.maxCols ?? MAX_SHEET_COLS;
  if (!rows.length) return "";

  const width = Math.min(maxCols, Math.max(...rows.map((r) => r.length)));
  const shown = rows.slice(0, maxRows + 1); // +1 por la cabecera

  const pad = (r: string[]) => {
    const cells = r.slice(0, width).map(escapeCell);
    while (cells.length < width) cells.push("");
    return cells;
  };

  const header = pad(shown[0]).map((c, i) => c || `col${i + 1}`);
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...shown.slice(1).map((r) => `| ${pad(r).join(" | ")} |`),
  ];

  const omittedRows = Math.max(0, rows.length - shown.length);
  const omittedCols = Math.max(0, Math.max(...rows.map((r) => r.length)) - width);
  const notes: string[] = [];
  if (omittedRows) notes.push(`${omittedRows} filas más no mostradas`);
  if (omittedCols) notes.push(`${omittedCols} columnas más no mostradas`);
  if (notes.length) lines.push(`\n_(${notes.join(" · ")})_`);

  return lines.join("\n");
}

/** Hojas → un solo texto markdown con encabezados por hoja. */
export function sheetsToMarkdown(sheets: SheetTable[], fileName: string): string {
  const usable = sheets.filter((s) => s.rows.length);
  if (!usable.length) {
    throw new Error("La hoja de cálculo está vacía");
  }

  const parts: string[] = [];
  for (const s of usable) {
    const filas = s.rows.length ? s.rows.length - 1 : 0;
    const cols = Math.max(...s.rows.map((r) => r.length));
    const titulo =
      usable.length > 1 ? `### Hoja «${s.name}»` : `### ${fileName}`;
    parts.push(
      `${titulo}\n_${filas} ${filas === 1 ? "fila" : "filas"} · ${cols} ${
        cols === 1 ? "columna" : "columnas"
      }_\n\n${rowsToMarkdown(s.rows)}`
    );
  }
  return parts.join("\n\n").slice(0, MAX_SHEET_CHARS);
}

/** Texto plano CSV/TSV → markdown listo para el modelo. */
export function delimitedToMarkdown(text: string, fileName: string, delim?: string): string {
  const rows = parseDelimited(text, delim);
  if (!rows.length) throw new Error(`«${fileName}» no tiene filas legibles`);
  return sheetsToMarkdown([{ name: fileName, rows }], fileName);
}

/** Tope de tamaño del Excel. Un archivo de cientos de MB no es un caso de uso:
 * es la forma barata de tumbar la pestaña. CSV/TSV no lo necesitan porque su
 * parser es propio y lineal. */
export const MAX_EXCEL_BYTES = 15 * 1024 * 1024;

/** Tiempo máximo del parseo. `xlsx` arrastra un ReDoS sin arreglo: si un
 * archivo preparado dispara el retroceso exponencial, el worker se cuelga y
 * aquí se le mata en vez de dejar la app esperando para siempre. */
export const TIMEOUT_EXCEL_MS = 20_000;

/**
 * Lee un Excel en un Worker que se destruye al terminar.
 *
 * `xlsx` tiene dos vulnerabilidades altas sin arreglo en npm (contaminación de
 * prototipos y ReDoS) que se disparan al leer un archivo preparado. Como Prism
 * guarda las claves en el dispositivo, ensuciar el `Object.prototype` del hilo
 * principal iría justo contra la promesa del producto. En un Worker eso ocurre
 * en otro realm y muere con él.
 *
 * Si el Worker no se puede crear, se falla con un mensaje claro en vez de caer
 * al parseo directo: hacerlo «por comodidad» dejaría el agujero abierto
 * exactamente en los navegadores donde no se puede cerrar.
 */
async function leerExcelAislado(file: File): Promise<SheetTable[]> {
  if (file.size > MAX_EXCEL_BYTES) {
    throw new Error(
      `«${file.name}» ocupa ${(file.size / 1024 / 1024).toFixed(1)} MB y el tope es ${
        MAX_EXCEL_BYTES / 1024 / 1024
      } MB. Exporta solo la hoja que necesites, o guárdala como CSV.`
    );
  }

  let worker: Worker;
  try {
    worker = new Worker(new URL("./sheets.worker.ts", import.meta.url), { type: "module" });
  } catch {
    throw new Error(
      `No se pudo abrir «${file.name}» de forma aislada en este navegador. Guarda la hoja como CSV y vuelve a adjuntarla.`
    );
  }

  const buffer = await file.arrayBuffer();
  try {
    return await new Promise<SheetTable[]>((resolve, reject) => {
      const reloj = setTimeout(
        () => reject(new Error(`«${file.name}» tardó demasiado en abrirse y se ha cancelado.`)),
        TIMEOUT_EXCEL_MS
      );
      worker.onmessage = (e: MessageEvent<{ ok: boolean; hojas?: SheetTable[]; error?: string }>) => {
        clearTimeout(reloj);
        if (e.data.ok && e.data.hojas) resolve(e.data.hojas);
        else reject(new Error(e.data.error ?? `No se pudo leer «${file.name}»`));
      };
      worker.onerror = () => {
        clearTimeout(reloj);
        reject(new Error(`No se pudo leer «${file.name}»`));
      };
      // el buffer se transfiere, no se copia: un Excel grande no se duplica
      worker.postMessage({ buffer }, [buffer]);
    });
  } finally {
    // pase lo que pase: el hilo (y lo que se haya contaminado dentro) se va
    worker.terminate();
  }
}

/** Lee una hoja adjunta y devuelve su tabla markdown.
 *
 * CSV/TSV se leen con el parser propio; XLSX/XLS cargan `xlsx` bajo demanda
 * (import dinámico) para no engordar el bundle de quien nunca adjunta Excel. */
export async function readSheetFile(file: File): Promise<{ name: string; text: string }> {
  const kind = sheetKind(file.name) ?? (file.type.includes("excel") || file.type.includes("spreadsheet") ? "excel" : "csv");

  if (kind === "excel") {
    const sheets = await leerExcelAislado(file);
    return { name: file.name, text: sheetsToMarkdown(sheets, file.name) };
  }

  const raw = await file.text();
  const delim = kind === "tsv" ? "\t" : undefined;
  return { name: file.name, text: delimitedToMarkdown(raw, file.name, delim) };
}
