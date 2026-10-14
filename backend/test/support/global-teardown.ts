import { overlapFound } from './pg-overlap';

export default function globalTeardown(): void {
  const stacks = overlapFound();
  if (stacks.length > 0) {
    throw new Error(
      `Queries overlapped on one database connection (run with NODE_OPTIONS=--trace-deprecation for every site):\n${stacks.join('\n')}`,
    );
  }
}
