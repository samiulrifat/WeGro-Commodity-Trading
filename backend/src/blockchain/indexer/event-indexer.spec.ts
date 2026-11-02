import type { Block, Log } from 'ethers';
import { EventIndexerService } from './event-indexer.service';

/**
 * The indexer against a scripted node and an in-memory checkpoint: how it
 * walks ranges, fetches blocks and recovers. Decoding and the read models
 * are covered by the chain suite.
 */
type Checkpoint = { lastBlock: number; lastBlockHash: string } | null;

function setup(opts: {
  batch: number;
  head: number;
  /** CHAIN_START_BLOCK; undefined makes the indexer search for it. */
  start?: number;
  /** Where the AccessRegistry's code first appears, for that search. */
  deployedAt?: number;
  codeFails?: boolean;
  pollMs?: number;
  /** Blocks indexed before senders were kept. */
  unsent?: number[];
  missingBlock?: number;
}) {
  let unsent = opts.unsent ?? [];
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
      if (n === opts.missingBlock) return null;
      return {
        hash: `0xhash${n}`,
        timestamp: 1,
        prefetchedTransactions: [],
      } as unknown as Block;
    }),
    getCode: jest.fn((_address: string, block: number) =>
      opts.codeFails
        ? Promise.reject(new Error('method not supported'))
        : Promise.resolve(block >= (opts.deployedAt ?? 0) ? '0x60' : '0x'),
    ),
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
    // Blocks still without senders, once; then nothing to fill in.
    query: jest.fn((sql: string) => {
      if (!sql.trimStart().startsWith('SELECT DISTINCT'))
        return Promise.resolve([]);
      const rows = unsent.map((n) => ({ block_number: String(n) }));
      unsent = [];
      return Promise.resolve(rows);
    }),
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
        INDEXER_POLL_MS: opts.pollMs ?? 1000,
        INDEXER_BATCH_BLOCKS: opts.batch,
        INDEXER_CONFIRMATIONS: 0,
        CHAIN_START_BLOCK: 'start' in opts ? opts.start : 1,
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
    logger: {
      error: (message: string) => void;
      warn: (message: string) => void;
      log: (message: string) => void;
    };
  };
  const errors = jest
    .spyOn(logger, 'error')
    .mockImplementation(() => undefined);
  const warnings = jest
    .spyOn(logger, 'warn')
    .mockImplementation(() => undefined);
  jest.spyOn(logger, 'log').mockImplementation(() => undefined);
  return {
    indexer,
    provider,
    handlers,
    checkpoint,
    maxInFlight: () => maxInFlight,
    failTicks: (n: number) => (failingTicks = n),
    errors,
    warnings,
    dataSource,
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
  it('starts at the block the registry was deployed in, found by halving', async () => {
    const { indexer, provider } = setup({
      batch: 100,
      head: 1000,
      start: undefined,
      deployedAt: 637,
    });
    await indexer.tick();
    expect(provider.getLogs.mock.calls[0][0]).toMatchObject({
      fromBlock: 637,
    });
    // log2(1000) probes, not one per block.
    expect(provider.getCode.mock.calls.length).toBeLessThanOrEqual(11);
  });

  it('starts at block 0 when the node cannot answer the search, and says so', async () => {
    const { indexer, provider, warnings } = setup({
      batch: 100,
      head: 50,
      start: undefined,
      codeFails: true,
    });
    await indexer.tick();
    expect(provider.getLogs.mock.calls[0][0]).toMatchObject({ fromBlock: 0 });
    expect(warnings).toHaveBeenCalledWith(
      expect.stringContaining('indexing from block 0'),
    );
  });

  it('fills in missing senders before going on', async () => {
    const { indexer, provider, dataSource } = setup({
      batch: 100,
      head: 20,
      unsent: [3, 4],
    });
    await expect(indexer.tick()).resolves.toBe(1);
    expect(provider.getLogs).not.toHaveBeenCalled();
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE chain_event'),
      expect.any(Array),
    );
    await expect(indexer.tick()).resolves.toBe(20);
  });

  it('stops when a block to fill in is no longer on the node', async () => {
    const { indexer } = setup({
      batch: 100,
      head: 20,
      unsent: [7],
      missingBlock: 7,
    });
    await expect(indexer.tick()).rejects.toThrow('Block 7 not available');
  });

  it('stops cleanly while a run in progress fails', async () => {
    const { indexer, failTicks } = setup({ batch: 100, head: 250 });
    failTicks(1);
    const run = indexer.tick();
    await expect(indexer.stop()).resolves.toBeUndefined();
    await expect(run).rejects.toThrow('socket hang up');
  });

  it('runs on its own, backing off after failures and carrying on once they stop', async () => {
    const { indexer, checkpoint, failTicks, errors } = setup({
      batch: 100,
      head: 250,
      pollMs: 5,
    });
    failTicks(2);
    indexer.start();
    indexer.start(); // already running: nothing more
    for (let i = 0; i < 400 && checkpoint.current?.lastBlock !== 250; i++) {
      await new Promise((r) => setTimeout(r, 5));
    }
    await indexer.stop();
    expect(checkpoint.current?.lastBlock).toBe(250);
    expect(errors.mock.calls.map(([m]) => m)).toEqual([
      'Indexing failed (retry in 10ms): socket hang up',
      'Indexing failed (retry in 20ms): socket hang up',
    ]);
    await expect(indexer.status()).resolves.toMatchObject({
      running: false,
      failures: 0,
      lastError: null,
    });
  });
});
