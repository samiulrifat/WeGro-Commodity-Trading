import { JsonRpcProvider } from 'ethers';

/**
 * Where a throwaway schema starts indexing: the block after the current head.
 * Earlier blocks belong to other runs' schemas; replaying them would only make
 * every run slower than the last (the node is shared and only grows).
 */
export async function indexFromHere(rpcUrl?: string): Promise<string> {
  const provider = new JsonRpcProvider(
    rpcUrl ?? process.env.CHAIN_RPC_URL ?? 'http://127.0.0.1:8545',
  );
  try {
    return String((await provider.getBlockNumber()) + 1);
  } finally {
    provider.destroy();
  }
}
