import type { Block, Log } from 'ethers';
import { EventIndexerService } from './event-indexer.service';

/**
 * The indexer against a scripted node and an in-memory checkpoint: how it
 * walks ranges, fetches blocks and recovers. Decoding and the read models
 * are covered by the chain suite.
 */
type Checkpoint = { lastBlock: number; lastBlockHash: string } | null;

function setup(opts: { batch: number; head: number }) {
  const checkpoint: { current: Checkpoint } = { current: null };
  let inFlight = 0;
  let maxInFlight = 0;
  let failingTicks = 0;
  let failing = false;
  const getLogs = jest.fn(
    ({ fromBlock, toBlock }: { fromBlock: number; toBlock: number }) => {
      failing = failingTicks > 0;
      if (failing) failingTicks--;
      // A platform event in every block, like the local chain.
      const logs: Partial<Log>[] = [];
      for (let n = fromBlock; n <= toBlock; n++) {
        logs.push({ blockNumber: n, address: '0xunknown' });
      }
      return Promise.resolve(logs);
    },
  );
  const provider = {
    getBlockNumber: jest.fn(() => Promise.resolve(opts.head)),
    getLogs,
    getBlock: jest.fn(async (n: number) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setImmediate(r));
      inFlight--;
      if (failing) throw new Error('socket hang up');
      return {
        hash: `0xhash${n}`,
        timestamp: 1,
        prefetchedTransactions: [],
      } as unknown as Block;
    }),
    getCode: jest.fn(() => Promise.resolve('0x60')),
  };
  const manager = {
    save: jest.fn((_entity: unknown, row: Checkpoint) => {
      checkpoint.current = row;
      return Promise.resolve(row);
    }),
    clear: jest.fn(() => Promise.resolve()),
    delete: jest.fn(() => {
      checkpoint.current = null;
      return Promise.resolve();
    }),
  };
  const dataSource = {
    query: jest.fn(() => Promise.resolve([])), // no senders to fill in
    getRepository: () => ({
      findOneBy: () => Promise.resolve(checkpoint.current),
    }),
    transaction: jest.fn((work: (m: typeof manager) => Promise<unknown>) =>
      work(manager),
    ),
  };
  const config = {
    get: (key: string) =>
      ({
        INDEXER_ENABLED: false,
        INDEXER_POLL_MS: 1000,
        INDEXER_BATCH_BLOCKS: opts.batch,
        INDEXER_CONFIRMATIONS: 0,
        CHAIN_START_BLOCK: 1,
      })[key],
  };
  const registry = {
    provider,
    addresses: () => ['0xa'],
    byContractAddress: () => undefined,
    info: () => ({ address: '0xa' }),
  };
  const handlers = {
    handlersFor: () => [],
    resetAll: jest.fn(() => Promise.resolve()),
  };
  const indexer = new EventIndexerService(
    config as never,
    registry as never,
    handlers as never,
    dataSource as never,
  );
  // Quiet: failures are expected here.
  const { logger } = indexer as unknown as {
    logger: { error: (message: string) => void };
  };
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);
  return {
    indexer,
    provider,
    handlers,
    checkpoint,
    maxInFlight: () => maxInFlight,
    failTicks: (n: number) => (failingTicks = n),
  };
}

describe('EventIndexerService', () => {
  it('walks the chain in ranges, checkpointing the last block and its hash', async () => {
    const { indexer, checkpoint } = setup({ batch: 100, head: 250 });
    await expect(indexer.tick()).resolves.toBe(100);
    expect(checkpoint.current).toEqual({
      id: 'main',
      lastBlock: 100,
      lastBlockHash: '0xhash100',
    });
    await indexer.catchUp();
    expect(checkpoint.current?.lastBlock).toBe(250);
    await expect(indexer.tick()).resolves.toBe(0);
  });

  it('never has more than 400 block fetches in flight, however long the range', async () => {
    const { indexer, provider, maxInFlight } = setup({
      batch: 2000,
      head: 2000,
    });
    await indexer.tick();
    expect(provider.getBlock).toHaveBeenCalledTimes(2000);
    expect(maxInFlight()).toBe(400);
  });

  it('halves the range after a failure and grows it back after successes', async () => {
    const { indexer, provider, failTicks } = setup({ batch: 800, head: 5000 });
    const ranges = () =>
      provider.getLogs.mock.calls.map(
        ([r]: [{ fromBlock: number; toBlock: number }]) =>
          r.toBlock - r.fromBlock + 1,
      );
    failTicks(2);
    await expect(indexer.tick()).rejects.toThrow('socket hang up');
    await expect(indexer.tick()).rejects.toThrow('socket hang up');
    await expect(indexer.tick()).resolves.toBe(200);
    await expect(indexer.tick()).resolves.toBe(400);
    await expect(indexer.tick()).resolves.toBe(800);
    await expect(indexer.tick()).resolves.toBe(800);
    expect(ranges()).toEqual([800, 400, 200, 400, 800, 800]);
  });

  it('rebuilds from scratch when the checkpointed block changed on chain', async () => {
    const { indexer, handlers, checkpoint } = setup({ batch: 100, head: 50 });
    checkpoint.current = { lastBlock: 40, lastBlockHash: '0xstale' };
    await expect(indexer.tick()).resolves.toBe(1);
    expect(handlers.resetAll).toHaveBeenCalledTimes(1);
    expect(checkpoint.current).toBeNull();
    await indexer.catchUp();
    expect(checkpoint.current?.lastBlock).toBe(50);
  });
});
