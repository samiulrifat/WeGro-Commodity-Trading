/**
 * A transaction's connection runs one query at a time. pg warns when code
 * sends another before the first finishes (pg 9 will throw), and Node prints
 * that warning once per process, where it is easy to miss. The chain suite
 * records it here (global setup) and fails the run with the stack (teardown).
 */
const OVERLAP = /already executing a query/;
const found: string[] = [];

export function watchForOverlap(): void {
  process.on('warning', (warning) => {
    if (OVERLAP.test(warning.message)) found.push(warning.stack ?? '');
  });
}

export function overlapFound(): string[] {
  return found;
}
