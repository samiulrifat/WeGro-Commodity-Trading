/** One data row: values by header name, and where it came from. */
export interface CsvRow {
  /** 1-based line of the row's first character in the file. */
  line: number;
  values: Record<string, string>;
}

export class CsvFormatError extends Error {
  constructor(
    readonly line: number,
    readonly reason: string,
  ) {
    super(`line ${line}: ${reason}`);
  }
}

/**
 * Reads RFC 4180 CSV as Excel saves it: optional UTF-8 BOM, comma separated,
 * fields quoted with " when they hold commas, quotes or line breaks, CRLF or
 * LF line ends. Header names are trimmed and lower-cased; cells are trimmed;
 * blank lines are skipped. One pass over the text.
 */
export function readCsv(text: string): { headers: string[]; rows: CsvRow[] } {
  const records = parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  const nonBlank = records.filter((r) => r.cells.some((c) => c.trim() !== ''));
  if (nonBlank.length === 0) return { headers: [], rows: [] };
  const [head, ...body] = nonBlank;
  const headers = head.cells.map((h) => h.trim().toLowerCase());
  const seen = new Set<string>();
  for (const h of headers) {
    if (!h) throw new CsvFormatError(head.line, 'empty column name');
    if (seen.has(h)) throw new CsvFormatError(head.line, `column "${h}" twice`);
    seen.add(h);
  }
  return {
    headers,
    rows: body.map((r) => {
      if (r.cells.length > headers.length) {
        throw new CsvFormatError(
          r.line,
          `${r.cells.length} cells but ${headers.length} columns`,
        );
      }
      return {
        line: r.line,
        values: Object.fromEntries(
          headers.map((h, i) => [h, (r.cells[i] ?? '').trim()]),
        ),
      };
    }),
  };
}

function parse(text: string): Array<{ line: number; cells: string[] }> {
  const records: Array<{ line: number; cells: string[] }> = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let recordLine = 1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else {
        if (ch === '\n') line++;
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      if (cell.trim() !== '') {
        throw new CsvFormatError(line, 'a quote inside an unquoted cell');
      }
      cell = '';
      quoted = true;
    } else if (ch === ',') {
      cells.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      cells.push(cell);
      records.push({ line: recordLine, cells });
      cells = [];
      cell = '';
      line++;
      recordLine = line;
    } else {
      cell += ch;
    }
  }
  if (quoted) throw new CsvFormatError(recordLine, 'a quoted cell never ends');
  if (cell !== '' || cells.length > 0) {
    cells.push(cell);
    records.push({ line: recordLine, cells });
  }
  return records;
}
