import type { INestApplicationContext } from '@nestjs/common';
import { ChainClock } from '../../src/blockchain/chain-clock';
import { ContractsRegistry } from '../../src/blockchain/contracts.registry';

/**
 * Moves the local chain's clock forward and mines a block, then makes the
 * app read the new time at once (its clock shares a reading for a second).
 */
export async function travel(
  app: INestApplicationContext,
  seconds: number,
): Promise<void> {
  const provider = app.get(ContractsRegistry).provider;
  await provider.send('evm_increaseTime', [seconds]);
  await provider.send('evm_mine', []);
  app.get(ChainClock).forget();
}
