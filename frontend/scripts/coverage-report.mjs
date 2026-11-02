// Coverage of the unit tests (vitest, coverage/unit) and the browser runs
// (E2E_COVERAGE=1 playwright, coverage/e2e-raw) together. The browser's V8
// coverage is mapped back to the source files with the same converter
// vitest uses (ast-v8-to-istanbul), so both count the same statements and
// branches; then the totals, every line no test runs, and the floor are
// printed. Run by `npm run test:all:cov`.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { convert } from 'ast-v8-to-istanbul';
import libCoverage from 'istanbul-lib-coverage';
import { parseAstAsync } from 'vite';

// Every line run by some test; branches as high as sensible.
const FLOOR = { lines: 100, statements: 100, functions: 100, branches: 90 };

// Not counted: generated code (the route table, and the API client made
// from the backend's OpenAPI document), the shadcn components kept for
// screens to come but used by no page yet (take one off this list once a
// page uses it), and the tests' own helpers.
const SKIP = [
  /\/src\/routeTree\.gen\.ts$/,
  /\/src\/api\/generated\//,
  /\/src\/components\/ui\/(calendar|pagination|popover|scroll-area|skeleton)\.tsx$/,
  /\/src\/test\//,
  /\.test\.tsx?$/,
];

const RAW = 'coverage/e2e-raw';
const UNIT = 'coverage/unit/coverage-final.json';
for (const need of [RAW, UNIT]) {
  if (!existsSync(need)) {
    console.error(`Missing ${need}: run that kind with coverage first.`);
    process.exit(1);
  }
}

const INLINE_MAP =
  /\/\/# sourceMappingURL=data:application\/json;base64,([A-Za-z0-9+/=]+)\s*$/;

// What code there is comes from the unit run: it lists every source file.
// The browser runs add their hits to the same statements, functions and
// branches. The dev server's own additions (React Refresh signatures,
// rewritten imports) have no counterpart there and are left out.
const unit = JSON.parse(readFileSync(UNIT, 'utf8'));
const key = (loc) =>
  `${loc.start.line}:${loc.start.column}-${loc.end.line}:${loc.end.column}`;
const lines = (loc) => `${loc.start.line}-${loc.end.line}`;
const index = new Map();
const indexOf = (file) => {
  if (!index.has(file)) {
    const d = unit[file];
    const by = (m, loc) =>
      new Map(Object.entries(m).map(([id, v]) => [key(loc(v)), id]));
    index.set(
      file,
      d && {
        s: by(d.statementMap, (v) => v),
        sLines: Map.groupBy(Object.keys(d.statementMap), (id) =>
          lines(d.statementMap[id]),
        ),
        f: by(d.fnMap, (v) => v.loc),
        b: by(d.branchMap, (v) => v.locations[0] ?? v.loc),
      },
    );
  }
  return index.get(file);
};
function addHits(file, e2e) {
  const at = indexOf(file);
  if (!at) return;
  const d = unit[file];
  for (const [id, n] of Object.entries(e2e.s)) {
    const loc = e2e.statementMap[id];
    // A call through an import the dev server rewrote (hooks, mostly)
    // starts at another column: the one statement on the same lines.
    const sameLines = at.sLines.get(lines(loc));
    const to =
      at.s.get(key(loc)) ?? (sameLines?.length === 1 ? sameLines[0] : null);
    if (to) d.s[to] += n;
  }
  for (const [id, n] of Object.entries(e2e.f)) {
    const to = at.f.get(key(e2e.fnMap[id].loc));
    if (to) d.f[to] += n;
  }
  for (const [id, counts] of Object.entries(e2e.b)) {
    const b = e2e.branchMap[id];
    const to = at.b.get(key(b.locations[0] ?? b.loc));
    if (to && d.b[to].length === counts.length)
      counts.forEach((n, i) => (d.b[to][i] += n));
  }
}

// Each raw file holds one test's modules as the dev server sent them, with
// the inline source map back to src/.
for (const file of readdirSync(RAW)) {
  for (const entry of JSON.parse(readFileSync(`${RAW}/${file}`, 'utf8'))) {
    const inline = INLINE_MAP.exec(entry.source);
    if (!inline) continue;
    const served = resolve('.' + new URL(entry.url).pathname);
    const converted = await convert({
      ast: parseAstAsync(entry.source),
      code: entry.source,
      wrapperLength: 0,
      coverage: {
        url: pathToFileURL(served).href,
        functions: entry.functions,
      },
      sourceMap: JSON.parse(Buffer.from(inline[1], 'base64').toString()),
    });
    // As vitest's file has it: an open end (Infinity) as null. A route's
    // split-off part ("page.tsx?tsr-split=component") counts for its file.
    for (const [path, data] of Object.entries(
      JSON.parse(JSON.stringify(converted)),
    ))
      addHits(path.replace(/\?.*$/, ''), data);
  }
}
const map = libCoverage.createCoverageMap(unit);
map.filter((f) => !SKIP.some((s) => s.test(f)));

const total = map.getCoverageSummary();
const missing = [];
for (const file of map.files().sort()) {
  const lines = map.fileCoverageFor(file).getUncoveredLines();
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
