import { describe, expect, it } from "vitest";
import {
  delimitedToMarkdown,
  detectDelimiter,
  escapeCell,
  isSheetFile,
  parseDelimited,
  rowsToMarkdown,
  sheetKind,
  sheetsToMarkdown,
} from "../../src/lib/prism/sheets";

describe("sheetKind / isSheetFile", () => {
  it("reconoce las extensiones que sabemos abrir", () => {
    expect(sheetKind("ventas.csv")).toBe("csv");
    expect(sheetKind("datos.TSV")).toBe("tsv");
    expect(sheetKind("libro.xlsx")).toBe("excel");
    expect(sheetKind("viejo.xls")).toBe("excel");
    expect(sheetKind("foto.png")).toBeNull();
  });

  it("acepta también por tipo MIME", () => {
    expect(isSheetFile("export", "text/csv")).toBe(true);
    expect(
      isSheetFile(
        "export",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      )
    ).toBe(true);
    expect(isSheetFile("notas.txt", "text/plain")).toBe(false);
  });
});

describe("detectDelimiter", () => {
  it("detecta comas, puntos y coma y tabuladores", () => {
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
  });

  it("no cuenta separadores dentro de comillas", () => {
    expect(detectDelimiter('nombre;nota\n"Pérez, Ana";10\n"Gil, Luis";9')).toBe(";");
  });
});

describe("parseDelimited", () => {
  it("parsea un CSV simple", () => {
    expect(parseDelimited("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("respeta las comas dentro de comillas", () => {
    expect(parseDelimited('nombre,ciudad\n"Pérez, Ana",Madrid')).toEqual([
      ["nombre", "ciudad"],
      ["Pérez, Ana", "Madrid"],
    ]);
  });

  it("entiende las comillas escapadas y los saltos dentro de celda", () => {
    const rows = parseDelimited('cita,autor\n"Dijo ""hola""","Ana"\n"linea1\nlinea2",Luis');
    expect(rows[1][0]).toBe('Dijo "hola"');
    expect(rows[2][0]).toBe("linea1\nlinea2");
  });

  it("soporta CRLF y quita el BOM de Excel", () => {
    const rows = parseDelimited("\uFEFFa,b\r\n1,2\r\n");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("descarta las líneas en blanco", () => {
    expect(parseDelimited("a,b\n\n1,2\n\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("escapeCell", () => {
  it("escapa las barras que romperían la tabla markdown", () => {
    expect(escapeCell("a|b")).toBe("a\\|b");
  });

  it("aplana los saltos de línea", () => {
    expect(escapeCell("uno\ndos")).toBe("uno dos");
  });
});

describe("rowsToMarkdown", () => {
  it("usa la primera fila como cabecera", () => {
    const md = rowsToMarkdown([
      ["mes", "total"],
      ["enero", "120"],
    ]);
    expect(md).toContain("| mes | total |");
    expect(md).toContain("| --- | --- |");
    expect(md).toContain("| enero | 120 |");
  });

  it("rellena las filas cortas para no descuadrar columnas", () => {
    const md = rowsToMarkdown([
      ["a", "b", "c"],
      ["1"],
    ]);
    expect(md).toContain("| 1 |  |  |");
  });

  it("nombra las columnas sin cabecera", () => {
    expect(rowsToMarkdown([["", "b"], ["1", "2"]])).toContain("| col1 | b |");
  });

  it("recorta y avisa cuando hay demasiadas filas", () => {
    const rows = [["n"], ...Array.from({ length: 50 }, (_, i) => [String(i)])];
    const md = rowsToMarkdown(rows, { maxRows: 10 });
    expect(md.split("\n").filter((l) => l.startsWith("|"))).toHaveLength(12);
    expect(md).toContain("40 filas más no mostradas");
  });

  it("devuelve cadena vacía sin filas", () => {
    expect(rowsToMarkdown([])).toBe("");
  });
});

describe("sheetsToMarkdown", () => {
  it("titula cada hoja cuando el libro tiene varias", () => {
    const md = sheetsToMarkdown(
      [
        { name: "Ventas", rows: [["a"], ["1"]] },
        { name: "Costes", rows: [["b"], ["2"]] },
      ],
      "libro.xlsx"
    );
    expect(md).toContain("### Hoja «Ventas»");
    expect(md).toContain("### Hoja «Costes»");
  });

  it("con una sola hoja usa el nombre del archivo y cuenta filas y columnas", () => {
    const md = sheetsToMarkdown([{ name: "Hoja1", rows: [["a", "b"], ["1", "2"]] }], "datos.csv");
    expect(md).toContain("### datos.csv");
    expect(md).toContain("1 fila · 2 columnas");
  });

  it("se queja si no hay nada legible", () => {
    expect(() => sheetsToMarkdown([{ name: "x", rows: [] }], "v.csv")).toThrow(/vacía/i);
  });
});

describe("delimitedToMarkdown", () => {
  it("convierte un CSV en tabla markdown de punta a punta", () => {
    const md = delimitedToMarkdown("mes,total\nenero,120\nfebrero,90", "ventas.csv");
    expect(md).toContain("### ventas.csv");
    expect(md).toContain("| mes | total |");
    expect(md).toContain("| febrero | 90 |");
  });

  it("acepta TSV pasándole el tabulador", () => {
    const md = delimitedToMarkdown("a\tb\n1\t2", "d.tsv", "\t");
    expect(md).toContain("| a | b |");
  });
});
