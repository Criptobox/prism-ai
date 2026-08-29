import { describe, expect, it } from "vitest";
import { csvToText, excelToText } from "../../src/lib/prism/spreadsheet";

describe("csvToText", () => {
  it("convierte CSV con comas en tabla markdown", () => {
    const out = csvToText("mes,ventas\nenero,120\nfebrero,180");
    expect(out).toContain("| mes | ventas |");
    expect(out).toContain("| enero | 120 |");
  });

  it("detecta el punto y coma", () => {
    const out = csvToText("mes;ventas\nenero;120");
    expect(out).toContain("| mes | ventas |");
    expect(out).toContain("| enero | 120 |");
  });

  it("respeta campos entre comillas (no los corta)", () => {
    const out = csvToText("nombre,nota\nAna,\"muy, buena\"");
    expect(out).toContain("muy, buena");
  });

  it("trunca a 120k y no revienta vacío", () => {
    const big = Array.from({ length: 40_000 }, (_, i) => `${i},${i}`).join("\n");
    expect(csvToText(big).length).toBeLessThanOrEqual(120_000);
    expect(csvToText("")).toBe("");
  });
});

describe("excelToText", () => {
  it("convierte un XLSX en tabla markdown", async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["producto", "unidades"],
        ["café", 12],
        ["té", 5],
      ]),
      "Ventas"
    );
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const out = await excelToText(buf);
    expect(out).toContain("| producto | unidades |");
    expect(out).toContain("| café | 12 |");
    expect(out).toContain("Ventas");
  });
});
