import { ConflictException } from '@nestjs/common';
import { actor, fakeRepo, Role } from '../../../../test/support/unit';
import type { VerificationRun } from '../entities/verification-run.entity';
import { SweepService } from './sweep.service';

describe('SweepService', () => {
  const auditor = actor(Role.Auditor);

  /**
   * `table` -> its ids; pages are served by keyset like the database would
   * (ids after the cursor, in order, 500 at most).
   */
  const build = (
    tables: Record<string, string[]>,
    verdicts: (type: string, id: string) => Promise<string[]> = () =>
      Promise.resolve([]),
  ) => {
    const runs = new Map<string, VerificationRun>();
    const findings: Array<{
      type: string;
      recordId: string;
      mismatches: string[];
    }> = [];
    const pageCalls: Array<[string, string]> = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const query = jest.fn((sql: string, [cursor]: [string]) => {
      const table = /FROM (\w+)/.exec(sql)![1];
      pageCalls.push([table, cursor]);
      const ids = (tables[table] ?? [])
        .filter((id) => id > cursor)
        .sort()
        .slice(0, 500);
      return Promise.resolve(ids.map((id) => ({ id })));
    });
    const runsRepo = fakeRepo({
      save: jest.fn(
        (r: VerificationRun) => (runs.set(r.id, { ...r }), Promise.resolve(r)),
      ),
      update: jest.fn(
        (
          where: string | { status: string },
          patch: Partial<VerificationRun>,
        ) => {
          if (typeof where === 'string') Object.assign(runs.get(where)!, patch);
          else
            for (const r of runs.values())
              if (r.status === where.status) Object.assign(r, patch);
          return Promise.resolve({ affected: 1 });
        },
      ),
      findOneBy: jest.fn(({ id }: { id: string }) =>
        Promise.resolve(runs.get(id) ?? null),
      ),
    });
    const verifier = {
      verify: jest.fn(async (type: string, id: string) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setImmediate(r));
        inFlight--;
        return { mismatches: await verdicts(type, id) };
      }),
    };
    const service = new SweepService(
      { query } as never,
      runsRepo as never,
      fakeRepo({
        insert: jest.fn(
          (rows: typeof findings) => (
            findings.push(...rows),
            Promise.resolve({})
          ),
        ),
      }) as never,
      verifier as never,
      { names: () => Promise.resolve(new Map()) } as never,
    );
    const quiet = service as unknown as {
      logger: { log: () => void; error: () => void };
    };
    jest.spyOn(quiet.logger, 'log').mockImplementation(() => undefined);
    jest.spyOn(quiet.logger, 'error').mockImplementation(() => undefined);
    return {
      service,
      runs,
      findings,
      pageCalls,
      verifier,
      maxInFlight: () => maxInFlight,
      runsRepo,
    };
  };

  const uuid = (n: number) =>
    `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

  it('checks every record of every type and keeps only those that differ', async () => {
    const { service, runs, findings } = build(
      {
        projects: [uuid(1), uuid(2)],
        offers: ['3', '4'],
        warehouse_receipts: ['0x' + 'ab'.repeat(32) + '  '],
      },
      (type, id) =>
        Promise.resolve(type === 'offer' && id === '4' ? ['status'] : []),
    );
    const run = await service.start(auditor);
    expect(run.status).toBe('running');
    await service.idle();
    expect(runs.get(run.id)).toMatchObject({
      status: 'done',
      checked: 5,
      mismatched: 1,
    });
    expect(findings).toEqual([
      { runId: run.id, type: 'offer', recordId: '4', mismatches: ['status'] },
    ]);
  });

  it('pages by keyset, at most eight checks at a time', async () => {
    const ids = Array.from({ length: 1200 }, (_, i) => uuid(i + 1));
    const { service, pageCalls, verifier, maxInFlight } = build({
      field_records: ids,
    });
    await service.start(auditor);
    await service.idle();
    expect(verifier.verify).toHaveBeenCalledTimes(1200);
    expect(maxInFlight()).toBe(8);
    expect(
      pageCalls.filter(([t]) => t === 'field_records').map(([, c]) => c),
    ).toEqual([
      '00000000-0000-0000-0000-000000000000',
      ids[499],
      ids[999],
      ids[1199],
    ]);
  });

  it('records a record it could not check as a finding, and carries on', async () => {
    const { service, runs, findings } = build(
      { banks: [uuid(1), uuid(2)] },
      (_t, id) =>
        id === uuid(1)
          ? Promise.reject(new Error('node unreachable'))
          : Promise.resolve([]),
    );
    const run = await service.start(auditor);
    await service.idle();
    expect(findings[0]).toMatchObject({
      recordId: uuid(1),
      mismatches: ['error: node unreachable'],
    });
    expect(runs.get(run.id)).toMatchObject({ status: 'done', checked: 2 });
  });

  it('runs one sweep at a time', async () => {
    const { service } = build({ projects: [uuid(1)] });
    await service.start(auditor);
    const err = await service
      .start(auditor)
      .catch((e: ConflictException) => e.getResponse());
    expect(err).toMatchObject({ code: 'SWEEP_RUNNING' });
    await service.idle();
    await expect(service.start(auditor)).resolves.toBeDefined();
  });

  it('stops at shutdown, and marks a run a stopped server left behind', async () => {
    const { service, runs, runsRepo } = build({
      projects: Array.from({ length: 600 }, (_, i) => uuid(i + 1)),
    });
    const run = await service.start(auditor);
    await service.onApplicationShutdown();
    expect(runs.get(run.id)).toMatchObject({
      status: 'failed',
      error: 'The server is stopping',
    });

    runs.get(run.id)!.status = 'running';
    await service.onModuleInit();
    expect(runsRepo.update).toHaveBeenLastCalledWith(
      { status: 'running' },
      expect.objectContaining({ status: 'interrupted' }),
    );
    expect(runs.get(run.id)!.status).toBe('interrupted');
  });
});
