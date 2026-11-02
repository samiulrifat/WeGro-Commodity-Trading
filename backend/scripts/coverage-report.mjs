// Coverage of all three test kinds together: unit (npm run test:cov), the
// HTTP pipeline (test:e2e --coverage) and every module end to end
// (test:chain:cov). Each writes coverage/<kind>/coverage-final.json; this
// merges them, prints the totals and every line no test runs, and fails
// below the floor. Run by `npm run test:all:cov`.
import { existsSync, readFileSync } from 'node:fs';
import { relative } from 'node:path';
import libCoverage from 'istanbul-lib-coverage';

const KINDS = ['unit', 'e2e', 'chain'];
// Every line and function run by some test; branches as high as sensible.
// Statements just short of every one: the rest are fallbacks sharing a line
// with code that runs (`a ?? b`, `if (x) return y;`).
const FLOOR = { lines: 100, statements: 99, functions: 100, branches: 90 };

// Not counted: code generated from the contracts, and migrations, which
// every chain run applies to its database before the tests start (in a
// process Jest does not measure).
const SKIP = [
  /\/src\/blockchain\/generated\//,
  /\/src\/database\/migrations\//,
];

const map = libCoverage.createCoverageMap({});
for (const kind of KINDS) {
  const file = `coverage/${kind}/coverage-final.json`;
  if (!existsSync(file)) {
    console.error(`Missing ${file}: run that kind with coverage first.`);
    process.exit(1);
  }
  map.merge(JSON.parse(readFileSync(file, 'utf8')));
}
map.filter((f) => !SKIP.some((s) => s.test(f)));

// Not counted either: branches the compiler made up. Decorator metadata for
// an imported parameter or return type compiles (isolatedModules) to
// `typeof X === "function" ? X : Object`, mapped back onto the type
// annotation. Every ternary someone wrote contains a "?"; those do not.
for (const file of map.files()) {
  const data = map.fileCoverageFor(file).data;
  const src = readFileSync(file, 'utf8').split('\n');
  for (const [id, branch] of Object.entries(data.branchMap)) {
    if (branch.type !== 'cond-expr') continue;
    if (!textAt(src, branch.loc).includes('?')) {
      delete data.branchMap[id];
      delete data.b[id];
    }
  }
}

/** The source text a coverage location spans. */
function textAt(src, { start, end }) {
  if (start.line === end.line)
    return src[start.line - 1].slice(start.column, end.column ?? undefined);
  return [
    src[start.line - 1].slice(start.column),
    ...src.slice(start.line, end.line - 1),
    src[end.line - 1].slice(0, end.column ?? undefined),
  ].join('\n');
}

const total = map.getCoverageSummary();
const missing = [];
for (const file of map.files().sort()) {
  const fc = map.fileCoverageFor(file);
  const lines = fc.getUncoveredLines();
  if (lines.length)
    missing.push(`${relative(process.cwd(), file)}: ${ranges(lines)}`);
}

/** 3,4,5,9 -> "3-5, 9" */
function ranges(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const start = Number(lines[i]);
    let end = start;
    while (i + 1 < lines.length && Number(lines[i + 1]) === end + 1)
      end = Number(lines[++i]);
    out.push(start === end ? `${start}` : `${start}-${end}`);
  }
  return out.join(', ');
}

if (missing.length) {
  console.log('Lines no test runs:');
  for (const m of missing) console.log(`  ${m}`);
}
let low = false;
for (const key of Object.keys(FLOOR)) {
  const pct = total[key].pct;
  const ok = pct >= FLOOR[key];
  if (!ok) low = true;
  console.log(
    `${key.padEnd(10)} ${String(pct).padStart(6)}%  (${total[key].covered}/${total[key].total})  floor ${FLOOR[key]}%${ok ? '' : '  BELOW'}`,
  );
}
process.exit(low ? 1 : 0);
