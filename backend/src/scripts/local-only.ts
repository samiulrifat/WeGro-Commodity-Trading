import { existsSync } from 'node:fs';
import { JsonRpcProvider } from 'ethers';

const LOCAL_CHAIN_ID = 31337n;
/** Further apart than this, the ledger's clock and real time count as different. */
const CLOCK_SLACK_SECONDS = 60;

/** Reads .env into process.env (values already set win), as the app does. */
export function loadEnv(): void {
  if (existsSync('.env')) process.loadEnvFile('.env');
}

/**
 * Refuses unless this is a local development setup: NODE_ENV is not
 * production and the node is the local Hardhat chain. Sample people and
 * resets must never reach a real ledger or database.
 */
export async function assertLocal(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refused: NODE_ENV is production');
  }
  const url = process.env.CHAIN_RPC_URL ?? 'http://127.0.0.1:8545';
  const provider = new JsonRpcProvider(url, undefined, { staticNetwork: true });
  try {
    const { chainId } = await provider.getNetwork();
    if (chainId !== LOCAL_CHAIN_ID) {
      throw new Error(
        `Refused: chain ${chainId} at ${url} is not the local Hardhat node (${LOCAL_CHAIN_ID})`,
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Refused'))
      throw error;
    throw new Error(
      `Cannot reach the node at ${url}: start it with npx hardhat node`,
    );
  } finally {
    provider.destroy();
  }
}

/**
 * Brings the local chain's clock up to real time once its data is in: the dev
 * chain starts in the past so the sample data's stories can run. A clock can
 * only go forward, so one ahead (sample data loaded again on the same chain,
 * or a chain not started as the dev chain) is reported instead: dates up to
 * it count as past until the chain is started anew.
 */
export async function bringClockToNow(
  log: (message: string) => void,
): Promise<void> {
  const url = process.env.CHAIN_RPC_URL ?? 'http://127.0.0.1:8545';
  const provider = new JsonRpcProvider(url, undefined, { staticNetwork: true });
  try {
    const latest = await provider.getBlock('latest');
    const now = Math.floor(Date.now() / 1000);
    const behind = now - latest!.timestamp;
    if (behind > CLOCK_SLACK_SECONDS) {
      await provider.send('evm_setNextBlockTimestamp', [now]);
      await provider.send('evm_mine', []);
    } else if (behind < -CLOCK_SLACK_SECONDS) {
      const days = Math.round(-behind / 86_400);
      log(
        `Warning: the ledger's clock is about ${days} day(s) ahead of real time and cannot go back, so earlier dates count as past. For today's date, start a new chain: npm run dev:stop, then npm run dev (at the project root; this resets the data).`,
      );
    }
  } finally {
    provider.destroy();
  }
}
