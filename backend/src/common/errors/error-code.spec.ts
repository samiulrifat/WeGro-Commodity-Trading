import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ErrorCode } from './error-code';

/**
 * Every refusal must carry a code from ErrorCode, so the app can word it in
 * the reader's language. Checked on the source, as no test can reach every
 * throw.
 */
const SRC = join(__dirname, '../..');

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'generated' ? [] : sources(path);
    }
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

/** Each `new SomethingException(...)` expression, arguments included. */
function exceptions(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/new \w+Exception\(/g)) {
    let depth = 0;
    let quote: string | null = null;
    for (let i = m.index + m[0].length - 1; i < text.length; i++) {
      const c = text[i];
      if (quote) {
        if (c === '\\') i++;
        else if (c === quote) quote = null;
      } else if (c === "'" || c === '"' || c === '`') quote = c;
      else if (c === '(') depth++;
      else if (c === ')' && --depth === 0) {
        out.push(text.slice(m.index, i + 1));
        break;
      }
    }
  }
  return out;
}

describe('error codes', () => {
  const files = sources(SRC).map((path) => ({
    file: relative(SRC, path),
    text: readFileSync(path, 'utf8'),
  }));
  const list = 'common/errors/error-code.ts';

  it('are carried by every error the backend throws', () => {
    const uncoded: string[] = [];
    for (const { file, text } of files) {
      for (const expr of exceptions(text)) {
        const args = expr.slice(expr.indexOf('(') + 1, -1).trim();
        const bare = args === '' || /^['"`]/.test(args);
        const objectWithout = args.startsWith('{') && !/\bcode:/.test(args);
        if (bare || objectWithout) {
          uncoded.push(`${file}: ${expr.replace(/\s+/g, ' ').slice(0, 90)}`);
        }
      }
    }
    expect(uncoded).toEqual([]);
  });

  it('are always taken from the list, never written as text', () => {
    const literal = files
      .filter(({ file }) => file !== list)
      .flatMap(({ file, text }) =>
        [...text.matchAll(/\bcode:\s*['"`][A-Z][A-Z_]+['"`]/g)].map(
          (m) => `${file}: ${m[0]}`,
        ),
      );
    expect(literal).toEqual([]);
  });

  it('are each used somewhere, and named after their value', () => {
    const code = files
      .filter(({ file }) => file !== list)
      .map(({ text }) => text)
      .join('\n');
    const unused = Object.keys(ErrorCode).filter(
      (name) => !code.includes(`ErrorCode.${name}`),
    );
    expect(unused).toEqual([]);
    for (const [name, value] of Object.entries(ErrorCode)) {
      expect(value).toMatch(/^[A-Z][A-Z0-9_]*$/);
      expect({ name, value }).toEqual({ name: value, value });
    }
  });
});
