/** History, verification and the audit log end to end, against the local chain and a throwaway schema. */
import { randomBytes, randomInt } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { EventIndexerService } from '../src/blockchain/indexer/event-indexer.service';
import { uuidToBytes32 } from '../src/blockchain/utils/ids';
import { SweepService } from '../src/modules/audit/verify/sweep.service';
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

interface Entry {
  event: string;
  title: string;
  actor: { kind: string; id?: string; role?: string };
  details: Record<string, unknown>;
  parties: Record<string, string>;
}

describe('Audit (node + database)', () => {
  let chain: ChainApp;
  let http: ReturnType<typeof request>;
  let db: DataSource;
  const t: Record<string, string> = {};
  const user: Record<string, User> = {};
  let project: string;
  let reservation: number;
  let expired: number;
  let newcomer: { id: string; token: string };

  const as = (token: string) => ({
    get: (path: string) =>
      http.get(`/api${path}`).auth(token, { type: 'bearer' }),
    post: (path: string, body: object = {}) =>
      http.post(`/api${path}`).auth(token, { type: 'bearer' }).send(body),
  });
  const indexer = () => chain.app.get(EventIndexerService);
  const history = async (type: string, id: string | number, query = '') =>
    (
      await as(t.auditor)
        .get(`/audit/history/${type}/${id}?limit=100${query}`)
        .expect(200)
    ).body as { data: Entry[]; meta: { total: number } };

  async function travel(seconds: number) {
    return chainTravel(chain.app, seconds);
  }

  /** Audit rows are written once the response has gone; wait for them. */
  async function auditRows(where: string, params: unknown[], atLeast = 1) {
    for (let i = 0; i < 50; i++) {
      const rows: unknown[] = await db.query(
        `SELECT * FROM audit_log WHERE ${where} ORDER BY id`,
        params,
      );
      if (rows.length >= atLeast) return rows;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`No audit rows for ${where}`);
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
      Role.INVESTOR,
      Role.FARMER,
      Role.AUDITOR,
    ]) {
      t[r] = await demoToken(http, r);
      user[r] = await db
        .getRepository(User)
        .findOneByOrFail({ role: r, isDemo: true });
    }

    // An investor whose key is replaced after investing.
    const phone = `0197${String(randomInt(1e6, 1e7))}`;
    const reg = await as(t.admin)
      .post('/participants', {
        role: 'investor',
        fullName: 'Newcomer Investor',
        phone,
        nid: `${randomInt(2, 9)}${randomInt(1e8, 1e9)}`,
        dateOfBirth: '1990-01-01',
        district: 'DHAKA',
        address: 'Made-up address, Dhaka',
      })
      .expect(201);
    const newcomerId = reg.body.data.participant.id;
    await as(t.admin).post(`/participants/${newcomerId}/verify`).expect(200);
    const temp = reg.body.data.temporaryPassword;
    const login = await http
      .post('/api/auth/login')
      .send({ phone, password: temp })
      .expect(200);
    newcomer = {
      id: newcomerId,
      token: (
        await as(login.body.data.accessToken)
          .post('/auth/change-password', {
            currentPassword: temp,
            newPassword: `${phone}-pw-ok`,
          })
          .expect(200)
      ).body.data.accessToken,
    };

    project = (
      await as(t.admin)
        .post('/projects', {
          title: `Audited maize ${RUN}`,
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
    reservation = (
      await as(newcomer.token)
        .post(`/projects/${project}/reservations`, { slots: 3 })
        .expect(201)
    ).body.data.id;
    await as(t.accounts)
      .post(`/reservations/${reservation}/confirm`, {
        paymentReference: `AUD-${RUN}`,
      })
      .expect(200);
    expired = (
      await as(t.investor)
        .post(`/projects/${project}/reservations`, { slots: 1 })
        .expect(201)
    ).body.data.id;
    await travel(7 * 24 * 3600 + 1);
    await chain.app.get(ReservationExpiryJob).run();
    await as(t.admin)
      .post(`/participants/${newcomer.id}/replace-key`)
      .expect(200);
    await indexer().catchUp();
  });

  afterAll(async () => {
    await chain?.close();
  });

  describe('indexed events', () => {
    it('keep who sent each transaction, and fill it in for older rows', async () => {
      const key = uuidToBytes32(project);
      const sender = async () =>
        db.query(
          `SELECT tx_from FROM chain_event
            WHERE event_name = 'ProjectCreated' AND args->>'projectId' = $1`,
          [key],
        );
      const [{ tx_from }] = await sender();
      expect(tx_from).toBe(user.admin.account);
      await db.query(
        `UPDATE chain_event SET tx_from = NULL WHERE args->>'projectId' = $1`,
        [key],
      );
      await indexer().catchUp();
      expect((await sender())[0].tx_from).toBe(user.admin.account);
    });
  });

  describe('history', () => {
    it("tells a project's story across contracts, with who did what", async () => {
      const { data } = await history('project', project);
      expect(data.map((e) => e.event)).toEqual([
        'ProjectCreated',
        'ProjectStageChanged',
        'ProjectStageChanged',
        'SlotsReserved',
        'ReservationConfirmed',
        'SlotsReserved',
        'ReservationExpired',
      ]);
      const [created, drafted, opened, reserved, confirmed, , lapsed] = data;
      expect(created).toMatchObject({
        title: 'Project created on the ledger',
        actor: { kind: 'participant', id: user.admin.id, role: 'admin' },
        details: { projectId: project, slotPrice: '10000.00' },
      });
      expect(created.parties[user.farmer.id]).toBe('Demo Farmer');
      expect(drafted.details).toMatchObject({ newStage: 'draft' });
      expect(opened.details).toMatchObject({
        previousStage: 'draft',
        newStage: 'open_for_funding',
      });
      expect(confirmed.actor).toMatchObject({ id: user.accounts.id });
      expect(lapsed.actor).toMatchObject({ kind: 'system' });
      // Signed with a key since replaced: still the same person.
      expect(reserved.actor).toMatchObject({
        kind: 'participant',
        id: newcomer.id,
        role: 'investor',
      });
    });

    it('pages either way and covers each kind of record', async () => {
      const page = await as(t.auditor)
        .get(`/audit/history/project/${project}?limit=2&order=desc`)
        .expect(200);
      expect(page.body.meta).toMatchObject({ total: 7, totalPages: 4 });
      expect(page.body.data[0].event).toBe('ReservationExpired');

      const r = await history('reservation', reservation);
      expect(r.data.map((e) => e.event)).toEqual([
        'SlotsReserved',
        'ReservationConfirmed',
      ]);
      const p = await history('participant', newcomer.id);
      expect(p.data.map((e) => e.event)).toEqual([
        'ParticipantRegistered',
        'ParticipantStatusChanged',
        'ParticipantAccountChanged',
      ]);
      expect(p.data[1].details).toMatchObject({ newStatus: 'verified' });
    });

    it('lists ledger activity newest first, by kind of record or one record', async () => {
      type Entry = {
        event: string;
        records: Array<{ type: string; id: string }>;
      };
      const all = await as(t.accounts).get('/audit/events?limit=5').expect(200);
      expect(all.body.data).toHaveLength(5);
      const blocks = all.body.data.map(
        (e: { blockNumber: number }) => e.blockNumber,
      );
      expect([...blocks].sort((a, b) => b - a)).toEqual(blocks);

      // One record by its id, of whatever kind: the same events as its history.
      const one = await as(t.auditor)
        .get(`/audit/events?q=${project}&limit=50`)
        .expect(200);
      expect(one.body.meta.total).toBe(7);
      expect(one.body.data[0].event).toBe('ReservationExpired');
      expect(
        one.body.data.every((e: Entry) =>
          e.records.some((r) => r.type === 'project' && r.id === project),
        ),
      ).toBe(true);
      // Each event names its records, to open their histories.
      const confirmed = one.body.data.find(
        (e: Entry) => e.event === 'ReservationConfirmed',
      );
      expect(confirmed.records).toEqual([
        { type: 'project', id: project },
        { type: 'reservation', id: String(reservation) },
      ]);

      // By kind: only reservation events; a number finds that reservation.
      const kind = await as(t.auditor)
        .get('/audit/events?type=reservation&limit=50')
        .expect(200);
      expect(
        kind.body.data.every((e: Entry) =>
          e.records.some((r) => r.type === 'reservation'),
        ),
      ).toBe(true);
      const byNumber = await as(t.auditor)
        .get(`/audit/events?type=reservation&q=${reservation}`)
        .expect(200);
      expect(byNumber.body.data.map((e: Entry) => e.event)).toEqual([
        'ReservationConfirmed',
        'SlotsReserved',
      ]);
      // Text no record id can be: nothing.
      const none = await as(t.auditor).get('/audit/events?q=maize').expect(200);
      expect(none.body.meta.total).toBe(0);
      await as(t.farmer).get('/audit/events').expect(403);
    });

    it('is for staff, and only for record types it knows', async () => {
      await as(t.auditor)
        .get(`/audit/history/spaceship/${project}`)
        .expect(404);
      await as(t.auditor).get('/audit/history/project/not-a-uuid').expect(404);
      await as(t.auditor).get('/audit/history/offer/12x').expect(404);
      await as(t.farmer).get(`/audit/history/project/${project}`).expect(403);
      const none = await history('offer', 999999999);
      expect(none.data).toEqual([]);
    });
  });

  describe('verify', () => {
    it('confirms records the ledger agrees with', async () => {
      for (const [type, id] of [
        ['project', project],
        ['reservation', reservation],
        ['reservation', expired],
        ['participant', newcomer.id],
      ] as const) {
        const res = await as(t.auditor)
          .get(`/audit/verify/${type}/${id}`)
          .expect(200);
        expect(res.body.data).toMatchObject({
          type,
          onLedger: true,
          matches: true,
          mismatches: [],
        });
      }
      await as(t.farmer).get(`/audit/verify/project/${project}`).expect(403);
      await as(t.auditor).get('/audit/verify/project/nope').expect(404);
    });

    it('says exactly what was changed behind the ledger', async () => {
      await db.query('UPDATE reservations SET slots = 4 WHERE id = $1', [
        reservation,
      ]);
      const res = await as(t.auditor)
        .get(`/audit/verify/reservation/${reservation}`)
        .expect(200);
      expect(res.body.data).toMatchObject({
        matches: false,
        mismatches: ['slots'],
      });
    });

    it('sweeps every record in the background and lists what differs', async () => {
      const started = await as(t.auditor).post('/audit/sweeps').expect(202);
      const id = started.body.data.id;
      expect(started.body.data).toMatchObject({
        status: 'running',
        startedBy: { id: user.auditor.id },
      });
      const busy = await as(t.super_admin).post('/audit/sweeps').expect(409);
      expect(busy.body.code).toBe('SWEEP_RUNNING');
      await chain.app.get(SweepService).idle();

      const run = await as(t.auditor).get(`/audit/sweeps/${id}`).expect(200);
      const runs = await as(t.auditor).get('/audit/sweeps').expect(200);
      expect(runs.body.data[0]).toMatchObject({ id, status: 'done' });
      expect(run.body.data.status).toBe('done');
      expect(run.body.data.checked).toBeGreaterThan(3);
      const findings = await as(t.auditor)
        .get(`/audit/sweeps/${id}/findings?limit=100`)
        .expect(200);
      // Exactly the change made behind the ledger, nothing else.
      expect(findings.body.data).toEqual([
        {
          type: 'reservation',
          recordId: String(reservation),
          mismatches: ['slots'],
        },
      ]);
      await db.query('UPDATE reservations SET slots = 3 WHERE id = $1', [
        reservation,
      ]);
    });
  });

  describe('audit log', () => {
    it('records every write, refused ones too, without bodies', async () => {
      await as(t.farmer)
        .post('/projects', { title: 'Not allowed' })
        .expect(403);
      const [denied] = (await auditRows(
        `actor_id = $1 AND route = '/api/projects' AND method = 'POST'`,
        [user.farmer.id],
      )) as Array<Record<string, unknown>>;
      expect(denied).toMatchObject({
        role: 'farmer',
        status_code: 403,
        outcome: 'failed',
      });
      expect(JSON.stringify(denied)).not.toContain('Not allowed');

      await auditRows(
        `route = '/api/projects/:id/publish' AND outcome = 'ok'`,
        [],
      );
      const res = await as(t.auditor)
        .get(
          `/audit/log?actorId=${user.admin.id}&route=/api/projects/:id/publish`,
        )
        .expect(200);
      expect(res.body.data[0]).toMatchObject({
        actor: { id: user.admin.id, role: 'admin' },
        method: 'POST',
        params: { id: project },
        statusCode: 200,
        outcome: 'ok',
      });
      // A route's start finds every route under it.
      const under = await as(t.auditor)
        .get(
          `/audit/log?actorId=${user.admin.id}&route=/api/projects&limit=100`,
        )
        .expect(200);
      const routes = under.body.data.map((r: { route: string }) => r.route);
      expect(routes).toContain('/api/projects/:id/publish');
      expect(routes.every((r: string) => r.startsWith('/api/projects'))).toBe(
        true,
      );
      const failed = await as(t.super_admin)
        .get('/audit/log?outcome=failed&statusCode=403')
        .expect(200);
      expect(failed.body.data.length).toBeGreaterThan(0);
      await as(t.admin).get('/audit/log').expect(403);
    });

    it('cannot be changed or deleted, even directly in the database', async () => {
      await expect(
        db.query(
          `UPDATE audit_log SET outcome = 'ok' WHERE outcome = 'failed'`,
        ),
      ).rejects.toThrow(/append-only/);
      await expect(db.query('DELETE FROM audit_log')).rejects.toThrow(
        /append-only/,
      );
    });
  });
});
