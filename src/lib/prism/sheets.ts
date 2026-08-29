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

/** Lee una hoja adjunta y devuelve su tabla markdown.
 *
 * CSV/TSV se leen con el parser propio; XLSX/XLS cargan `xlsx` bajo demanda
 * (import dinámico) para no engordar el bundle de quien nunca adjunta Excel. */
export async function readSheetFile(file: File): Promise<{ name: string; text: string }> {
  const kind = sheetKind(file.name) ?? (file.type.includes("excel") || file.type.includes("spreadsheet") ? "excel" : "csv");

  if (kind === "excel") {
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheets: SheetTable[] = wb.SheetNames.map((name) => {
      const ws = wb.Sheets[name];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
        header: 1,
        blankrows: false,
        defval: "",
        raw: false,
      });
      return {
        name,
        rows: (rows as unknown[][])
          .map((r) => r.map((c) => (c == null ? "" : String(c))))
          .filter((r) => r.some((c) => c.trim() !== "")),
      };
    });
    return { name: file.name, text: sheetsToMarkdown(sheets, file.name) };
  }

  const raw = await file.text();
  const delim = kind === "tsv" ? "\t" : undefined;
  return { name: file.name, text: delimitedToMarkdown(raw, file.name, delim) };
}
