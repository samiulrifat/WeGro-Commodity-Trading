import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONTRACT_DIR } from './contract';
import { overlapFound } from './pg-overlap';
import { stopTestChain } from './test-chain';

export default function globalTeardown(): void {
  stopTestChain();
  reportContract();
  const stacks = overlapFound();
  if (stacks.length > 0) {
    throw new Error(
      `Queries overlapped on one database connection (run with NODE_OPTIONS=--trace-deprecation for every site):\n${stacks.join('\n')}`,
    );
  }
}

/** Which documented JSON routes the run checked, and which it never reached. */
function reportContract(): void {
  if (!existsSync(CONTRACT_DIR)) return;
  const all = new Set<string>();
  const checked = new Set<string>();
  const undocumented = new Set<string>();
  for (const file of readdirSync(CONTRACT_DIR)) {
    const r = JSON.parse(readFileSync(join(CONTRACT_DIR, file), 'utf8')) as {
      all: string[];
      checked: string[];
      undocumented: string[];
    };
    r.all.forEach((x) => all.add(x));
    r.checked.forEach((x) => checked.add(x));
    r.undocumented.forEach((x) => undocumented.add(x));
  }
  if (all.size === 0) return;
  const missed = [...all].filter((x) => !checked.has(x)).sort();
  console.log(
    `\nOpenAPI contract: ${checked.size} of ${all.size} JSON routes checked against their documented responses.` +
      (missed.length
        ? `\nNot reached by any test:\n  ${missed.join('\n  ')}`
        : '') +
      (undocumented.size
        ? `\nResponses with no documented schema:\n  ${[...undocumented].join('\n  ')}`
        : ''),
  );
}
