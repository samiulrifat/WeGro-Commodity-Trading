import { runIdCheck } from '../modules/participants/id-check/id-check';
import { CsvFormatError, readCsv } from './csv-read';
import { IMPORT_FILES } from './import/import-files';
import { buildDataset } from './seed/dataset';

describe('readCsv', () => {
  it('reads Excel output: BOM, CRLF, quoted commas, quotes and line breaks', () => {
    const text =
      '﻿ Id ,NAME,Address\r\n' +
      'P1,"Rahim, Uddin","Road 1\r\nDhaka"\r\n' +
      '\r\n' +
      'P2,"Say ""hi""",  padded  \r\n';
    const { headers, rows } = readCsv(text);
    expect(headers).toEqual(['id', 'name', 'address']);
    expect(rows).toEqual([
      {
        line: 2,
        values: { id: 'P1', name: 'Rahim, Uddin', address: 'Road 1\r\nDhaka' },
      },
      { line: 5, values: { id: 'P2', name: 'Say "hi"', address: 'padded' } },
    ]);
  });

  it('fills short rows and takes a last line without a line end', () => {
    expect(readCsv('a,b,c\n1\n2,3,4').rows).toEqual([
      { line: 2, values: { a: '1', b: '', c: '' } },
      { line: 3, values: { a: '2', b: '3', c: '4' } },
    ]);
  });

  it('treats an empty or blank file as having nothing', () => {
    expect(readCsv('')).toEqual({ headers: [], rows: [] });
    expect(readCsv('﻿\n , \n')).toEqual({ headers: [], rows: [] });
  });

  it.each([
    ['a,b\n1,2,3', 2, '3 cells but 2 columns'],
    ['a,b\n1,"open\n\n', 2, 'a quoted cell never ends'],
    ['a,b\n1,x"y"', 2, 'a quote inside an unquoted cell'],
    ['a,A\n1,2', 1, 'column "a" twice'],
    ['a,,b\n1,2,3', 1, 'empty column name'],
  ])('refuses %j at line %d', (text, line, reason) => {
    let error: unknown;
    try {
      readCsv(text);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(CsvFormatError);
    expect(error).toMatchObject({ line, reason });
  });
});

describe('buildDataset', () => {
  const parse = (data: ReturnType<typeof buildDataset>) =>
    Object.fromEntries(
      Object.entries(data.files).map(([file, text]) => [file, readCsv(text)]),
    );

  it('is the same every time, apart from the tag in payment references', () => {
    const a = buildDataset(1, 'X1');
    const b = buildDataset(1, 'X1');
    expect(a.files).toEqual(b.files);
    const c = buildDataset(1, 'Y2');
    expect(c.files['people.csv']).toBe(a.files['people.csv']);
    expect(c.files['investments.csv']).toBe(
      a.files['investments.csv'].replaceAll('-X1-', '-Y2-'),
    );
  });

  it.each([1, 5])(
    'at scale %d, is a valid import with every story',
    (scale) => {
      const data = buildDataset(scale, 'T');
      const csv = parse(data);
      const ids = new Map<string, Set<string>>();
      for (const spec of IMPORT_FILES) {
        const parsed = csv[spec.file];
        if (!parsed) continue;
        expect(parsed.headers.filter((h) => !(h in spec.columns))).toEqual([]);
        expect(
          spec.required.filter((h) => !parsed.headers.includes(h)),
        ).toEqual([]);
        const own = new Set(parsed.rows.map((r) => r.values[spec.idColumn]));
        expect(own.size).toBe(parsed.rows.length);
        ids.set(spec.kind, own); // people name their field officers
        for (const r of parsed.rows) {
          for (const col of spec.required) expect(r.values[col]).not.toBe('');
          for (const [col, kind] of Object.entries(spec.refs ?? {})) {
            if (r.values[col])
              expect(ids.get(kind)?.has(r.values[col])).toBe(true);
          }
        }
      }

      const people = csv['people.csv'].rows.map((r) => r.values);
      expect(people.filter((p) => p.role === 'farmer')).toHaveLength(
        10 * scale,
      );
      expect(people.filter((p) => p.role === 'investor')).toHaveLength(
        20 * scale,
      );
      for (const key of ['phone', 'nid']) {
        expect(new Set(people.map((p) => p[key])).size).toBe(people.length);
      }
      for (const p of people) {
        const report = runIdCheck({
          fullName: p.full_name,
          phone: p.phone,
          nid: p.nid,
          dateOfBirth: p.date_of_birth,
          district: p.district,
          address: p.address,
        });
        expect(report.checks.filter((c) => c.result !== 'pass')).toEqual([]);
      }

      const stories = new Map<string, number>();
      for (const p of data.projects) {
        stories.set(p.story, (stories.get(p.story) ?? 0) + 1);
      }
      expect(stories.size).toBe(9);
      expect([...stories.values()].every((n) => n === scale)).toBe(true);

      // Each project gets at most its 5 slots; references are all different.
      const investments = csv['investments.csv'].rows.map((r) => r.values);
      const slots = new Map<string, number>();
      for (const i of investments) {
        slots.set(i.project_id, (slots.get(i.project_id) ?? 0) + +i.slots);
      }
      expect(Math.max(...slots.values())).toBe(5);
      expect(new Set(investments.map((i) => i.payment_reference)).size).toBe(
        investments.length,
      );
      expect(
        investments.every((i) => i.payment_reference.includes('-T-')),
      ).toBe(true);
    },
  );
});
