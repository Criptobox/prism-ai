/** Prism AI — Adjuntos de hojas de cálculo (CSV/TSV/XLSX) → texto para el modelo.
 * Todo se lee en local, nada sale del dispositivo.
 */

const MAX_CHARS = 120_000;

/** Detecta el separador de un CSV (coma, punto y coma, tabulación). */
function detectDelimiter(head: string): string {
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  for (const ch of head) {
    if (ch in counts) counts[ch]++;
  }
  const best = (Object.entries(counts) as [string, number][]).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : ",";
}

/** Convierte CSV/TSV a texto estable: delimitador normalizado a tablas markdown
 * cuando es razonable, si no el texto crudo. Límite de 120k caracteres. */
export function csvToText(raw: string, maxChars = MAX_CHARS): string {
  const text = raw.replace(/\r\n?/g, "\n").trim();
  if (!text) return "";

  const lines = text.split("\n").slice(0, 3000);
  const delim = detectDelimiter(lines[0] ?? "");
  // Con comillas (campos con separadores dentro) es más fiel dejar el CSV crudo:
  // el modelo lo lee igual de bien y no se rompe ninguna celda.
  const isSimple = !text.slice(0, 4000).includes('"') || delim === "\t";

  let out = `[Hoja de cálculo · delimitador: ${delim === "\t" ? "tabulación" : delim === ";" ? "punto y coma" : "coma"}]\n`;
  if (isSimple) {
    // tablas markdown: el modelo las lee de un vistazo
    const rows = lines.map((l) => l.split(delim).map((c) => c.trim().replace(/\|/g, "\\|")));
    if (rows.length) {
      const cols = Math.max(...rows.map((r) => r.length));
      const h = rows[0];
      out +=
        "| " + h.join(" | ") + " |\n" +
        "|" + Array.from({ length: cols }, () => " --- ").join("|") + "|\n" +
        rows.slice(1).map((r) => "| " + r.join(" | ") + " |").join("\n");
    }
  } else {
    out += text;
  }
  return out.slice(0, maxChars);
}

/** Convierte un XLSX/XLS a CSV combinando todas las hojas (la primera completa,
 * el resto con su nombre). xlsx se carga bajo demanda para no engordar el
 * bundle del chat. */
export async function excelToText(
  data: ArrayBuffer,
  maxChars = MAX_CHARS
): Promise<string> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(data, { type: "array" });
  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    if (!csv.trim()) continue;
    parts.push(`## Hoja: ${name}\n${csvToText(csv, maxChars)}`);
    if (parts.join("\n\n").length >= maxChars) break;
  }
  return parts.join("\n\n").slice(0, maxChars);
}
