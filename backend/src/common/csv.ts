export type CsvCell = string | number | boolean | Date | null | undefined;

/** Signed numbers and phone numbers like +8801…: data, never a formula. */
const NUMBER = /^[-+]?\d+(\.\d+)?$/;
/** Spreadsheets run cells starting with these as formulas. */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * RFC 4180 CSV with a UTF-8 byte-order mark, so spreadsheet programs show
 * Bangla names correctly. Text that a spreadsheet would run as a formula
 * (names, notes and the like are typed by people) is prefixed with an
 * apostrophe; plain numbers, signed ones and phone numbers included, are
 * left as they are.
 */
export function toCsv(header: string[], rows: CsvCell[][]): string {
  const lines = [header, ...rows].map((row) => row.map(cell).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

function cell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  let text =
    value instanceof Date
      ? value.toISOString()
      : typeof value === 'boolean'
        ? value
          ? 'yes'
          : 'no'
        : String(value);
  if (FORMULA_START.test(text) && !NUMBER.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** A safe download name: letters, digits, dots, hyphens and underscores. */
export function csvFilename(name: string): string {
  return `${name.replace(/[^A-Za-z0-9._-]+/g, '-')}.csv`;
}
