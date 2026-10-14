import { existsSync } from 'node:fs';
import { JsonRpcProvider } from 'ethers';

const LOCAL_CHAIN_ID = 31337n;

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
