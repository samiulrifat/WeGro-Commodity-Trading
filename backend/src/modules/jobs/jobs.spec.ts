import { ContractRevertException } from '../../blockchain/errors/contract-errors';
import type { TxResult } from '../../blockchain/tx/transaction.service';
import { ExpiryJob } from '../../common/jobs/expiry-job';
import {
  PartialJobFailure,
  SCHEDULED_JOB,
} from '../../common/jobs/scheduled-job';
import { IndexerWatchdogJob } from './indexer-watchdog.job';
import { JobScheduler } from './job-scheduler';

// --- Expiry draining ---------------------------------------------------------

class FakeExpiry extends ExpiryJob<number> {
  readonly due = new Set<number>();
  /** Ids the ledger refuses (not due yet by its clock). */
  readonly refused = new Set<number>();
  readonly broken = new Set<number>();
  queries = 0;

  constructor() {
    super(
      'FakeExpiry',
      { now: async () => new Date() } as never,
      { apply: async () => undefined } as never,
    );
  }

  protected async dueIds(_now: Date, limit: number): Promise<number[]> {
    this.queries++;
    return [...this.due].sort((a, b) => a - b).slice(0, limit);
  }

  protected async expire(id: number): Promise<TxResult> {
    if (this.broken.has(id)) throw new Error(`node lost ${id}`);
    if (this.refused.has(id)) {
      throw new ContractRevertException({
        name: 'DealNotYetDue',
        args: {},
      } as never);
    }
    this.due.delete(id);
    return {} as TxResult;
  }
}

describe('expiry jobs', () => {
  it('clear a whole backlog in one run, in batches', async () => {
    const job = new FakeExpiry();
    for (let i = 1; i <= 250; i++) job.due.add(i);
    await expect(job.run()).resolves.toBe(250);
    expect(job.due.size).toBe(0);
    expect(job.queries).toBe(3); // 100 + 100 + 50
  });

  it('stop when a batch makes no progress, instead of looping', async () => {
    const job = new FakeExpiry();
    for (let i = 1; i <= 150; i++) {
      job.due.add(i);
      if (i <= 100) job.refused.add(i);
    }
    await expect(job.run()).resolves.toBe(0);
    expect(job.queries).toBe(1);
  });

  it('report items that failed, with how many were released', async () => {
    const job = new FakeExpiry();
    for (let i = 1; i <= 5; i++) job.due.add(i);
    job.broken.add(3);
    const error = (await job
      .run()
      .catch((e: unknown) => e)) as PartialJobFailure;
    expect(error).toBeInstanceOf(PartialJobFailure);
    expect(error.handled).toBe(4);
    expect(error.message).toContain('node lost 3');
  });
});

// --- Scheduler ---------------------------------------------------------------

function scheduler(jobs: Array<{ name: string; run: () => Promise<number> }>) {
  const inserted: unknown[] = [];
  const providers = jobs.map((j) => {
    class Job {}
    Reflect.defineMetadata(
      SCHEDULED_JOB,
      { name: j.name, description: j.name, every: 'EXPIRY_SWEEP_MS' },
      Job,
    );
    return { instance: { run: j.run }, metatype: Job };
  });
  const s = new JobScheduler(
    {
      get: (key: string) => (key === 'JOBS_ENABLED' ? true : 1_000),
    } as never,
    { getProviders: () => providers } as never,
    {
      get: (key: string, target: object) => Reflect.getMetadata(key, target),
    } as never,
    { insert: async (row: unknown) => void inserted.push(row) } as never,
    { names: async () => new Map() } as never,
  );
  return { s, inserted };
}

describe('job scheduler', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('schedules the next run only when the last one has finished', async () => {
    let calls = 0;
    let finish: (n: number) => void = () => undefined;
    const { s } = scheduler([
      {
        name: 'slow',
        run: () => {
          calls++;
          return new Promise<number>((r) => (finish = r));
        },
      },
    ]);
    s.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(1_000); // first run starts
    expect(calls).toBe(1);
    await jest.advanceTimersByTimeAsync(10_000); // still running: no overlap
    expect(calls).toBe(1);
    finish(0);
    await jest.advanceTimersByTimeAsync(1_000); // next run, one interval later
    expect(calls).toBe(2);
    finish(0);
    await s.onApplicationShutdown();
  });

  it('keeps runs that did something or failed, and refuses a second manual run', async () => {
    let fail = false;
    let release: () => void = () => undefined;
    const { s, inserted } = scheduler([
      {
        name: 'work',
        run: async () => {
          if (fail) throw new Error('boom');
          return 0;
        },
      },
      {
        name: 'busy',
        run: () => new Promise<number>((r) => (release = () => r(1))),
      },
    ]);
    s.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(1_000); // 'work' runs quietly
    expect(inserted).toHaveLength(0);
    fail = true;
    await jest.advanceTimersByTimeAsync(1_000);
    expect(inserted).toEqual([
      expect.objectContaining({
        job: 'work',
        outcome: 'failed',
        error: 'boom',
      }),
    ]);

    // 'busy' started on schedule and is still going: a manual run is refused.
    const actor = { id: 'u' } as never;
    await expect(s.runNow('busy', actor)).rejects.toMatchObject({
      response: { code: 'JOB_RUNNING' },
    });
    release();
    await jest.advanceTimersByTimeAsync(0);
    const manual = s.runNow('busy', actor);
    release();
    await expect(manual).resolves.toMatchObject({
      trigger: 'manual',
      outcome: 'ok',
      items: 1,
    });
    expect(inserted).toContainEqual(
      expect.objectContaining({ job: 'busy', trigger: 'manual', items: 1 }),
    );
    await expect(s.runNow('nope', actor)).rejects.toThrow('No job named nope');
    await s.onApplicationShutdown();
  });
});

// --- Watchdog ----------------------------------------------------------------

function watchdog() {
  const state = {
    head: 500,
    lastBlock: 495 as number | null,
    failures: 0,
    nodeDown: false,
  };
  const sent: Array<{ key: string; title: string }> = [];
  const job = new IndexerWatchdogJob(
    { get: (k: string) => (k === 'WATCHDOG_LAG_BLOCKS' ? 100 : 0) } as never,
    { manager: {} } as never,
    {
      provider: {
        getBlockNumber: async () => {
          if (state.nodeDown) throw new Error('ECONNREFUSED');
          return state.head;
        },
      },
    } as never,
    {
      status: async () => ({
        enabled: true,
        running: true,
        lastBlock: state.lastBlock,
        failures: state.failures,
        lastError: state.failures ? 'db down' : null,
      }),
    } as never,
    {
      withRole: async () => ['admin'],
      send: async (
        _m: unknown,
        _to: unknown,
        note: { key: string; title: string },
      ) => {
        sent.push(note);
        return 1;
      },
    } as never,
  );
  return { job, state, sent };
}

describe('indexer watchdog', () => {
  it('tells admins once per incident, and again when it is resolved', async () => {
    const { job, state, sent } = watchdog();
    await expect(job.run()).resolves.toBe(0); // 5 blocks behind: fine

    state.head = 900;
    await expect(job.run()).resolves.toBe(1);
    await expect(job.run()).resolves.toBe(0); // same incident: no repeat
    expect(sent[0].title).toBe('The database is falling behind the ledger');

    state.lastBlock = 899;
    await expect(job.run()).resolves.toBe(1);
    expect(sent[1].title).toMatch(/^Resolved: /);
  });

  it('distinguishes an unreachable node from a failing indexer', async () => {
    const { job, state, sent } = watchdog();
    state.nodeDown = true;
    await job.run();
    expect(sent.map((n) => n.title)).toEqual([
      'The blockchain node cannot be reached',
    ]);
    state.nodeDown = false;
    state.failures = 3;
    await job.run();
    expect(sent.map((n) => n.title).slice(1)).toEqual([
      'Resolved: the blockchain node cannot be reached',
      'Copying ledger events into the database keeps failing',
    ]);
  });
});
