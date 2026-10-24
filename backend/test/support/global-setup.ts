import { rmSync } from 'node:fs';
import { CONTRACT_DIR } from './contract';
import { watchForOverlap } from './pg-overlap';
import { startTestChain } from './test-chain';

export default async function globalSetup(): Promise<void> {
  watchForOverlap();
  rmSync(CONTRACT_DIR, { recursive: true, force: true });
  await startTestChain();
}
