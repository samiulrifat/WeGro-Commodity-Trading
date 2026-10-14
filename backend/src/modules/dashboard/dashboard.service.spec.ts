import { actor, fakeClock, Role } from '../../../test/support/unit';
import { queuesFor } from './dashboard-queues';
import { DashboardService } from './dashboard.service';

const NOW = new Date('2026-10-14T06:00:00Z'); // 14 Oct, Dhaka
const DAY = 86_400_000;

/** Answers each query by what it selects; counts how often each kind ran. */
function database() {
  const ran: Record<string, number> = {};
  const params: unknown[][] = [];
  const count = (k: string) => (ran[k] = (ran[k] ?? 0) + 1);
  const query = jest.fn((sql: string, p: unknown[] = []) => {
    params.push(p);
    if (sql.includes("WHERE p.stage = 'open_for_funding'")) {
      count('funding');
      return Promise.resolve([
        {
          id: 'p1',
          title: 'Maize',
          farmer_id: 'f1',
          produce_code: 'MAIZE',
          district_code: 'BOGURA',
          target: '5000000',
          raised: '2000000',
          total_slots: '5',
          issued_slots: 2,
          reserved_slots: 1,
          pending_reservations: '1',
          published_at: new Date(NOW.getTime() - 3.5 * DAY),
        },
      ]);
    }
    if (sql.includes("FROM projects WHERE stage = 'open_for_funding'"))
      return Promise.resolve([
        { n: '3', target: '15000000', raised: '6375000' },
      ]);
    if (sql.includes('GROUP BY stage'))
      return Promise.resolve([
        { stage: 'active', n: '4' },
        { stage: 'draft', n: '2' },
      ]);
    if (sql.includes("WHERE p.stage = 'active'"))
      return Promise.resolve([
        {
          id: 'p2',
          title: 'Potato',
          farmer_id: 'f2',
          produce_code: 'POTATO',
          district_code: 'RANGPUR',
          duration_months: 5,
          activated_at: new Date('2026-04-01T00:00:00Z'), // ends 1 Sep: overdue
          raised: '5000000',
          committed: '100000',
          spent: '50000',
          last_field_record: null,
          open_claims: '1',
          open_listings: '0',
        },
      ]);
    if (sql.includes("FROM projects WHERE stage = 'active'"))
      return Promise.resolve([{ n: '4' }]);
    if (sql.includes('AS funding,')) {
      count('figures');
      return Promise.resolve([
        {
          funding: '10000000',
          refunded: '0',
          sales: '250050',
          insurance: '0',
          inputs: '50000',
          payouts: '125000',
        },
      ]);
    }
    if (sql.includes('GROUP BY role'))
      return Promise.resolve([{ role: 'farmer', n: '10' }]);
    if (sql.includes('r.closed_at'))
      return Promise.resolve([{ m: '2026-10', v: '10000000' }]);
    if (
      sql.includes(
        'AS m, COUNT(*)::text AS v FROM projects\n            WHERE activated_at',
      )
    )
      return Promise.resolve([{ m: '2026-04', v: '1' }]);
    if (/SELECT COUNT\(\*\)/i.test(sql) && !sql.includes('AS m')) {
      count('queue');
      return Promise.resolve([{ n: '2' }]);
    }
    return Promise.resolve([]);
  });
  return { dataSource: { query }, ran, params };
}

describe('DashboardService', () => {
  const build = (clock = fakeClock(NOW)) => {
    const db = database();
    const views = {
      names: jest.fn((ids: string[]) =>
        Promise.resolve(new Map(ids.map((id) => [id, `name-${id}`]))),
      ),
    };
    const service = new DashboardService(
      db.dataSource as never,
      views as never,
      clock as never,
    );
    return { service, views, clock, ...db };
  };

  it('shows funding progress with whole days open and rounded-down percentages', async () => {
    const { service } = build();
    const d = await service.dashboard(actor(Role.Admin));
    expect(d.funding).toMatchObject({
      openProjects: 3,
      target: '150000.00',
      raised: '63750.00',
      percentFunded: '42.5',
    });
    expect(d.funding.projects[0]).toMatchObject({
      farmer: { id: 'f1', name: 'name-f1' },
      percentFunded: '40.0',
      daysOpen: 3,
      totalSlots: 5,
      pendingReservations: 1,
    });
    expect(d.stages).toEqual({ active: 4, draft: 2 });
  });

  it('marks an active project overdue once its planned months have passed', async () => {
    const d = await build().service.dashboard(actor(Role.Admin));
    expect(d.active.projects[0]).toMatchObject({
      startedOn: '2026-04-01',
      plannedEndOn: '2026-09-01',
      overdue: true,
      openClaims: 1,
      inputsCommitted: '1000.00',
    });
  });

  it('fills the 12-month trends with zeros where nothing happened', async () => {
    const d = await build().service.dashboard(actor(Role.Admin));
    expect(d.trends.months[0]).toBe('2025-11');
    expect(d.trends.months[11]).toBe('2026-10');
    expect(d.trends.fundingRaised.slice(-2)).toEqual(['0.00', '100000.00']);
    expect(d.trends.projectsStarted[5]).toBe(1); // April 2026
    expect(d.figures).toMatchObject({
      salesIncome: '2500.50',
      participants: { farmer: 10 },
    });
  });

  it('shows each role only its own queues, and passes the ledger time where a queue needs it', async () => {
    const { service, params } = build();
    const d = await service.dashboard(actor(Role.Accounts));
    expect(d.queues.map((q) => q.key)).toEqual(
      queuesFor(Role.Accounts).map((q) => q.key),
    );
    expect(d.queues.every((q) => q.count === 2)).toBe(true);
    expect(params.some((p) => p[0] === NOW)).toBe(true);
    const everything = await service.dashboard(actor(Role.Auditor));
    expect(everything.queues.length).toBeGreaterThan(d.queues.length);
  });

  it('computes figures once for requests arriving together, then reuses them for a minute', async () => {
    const clock = fakeClock(NOW);
    const { service, ran } = build(clock);
    await Promise.all([
      service.dashboard(actor(Role.Admin)),
      service.dashboard(actor(Role.Admin)),
      service.dashboard(actor(Role.Admin)),
    ]);
    expect(ran.figures).toBe(1);
    clock.now.mockResolvedValue(new Date(NOW.getTime() + 59_000));
    const later = await service.dashboard(actor(Role.Admin));
    expect(ran.figures).toBe(1);
    expect(later.figuresAsOf).toEqual(NOW);
    clock.now.mockResolvedValue(new Date(NOW.getTime() + 61_000));
    await service.dashboard(actor(Role.Admin));
    expect(ran.figures).toBe(2);
  });

  it('looks every name on the page up in one call', async () => {
    const { service, views } = build();
    await service.dashboard(actor(Role.Admin));
    expect(views.names).toHaveBeenCalledTimes(1);
    expect(views.names.mock.calls[0][0]).toEqual(
      expect.arrayContaining(['f1', 'f2']),
    );
  });
});
