import { rmSync } from 'node:fs';
import { CONTRACT_DIR } from './contract';
import { watchForOverlap } from './pg-overlap';

export default function globalSetup(): void {
  watchForOverlap();
  rmSync(CONTRACT_DIR, { recursive: true, force: true });
}
