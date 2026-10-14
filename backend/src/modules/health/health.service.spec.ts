import { fakeDataSource } from '../../../test/support/unit';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const build = (opts: {
    db?: 'up' | 'down';
    head?: number | 'down' | 'hang';
    indexed?: number | null | 'error';
  }) => {
    const dataSource = fakeDataSource(undefined, {
      query: jest.fn(() =>
        opts.db === 'down'
          ? Promise.reject(new Error('no db'))
          : Promise.resolve([{ '?column?': 1 }]),
      ),
    });
    const contracts = {
      chainId: 31337,
      provider: {
        getBlockNumber: jest.fn(() =>
          opts.head === 'down'
            ? Promise.reject(new Error('ECONNREFUSED'))
            : opts.head === 'hang'
              ? new Promise(() => undefined)
              : Promise.resolve(opts.head ?? 120),
        ),
      },
    };
    const indexer = {
      status: jest.fn(() =>
        opts.indexed === 'error'
          ? Promise.reject(new Error('x'))
          : Promise.resolve({ lastBlock: opts.indexed ?? 100 }),
      ),
    };
    return new HealthService(
      dataSource as never,
      contracts as never,
      indexer as never,
    );
  };

  it('is ok with both up, and reports how far the index lags', async () => {
    await expect(build({}).check()).resolves.toMatchObject({
      status: 'ok',
      database: 'up',
      chain: {
        status: 'up',
        chainId: 31337,
        blockNumber: 120,
        indexedBlock: 100,
        indexerLag: 20,
      },
    });
  });

  it('is degraded when the database is down, without asking the index', async () => {
    const res = await build({ db: 'down' }).check();
    expect(res).toMatchObject({
      status: 'degraded',
      database: 'down',
      chain: { status: 'up', indexedBlock: null, indexerLag: null },
    });
  });

  it('is degraded when the node refuses', async () => {
    await expect(build({ head: 'down' }).check()).resolves.toMatchObject({
      status: 'degraded',
      chain: { status: 'down', blockNumber: null, indexerLag: null },
    });
  });

  it('gives up on a node that does not answer within two seconds', async () => {
    jest.useFakeTimers();
    try {
      const pending = build({ head: 'hang' }).check();
      await jest.advanceTimersByTimeAsync(2000);
      await expect(pending).resolves.toMatchObject({
        status: 'degraded',
        chain: { status: 'down' },
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('never reports a negative lag, and survives an index it cannot read', async () => {
    await expect(build({ indexed: 130 }).check()).resolves.toMatchObject({
      chain: { indexerLag: 0 },
    });
    await expect(build({ indexed: 'error' }).check()).resolves.toMatchObject({
      status: 'ok',
      chain: { indexedBlock: null, indexerLag: null },
    });
  });
});
