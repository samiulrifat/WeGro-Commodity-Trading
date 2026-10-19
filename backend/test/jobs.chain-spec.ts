/** Job status and manual runs end to end, against the local chain and a throwaway schema. */
import { boot } from './support/jobs-app';

const JOBS = [
  'deal-expiry',
  'indexer-watchdog',
  'reminders',
  'reservation-expiry',
  'sale-expiry',
  'sign-up-retry',
];

describe('Jobs (node + database)', () => {
  describe('status and manual runs', () => {
    let app: Awaited<ReturnType<typeof boot>>;

    beforeAll(async () => {
      app = await boot({});
    });

    afterAll(async () => {
      await app?.chain.close();
    });

    it('lists every job with its schedule, for staff who oversee them', async () => {
      const res = await app.as(app.t.admin).get('/jobs').expect(200);
      expect(res.body.data.map((j: { name: string }) => j.name)).toEqual(JOBS);
      expect(res.body.data[0]).toMatchObject({
        name: 'deal-expiry',
        everyMs: 60_000,
        enabled: false, // JOBS_ENABLED is off in tests
        running: false,
        lastRun: null,
        nextRunAt: null,
      });
      expect(
        res.body.data.find((j: { name: string }) => j.name === 'reminders')
          .everyMs,
      ).toBe(300_000);
      await app.as(app.t.auditor).get('/jobs').expect(200);
      await app.as(app.t.investor).get('/jobs').expect(403);
    });

    it('lets only the super admin run a job now, and keeps the run', async () => {
      const reservation = await app.unpaidReservation('Manual expiry');
      await app.travel(120 * 3600 + 1);
      await app
        .as(app.t.admin)
        .post('/jobs/reservation-expiry/run')
        .expect(403);
      await app
        .as(app.t.auditor)
        .post('/jobs/reservation-expiry/run')
        .expect(403);
      const res = await app
        .as(app.t.super_admin)
        .post('/jobs/reservation-expiry/run')
        .expect(200);
      expect(res.body.data).toMatchObject({
        trigger: 'manual',
        outcome: 'ok',
        items: 1,
        error: null,
      });
      const r = await app
        .as(app.t.accounts)
        .get(`/reservations/${reservation}`)
        .expect(200);
      expect(r.body.data.status).toBe('expired');

      const history = await app
        .as(app.t.auditor)
        .get('/jobs/reservation-expiry/runs')
        .expect(200);
      expect(history.body.data[0]).toMatchObject({
        trigger: 'manual',
        items: 1,
        triggeredBy: { name: 'Demo Super Admin' },
      });
      const status = await app.as(app.t.admin).get('/jobs').expect(200);
      expect(
        status.body.data.find(
          (j: { name: string }) => j.name === 'reservation-expiry',
        ).lastRun,
      ).toMatchObject({ trigger: 'manual', items: 1 });
    });

    it('runs the watchdog and the reminders on demand too', async () => {
      // The indexer is off in tests, so the watchdog has nothing to watch.
      const w = await app
        .as(app.t.super_admin)
        .post('/jobs/indexer-watchdog/run')
        .expect(200);
      expect(w.body.data).toMatchObject({ outcome: 'ok', items: 0 });
      await app.as(app.t.super_admin).post('/jobs/reminders/run').expect(200);
      await app.as(app.t.super_admin).post('/jobs/nope/run').expect(404);
      await app.as(app.t.admin).get('/jobs/nope/runs').expect(404);
    });
  });
});
