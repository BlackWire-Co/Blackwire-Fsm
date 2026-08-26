import Papa from "papaparse";

export function toCsv(rows: Record<string, any>[], columns: string[]): string {
  const data = rows.map((row) => columns.map((col) => (row[col] === null || row[col] === undefined ? "" : String(row[col]))));
  return Papa.unparse({ fields: columns, data });
}

export function parseCsv(buffer: Buffer): { rows: Record<string, string>[]; parseErrors: string[] } {
  const text = buffer.toString("utf-8");
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  return {
    rows: result.data,
    parseErrors: result.errors.map((e) => `Row ${e.row}: ${e.message}`),
  };
}
