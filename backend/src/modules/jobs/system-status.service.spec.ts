import { SystemStatusService } from './system-status.service';

describe('SystemStatusService', () => {
  const build = (
    opts: {
      db?: boolean;
      block?: { number: number; timestamp: number } | null;
      indexed?: number | null;
      failures?: number;
      incident?: { problem: 'indexer-behind'; since: Date } | null;
    } = {},
  ) =>
    new SystemStatusService(
      {
        query: () =>
          opts.db === false
            ? Promise.reject(new Error('down'))
            : Promise.resolve([]),
      } as never,
      {
        chainId: 31337,
        provider: {
          getBlock: () =>
            opts.block === null
              ? Promise.reject(new Error('unreachable'))
              : Promise.resolve(
                  opts.block ?? { number: 500, timestamp: 1_800_000_000 },
                ),
        },
      } as never,
      {
        status: () =>
          Promise.resolve({
            enabled: true,
            running: true,
            lastBlock: opts.indexed === undefined ? 499 : opts.indexed,
            failures: opts.failures ?? 0,
            lastError: opts.failures ? 'boom' : null,
          }),
      } as never,
      {
        allowedLag: 100,
        confirmationBlocks: 1,
        openIncident: () => opts.incident ?? null,
      } as never,
    );

  it('is ok when the node answers and the copy keeps up', async () => {
    const s = await build().status();
    expect(s).toMatchObject({
      status: 'ok',
      database: 'up',
      chain: {
        status: 'up',
        blockNumber: 500,
        ledgerTime: new Date(1_800_000_000_000),
      },
      indexer: { indexedBlock: 499, behind: 0, allowedBehind: 100 },
      incident: null,
    });
  });

  it('is degraded when the copy falls behind, the node is gone, copying fails or an incident is open', async () => {
    expect((await build({ indexed: 300 }).status()).indexer.behind).toBe(199);
    expect((await build({ indexed: 300 }).status()).status).toBe('degraded');
    const gone = await build({ block: null }).status();
    expect(gone).toMatchObject({
      status: 'degraded',
      chain: { status: 'down', blockNumber: null, ledgerTime: null },
      indexer: { behind: null },
    });
    expect((await build({ failures: 3 }).status()).indexer).toMatchObject({
      failures: 3,
      lastError: 'boom',
    });
    expect((await build({ failures: 3 }).status()).status).toBe('degraded');
    const since = new Date();
    expect(
      await build({ incident: { problem: 'indexer-behind', since } }).status(),
    ).toMatchObject({
      status: 'degraded',
      incident: { problem: 'indexer-behind', since },
    });
  });

  it('is down without the database', async () => {
    expect((await build({ db: false }).status()).status).toBe('down');
  });
});
