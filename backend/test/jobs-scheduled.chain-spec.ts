/** Jobs running on their own timers: a separate file, since config is read once per test process. */
import { boot } from './support/jobs-app';

describe('Jobs on schedule (node + database)', () => {
  let app: Awaited<ReturnType<typeof boot>>;

  beforeAll(async () => {
    app = await boot({
      JOBS_ENABLED: 'true',
      EXPIRY_SWEEP_MS: '2000',
      REMINDER_SWEEP_MS: '600000',
      WATCHDOG_INTERVAL_MS: '600000',
    });
  });

  afterAll(async () => {
    await app?.chain.close();
  });

  it('releases what is due by itself, and records the run', async () => {
    const reservation = await app.unpaidReservation('Scheduled expiry');
    await app.travel(120 * 3600 + 1);
    let status = '';
    for (let i = 0; i < 40 && status !== 'expired'; i++) {
      await new Promise((r) => setTimeout(r, 500));
      status = (
        await app
          .as(app.t.accounts)
          .get(`/reservations/${reservation}`)
          .expect(200)
      ).body.data.status;
    }
    expect(status).toBe('expired');
    const history = await app
      .as(app.t.admin)
      .get('/jobs/reservation-expiry/runs')
      .expect(200);
    expect(history.body.data[0]).toMatchObject({
      trigger: 'schedule',
      outcome: 'ok',
      items: 1,
      triggeredBy: null,
    });
    const jobs = await app.as(app.t.admin).get('/jobs').expect(200);
    const job = jobs.body.data.find(
      (j: { name: string }) => j.name === 'reservation-expiry',
    );
    expect(job).toMatchObject({ enabled: true, everyMs: 2000 });
  }, 60_000);
});
