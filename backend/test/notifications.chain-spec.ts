/** In-app notifications end to end, against the local chain and a throwaway schema. */
import { randomBytes, randomInt } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { EventIndexerService } from '../src/blockchain/indexer/event-indexer.service';
import { ReminderJob } from '../src/modules/notifications/reminder.job';
import { ReservationExpiryJob } from '../src/modules/projects/reservation-expiry.job';
import { User } from '../src/modules/users/entities/user.entity';
import { Role } from '../src/modules/users/roles';
import {
  type ChainApp,
  demoToken,
  startChainApp,
  waitForDemoAccounts,
} from './support/chain-app';
import { travel as chainTravel } from './support/chain-time';

const RUN = randomBytes(4).toString('hex').toUpperCase();

interface Note {
  id: number;
  category: string;
  kind: string;
  title: string;
  subject: { type: string; id: string } | null;
  readAt: string | null;
}

describe('Notifications (node + database)', () => {
  let chain: ChainApp;
  let http: ReturnType<typeof request>;
  let db: DataSource;
  const t: Record<string, string> = {};
  const user: Record<string, User> = {};
  let project: string;
  let lapsing: number;
  let registered: string;

  const as = (token: string) => ({
    get: (path: string) =>
      http.get(`/api${path}`).auth(token, { type: 'bearer' }),
    post: (path: string, body: object = {}) =>
      http.post(`/api${path}`).auth(token, { type: 'bearer' }).send(body),
    put: (path: string, body: object) =>
      http.put(`/api${path}`).auth(token, { type: 'bearer' }).send(body),
  });
  /** Notices are written right after the action commits; give them a moment. */
  const inbox = async (token: string, query = 'limit=100') => {
    await new Promise((r) => setTimeout(r, 50));
    return (await as(token).get(`/notifications?${query}`).expect(200)).body
      .data as { items: Note[]; nextBefore: number | null };
  };
  const ofKind = async (token: string, kind: string) =>
    (await inbox(token)).items.filter((n) => n.kind === kind);

  async function travel(seconds: number) {
    return chainTravel(chain.app, seconds);
  }

  beforeAll(async () => {
    chain = await startChainApp({ DEMO_MODE: 'true' });
    http = request(chain.app.getHttpServer());
    db = chain.app.get(DataSource);
    await waitForDemoAccounts(chain);
    for (const r of [
      Role.SUPER_ADMIN,
      Role.ADMIN,
      Role.ACCOUNTS,
      Role.OPERATIONS,
      Role.INVESTOR,
      Role.FARMER,
      Role.AUDITOR,
    ]) {
      t[r] = await demoToken(http, r);
      user[r] = await db
        .getRepository(User)
        .findOneByOrFail({ role: r, isDemo: true });
    }
    project = (
      await as(t.admin)
        .post('/projects', {
          title: `Notified maize ${RUN}`,
          produceCode: 'MAIZE',
          districtCode: 'BOGURA',
          location: 'Shibganj',
          farmerId: user.farmer.id,
          durationType: 'short_term',
          durationMonths: 5,
          fundingTarget: '50000',
          slotPrice: '10000',
          estimatedReturnMinBps: 0,
          estimatedReturnMaxBps: 1000,
        })
        .expect(201)
    ).body.data.id;
    await as(t.admin).post(`/projects/${project}/publish`).expect(200);
  });

  afterAll(async () => {
    await chain?.close();
  });

  it('tells the admins about a registration waiting for them', async () => {
    const reg = await as(t.admin)
      .post('/participants', {
        role: 'buyer',
        fullName: 'Notified Buyer',
        phone: `0199${String(randomInt(1e6, 1e7))}`,
        nid: `${randomInt(2, 9)}${randomInt(1e8, 1e9)}`,
        dateOfBirth: '1987-07-07',
        district: 'DHAKA',
        address: 'Made-up address, Dhaka',
      })
      .expect(201);
    registered = reg.body.data.participant.id;
    const [note] = await ofKind(t.admin, 'participant.registered');
    expect(note).toMatchObject({
      category: 'action',
      title: 'New buyer registration awaiting verification',
      params: { role: 'buyer' },
      subject: { type: 'participant', id: registered },
      readAt: null,
    });
    // Staff registrations go to the super admin instead.
    expect(await ofKind(t.super_admin, 'participant.registered')).toEqual([]);
  });

  it('puts a new reservation in Accounts’ inbox, then reminds the investor once', async () => {
    lapsing = (
      await as(t.investor)
        .post(`/projects/${project}/reservations`, { slots: 1 })
        .expect(201)
    ).body.data.id;
    const [made] = await ofKind(t.accounts, 'reservation.made');
    expect(made).toMatchObject({
      category: 'action',
      title: `Reservation #${lapsing} awaiting payment confirmation`,
      params: {
        reservationId: String(lapsing),
        slots: 1,
        project: expect.any(String) as string,
        expiresAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT/) as string,
      },
      subject: { type: 'reservation', id: String(lapsing) },
    });

    const reminders = chain.app.get(ReminderJob);
    await expect(reminders.run()).resolves.toBe(0); // not within 24 h yet
    await travel(148 * 3600); // 20 h left of the 7-day hold
    await expect(reminders.run()).resolves.toBe(1);
    await expect(reminders.run()).resolves.toBe(0); // never twice
    const [reminder] = await ofKind(t.investor, 'reservation.expiring');
    expect(reminder).toMatchObject({
      category: 'reminder',
      title: 'Your reservation of 1 slots expires soon',
      params: {
        slots: 1,
        project: expect.any(String) as string,
        expiresAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT/) as string,
      },
      subject: { type: 'reservation', id: String(lapsing) },
    });
  });

  it('tells the investor when the reservation lapses', async () => {
    await travel(21 * 3600);
    await expect(chain.app.get(ReservationExpiryJob).run()).resolves.toBe(1);
    const [lapsed] = await ofKind(t.investor, 'reservation.expired');
    expect(lapsed).toMatchObject({
      category: 'outcome',
      title: 'Your reservation expired unpaid',
    });
  });

  it('tells each side what happened once the project is funded', async () => {
    const r = await as(t.investor)
      .post(`/projects/${project}/reservations`, { slots: 5 })
      .expect(201);
    await as(t.accounts)
      .post(`/reservations/${r.body.data.id}/confirm`, {
        paymentReference: `NOTE-${RUN}`,
      })
      .expect(200);
    expect(await ofKind(t.investor, 'reservation.confirmed')).toHaveLength(1);
    const [funded] = await ofKind(t.operations, 'project.funded');
    expect(funded).toMatchObject({
      category: 'action',
      subject: { type: 'project', id: project },
    });
  });

  it('notifies about bank details off the ledger too', async () => {
    await as(t.investor)
      .put('/me/bank-account', {
        holderName: 'Demo Investor',
        accountNumber: String(randomInt(1e9, 1e10)),
        routingNumber: '200100405',
      })
      .expect(200);
    expect(await ofKind(t.admin, 'bank-account.submitted')).toHaveLength(1);
    await as(t.admin)
      .post(`/participants/${user.investor.id}/bank-account/verify`)
      .expect(200);
    expect(await ofKind(t.investor, 'bank-account.verified')).toHaveLength(1);
  });

  it('pages, counts and marks read, each person only their own', async () => {
    const all = await inbox(t.investor);
    expect(all.items.length).toBeGreaterThanOrEqual(4);
    const unread = await as(t.investor)
      .get('/notifications/unread-count')
      .expect(200);
    expect(unread.body.data.unread).toBe(all.items.length);

    const first = await inbox(t.investor, 'limit=2');
    expect(first.items).toHaveLength(2);
    expect(first.items[0].id).toBeGreaterThan(first.items[1].id);
    const next = await as(t.investor)
      .get(`/notifications?limit=2&before=${first.nextBefore}`)
      .expect(200);
    expect(next.body.data.items[0].id).toBeLessThan(first.items[1].id);

    const read = await as(t.investor)
      .post(`/notifications/${all.items[0].id}/read`)
      .expect(200);
    expect(read.body.data.readAt).not.toBeNull();
    await as(t.admin)
      .post(`/notifications/${all.items[1].id}/read`)
      .expect(404);
    expect(
      (await inbox(t.investor, 'limit=100&unread=true')).items,
    ).toHaveLength(all.items.length - 1);
    const marked = await as(t.investor)
      .post('/notifications/read-all')
      .expect(200);
    expect(marked.body.data.marked).toBe(all.items.length - 1);
    const none = await as(t.investor)
      .get('/notifications/unread-count')
      .expect(200);
    expect(none.body.data.unread).toBe(0);
  });

  it('never sends anything again when the ledger is replayed', async () => {
    const count = async () =>
      Number((await db.query('SELECT COUNT(*) AS n FROM notifications'))[0].n);
    const before = await count();
    const indexer = chain.app.get(EventIndexerService);
    await indexer.catchUp();
    await indexer.reindex();
    await indexer.catchUp();
    expect(await count()).toBe(before);
  });
});
