/** Projects and slots end to end, against the local chain and a throwaway schema. */
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ContractsRegistry } from '../src/blockchain/contracts.registry';
import { EventIndexerService } from '../src/blockchain/indexer/event-indexer.service';
import { uuidToBytes32 } from '../src/blockchain/utils/ids';
import { ReservationExpiryJob } from '../src/modules/projects/reservation-expiry.job';
import { User } from '../src/modules/users/entities/user.entity';
import { Role } from '../src/modules/users/roles';
import {
  type ChainApp,
  demoToken,
  ledgerDisagreements,
  startChainApp,
  waitForDemoAccounts,
} from './support/chain-app';
import { travel } from './support/chain-time';

// The ledger never accepts a payment reference twice, across runs too: make them unique.
const RUN = randomBytes(4).toString('hex').toUpperCase();
const ref = (name: string) => `${name}-${RUN}`;

describe('Projects (node + database)', () => {
  let chain: ChainApp;
  let http: ReturnType<typeof request>;
  let db: DataSource;
  let admin: string;
  let accounts: string;
  let investor: string;
  let auditor: string;
  let farmerToken: string;
  let buyer: string;
  let farmerId: string;
  let investorId: string;

  beforeAll(async () => {
    chain = await startChainApp({ DEMO_MODE: 'true' });
    http = request(chain.app.getHttpServer());
    db = chain.app.get(DataSource);
    await waitForDemoAccounts(chain);
    [admin, accounts, investor, auditor, farmerToken, buyer] =
      await Promise.all(
        [
          Role.ADMIN,
          Role.ACCOUNTS,
          Role.INVESTOR,
          Role.AUDITOR,
          Role.FARMER,
          Role.BUYER,
        ].map((r) => demoToken(http, r)),
      );
    const users = db.getRepository(User);
    farmerId = (
      await users.findOneByOrFail({ role: Role.FARMER, isDemo: true })
    ).id;
    investorId = (
      await users.findOneByOrFail({ role: Role.INVESTOR, isDemo: true })
    ).id;
  });

  afterAll(async () => {
    await chain?.close();
  });

  const as = (token: string) => ({
    get: (path: string) =>
      http.get(`/api${path}`).auth(token, { type: 'bearer' }),
    post: (path: string, body: object = {}) =>
      http.post(`/api${path}`).auth(token, { type: 'bearer' }).send(body),
    patch: (path: string, body: object) =>
      http.patch(`/api${path}`).auth(token, { type: 'bearer' }).send(body),
    delete: (path: string) =>
      http.delete(`/api${path}`).auth(token, { type: 'bearer' }),
  });

  const draft = (over: object = {}) => ({
    title: 'Bogura maize, winter',
    produceCode: 'MAIZE',
    districtCode: 'BOGURA',
    location: 'Shibganj upazila',
    farmerId,
    durationType: 'long_term',
    durationMonths: 8,
    payoutIntervalMonths: 4,
    fundingTarget: '200000',
    slotPrice: '20000',
    insured: true,
    estimatedReturnMinBps: 800,
    estimatedReturnMaxBps: 1500,
    ...over,
  });

  async function chainTimeTravel(seconds: number) {
    return travel(chain.app, seconds);
  }

  let projectId: string;

  describe('drafts', () => {
    it('creates a draft with derived slots, category and exact money', async () => {
      const res = await as(admin).post('/projects', draft()).expect(201);
      const p = res.body.data;
      projectId = p.id;
      expect(p).toMatchObject({
        stage: 'draft',
        chainState: 'local',
        category: 'storable_crop',
        fundingTarget: '200000.00',
        slotPrice: '20000.00',
        totalSlots: 10,
        availableSlots: 10,
        fundedPercent: '0.00',
        split: { farmer: '40.00', investors: '40.00', wegro: '20.00' },
        produce: { code: 'MAIZE', name: 'Maize', unit: 'kg' },
        district: { code: 'BOGURA', name: 'Bogura' },
        farmer: { id: farmerId, fullName: 'Demo Farmer' },
        estimatedReturn: {
          minPercent: '8.00',
          maxPercent: '15.00',
          minAmount: '1600.00',
          maxAmount: '3000.00',
        },
        termsHash: null,
      });
      expect(p.estimatedReturn.note).toMatch(/not guaranteed/);
    });

    it('reports every broken rule at once', async () => {
      const res = await as(admin)
        .post(
          '/projects',
          draft({ fundingTarget: '200001', wegroBps: 1000, durationMonths: 5 }),
        )
        .expect(422);
      expect(res.body.code).toBe('INVALID_TERMS');
      expect(res.body.details.problems).toHaveLength(3);
      await as(admin)
        .post('/projects', draft({ farmerId: investorId }))
        .expect(422);
      await as(admin)
        .post('/projects', draft({ produceCode: 'UNOBTAINIUM' }))
        .expect(422);
      await as(admin)
        .post('/projects', draft({ fundingTarget: 200000 }))
        .expect(400);
      await as(admin)
        .post('/projects', draft({ fundingTarget: '1.005' }))
        .expect(400);
    });

    it('keeps drafts from everyone but staff', async () => {
      await as(investor).get(`/projects/${projectId}`).expect(404);
      await as(farmerToken).get(`/projects/${projectId}`).expect(404);
      const seen = await as(investor).get('/projects').expect(200);
      expect(
        seen.body.data.some((p: { id: string }) => p.id === projectId),
      ).toBe(false);
      await as(auditor).get(`/projects/${projectId}`).expect(200);
      await as(investor).post('/projects', draft()).expect(403);
    });

    it('edits a draft and re-checks the whole of it', async () => {
      const res = await as(admin)
        .patch(`/projects/${projectId}`, {
          title: 'Bogura maize, rabi season',
          fundingTarget: '400000',
        })
        .expect(200);
      expect(res.body.data).toMatchObject({
        title: 'Bogura maize, rabi season',
        totalSlots: 20,
      });
      await as(admin)
        .patch(`/projects/${projectId}`, { slotPrice: '30000' })
        .expect(422);
      await as(admin)
        .patch(`/projects/${projectId}`, { fundingTarget: '200000' })
        .expect(200);
    });
  });

  describe('publishing', () => {
    it('fixes the terms on the ledger and opens funding', async () => {
      const res = await as(admin)
        .post(`/projects/${projectId}/publish`)
        .expect(200);
      expect(res.body.data).toMatchObject({
        stage: 'open_for_funding',
        chainState: 'confirmed',
      });
      expect(res.body.data.termsHash).toMatch(/^0x[0-9a-f]{64}$/);
      expect(res.body.data.publishedAt).not.toBeNull();

      const onChain = await chain.app
        .get(ContractsRegistry)
        .get('ProjectLedger')
        .getProject(uuidToBytes32(projectId));
      expect(onChain.stage).toBe(2n);
      expect(onChain.totalSlots).toBe(10n);
      expect(onChain.terms.termsHash).toBe(res.body.data.termsHash);
      expect(onChain.terms.fundingTarget).toBe(20_000_000n);
    });

    it('locks the terms once published', async () => {
      await as(admin)
        .patch(`/projects/${projectId}`, { title: 'Changed' })
        .expect(409);
      await as(admin).delete(`/projects/${projectId}`).expect(409);
      await as(admin).post(`/projects/${projectId}/publish`).expect(200); // nothing left to do
    });

    it('proves the stored terms match the ledger', async () => {
      const res = await as(auditor)
        .get(`/projects/${projectId}/integrity`)
        .expect(200);
      expect(res.body.data).toMatchObject({
        matches: true,
        ledgerStage: 'open_for_funding',
      });
      await as(investor).get(`/projects/${projectId}/integrity`).expect(403);
    });

    it('is visible to investors, buyers and its farmer now, and filterable', async () => {
      await as(buyer).get(`/projects/${projectId}`).expect(200);
      await as(farmerToken).get(`/projects/${projectId}`).expect(200);
      const filtered = await as(investor)
        .get(
          '/projects?durationType=long_term&produceCode=MAIZE&districtCode=BOGURA&stage=open_for_funding',
        )
        .expect(200);
      expect(filtered.body.data.map((p: { id: string }) => p.id)).toContain(
        projectId,
      );
      const none = await as(investor)
        .get('/projects?produceCode=ONION')
        .expect(200);
      expect(
        none.body.data.some((p: { id: string }) => p.id === projectId),
      ).toBe(false);
    });
  });

  describe('reservations and payments', () => {
    let first: number;
    let second: number;

    it('reserves slots that expire if unpaid', async () => {
      const res = await as(investor)
        .post(`/projects/${projectId}/reservations`, { slots: 4 })
        .expect(201);
      first = res.body.data.id;
      expect(res.body.data).toMatchObject({
        status: 'pending',
        slots: 4,
        amount: '80000.00',
      });
      expect(new Date(res.body.data.expiresAt).getTime()).toBeGreaterThan(
        Date.now(),
      );
      expect(res.body.data).not.toHaveProperty('paymentReference');
      const p = (await as(investor).get(`/projects/${projectId}`).expect(200))
        .body.data;
      expect(p).toMatchObject({ reservedSlots: 4, availableSlots: 6 });
    });

    it('refuses more slots than are free, saying how many are', async () => {
      const res = await as(investor)
        .post(`/projects/${projectId}/reservations`, { slots: 7 })
        .expect(409);
      expect(res.body).toMatchObject({
        code: 'NOT_ENOUGH_SLOTS',
        details: { available: 6 },
      });
      await as(admin)
        .post(`/projects/${projectId}/reservations`, { slots: 1 })
        .expect(403);
    });

    it('issues slots when Accounts confirms payment, keeping the reference encrypted', async () => {
      const res = await as(accounts)
        .post(`/reservations/${first}/confirm`, {
          paymentReference: `  trx  ${RUN.toLowerCase()} `,
        })
        .expect(200);
      expect(res.body.data).toMatchObject({
        status: 'confirmed',
        paymentReference: `TRX ${RUN}`,
      });
      const p = (await as(investor).get(`/projects/${projectId}`).expect(200))
        .body.data;
      expect(p).toMatchObject({
        issuedSlots: 4,
        reservedSlots: 0,
        availableSlots: 6,
        fundedPercent: '40.00',
      });

      const [row] = await db.query('SELECT * FROM reservations WHERE id = $1', [
        first,
      ]);
      expect(JSON.stringify(row)).not.toContain(RUN);
      const mine = await as(investor).get(`/reservations/${first}`).expect(200);
      expect(mine.body.data).not.toHaveProperty('paymentReference');
      const listed = await as(investor)
        .get(`/reservations?projectId=${projectId}&status=confirmed`)
        .expect(200);
      expect(listed.body.data.map((r: { id: number }) => r.id)).toContain(
        first,
      );
      expect(listed.body.meta).toMatchObject({ page: 1, total: 1 });
      await as(investor)
        .post(`/reservations/${first}/confirm`, { paymentReference: 'X' })
        .expect(403);
      await as(accounts)
        .post(`/reservations/${first}/confirm`, { paymentReference: 'Y' })
        .expect(409);
    });

    it('never accepts the same payment reference twice', async () => {
      second = (
        await as(investor)
          .post(`/projects/${projectId}/reservations`, { slots: 2 })
          .expect(201)
      ).body.data.id;
      const res = await as(accounts)
        .post(`/reservations/${second}/confirm`, {
          paymentReference: `TRX ${RUN}`,
        })
        .expect(409);
      expect(res.body.code).toBe('PAYMENT_REF_ALREADY_USED');
    });

    it('lets an investor cancel their own pending reservation', async () => {
      await as(investor).post(`/reservations/${second}/cancel`).expect(200);
      const p = (await as(investor).get(`/projects/${projectId}`).expect(200))
        .body.data;
      expect(p).toMatchObject({ reservedSlots: 0, availableSlots: 6 });
      await as(investor).post(`/reservations/${second}/cancel`).expect(409);
    });

    it('releases unpaid reservations once the chain says they have expired', async () => {
      const id = (
        await as(investor)
          .post(`/projects/${projectId}/reservations`, { slots: 3 })
          .expect(201)
      ).body.data.id;
      const job = chain.app.get(ReservationExpiryJob);
      await expect(job.run()).resolves.toBe(0); // not due yet

      // The hold is 7 days.
      await chainTimeTravel(7 * 24 * 3600 + 1);
      await expect(job.run()).resolves.toBe(1);
      const res = await as(investor).get(`/reservations/${id}`).expect(200);
      expect(res.body.data.status).toBe('expired');
      const p = (await as(investor).get(`/projects/${projectId}`).expect(200))
        .body.data;
      expect(p).toMatchObject({ reservedSlots: 0, availableSlots: 6 });
    });

    it('moves to Funded by itself when the last slot is paid', async () => {
      const id = (
        await as(investor)
          .post(`/projects/${projectId}/reservations`, { slots: 6 })
          .expect(201)
      ).body.data.id;
      await as(accounts)
        .post(`/reservations/${id}/confirm`, {
          paymentReference: ref('TRX-LAST-6'),
        })
        .expect(200);
      const p = (await as(investor).get(`/projects/${projectId}`).expect(200))
        .body.data;
      expect(p).toMatchObject({
        stage: 'funded',
        issuedSlots: 10,
        availableSlots: 0,
        fundedPercent: '100.00',
      });
    });

    it('shows the investor their holdings with the estimate for what they hold', async () => {
      const res = await as(investor).get('/investments').expect(200);
      const mine = res.body.data.find(
        (i: { project: { id: string } }) => i.project.id === projectId,
      );
      expect(mine).toMatchObject({
        slots: 10,
        invested: '200000.00',
        pendingSlots: 0,
        estimatedReturn: { minAmount: '16000.00', maxAmount: '30000.00' },
      });
    });

    it('lists holders for staff only', async () => {
      const res = await as(accounts)
        .get(`/projects/${projectId}/holders`)
        .expect(200);
      expect(res.body.data).toEqual([
        {
          investor: { id: investorId, fullName: 'Demo Investor' },
          slots: 10,
          amount: '200000.00',
        },
      ]);
      await as(investor).get(`/projects/${projectId}/holders`).expect(403);
    });

    it('activates, and refuses to cancel an active project', async () => {
      await as(admin).post(`/projects/${projectId}/activate`).expect(200);
      const res = await as(admin)
        .post(`/projects/${projectId}/cancel`)
        .expect(409);
      expect(res.body.code).toBe('WrongStage');
    });
  });

  describe('cancellation and refunds', () => {
    let cancelled: string;

    beforeAll(async () => {
      cancelled = (
        await as(admin)
          .post(
            '/projects',
            draft({ title: 'Onion, to be cancelled', produceCode: 'ONION' }),
          )
          .expect(201)
      ).body.data.id;
      await as(admin).post(`/projects/${cancelled}/publish`).expect(200);
      const r = (
        await as(investor)
          .post(`/projects/${cancelled}/reservations`, { slots: 3 })
          .expect(201)
      ).body.data.id;
      await as(accounts)
        .post(`/reservations/${r}/confirm`, {
          paymentReference: ref('TRX-ONION-3'),
        })
        .expect(200);
      await as(admin).post(`/projects/${cancelled}/cancel`).expect(200);
    });

    it('records what Accounts must refund', async () => {
      const p = (await as(accounts).get(`/projects/${cancelled}`).expect(200))
        .body.data;
      expect(p).toMatchObject({ stage: 'cancelled', refundTotal: '60000.00' });
      const lines = (
        await as(accounts).get(`/projects/${cancelled}/refunds`).expect(200)
      ).body.data;
      expect(lines).toEqual([
        expect.objectContaining({
          slots: 3,
          amount: '60000.00',
          status: 'due',
          paymentReference: null,
        }),
      ]);
    });

    it('records a refund once, with its reference', async () => {
      const res = await as(accounts)
        .post(`/projects/${cancelled}/refunds`, {
          investorId,
          paymentReference: ref('REFUND-77'),
        })
        .expect(201);
      expect(res.body.data[0]).toMatchObject({
        status: 'refunded',
        paymentReference: ref('REFUND-77'),
      });
      await as(accounts)
        .post(`/projects/${cancelled}/refunds`, {
          investorId,
          paymentReference: ref('REFUND-78'),
        })
        .expect(409);
      await as(accounts)
        .post(`/projects/${cancelled}/refunds`, {
          investorId: farmerId,
          paymentReference: ref('REFUND-79'),
        })
        .expect(422);
      await as(admin)
        .post(`/projects/${cancelled}/refunds`, {
          investorId,
          paymentReference: ref('REFUND-80'),
        })
        .expect(403);
    });

    it('shows the project timeline from the ledger, in order', async () => {
      await chain.app.get(EventIndexerService).catchUp(); // the timeline reads indexed events
      const res = await as(investor)
        .get(`/projects/${cancelled}/timeline`)
        .expect(200);
      expect(
        res.body.data.map(
          (e: { kind: string; stage?: string }) => e.stage ?? e.kind,
        ),
      ).toEqual([
        'created',
        'draft',
        'open_for_funding',
        'cancelled',
        'refunds_required',
      ]);
    });
  });

  describe('integrity of the read model', () => {
    it('rebuilds identical projects and reservations from the ledger', async () => {
      const snapshot = async () => ({
        projects: await db.query(
          'SELECT id, stage, chain_state, issued_slots, reserved_slots, refund_total FROM projects ORDER BY id',
        ),
        reservations: await db.query(
          'SELECT id, status, payment_ref_hash, payment_ref_enc FROM reservations ORDER BY id',
        ),
        refunds: await db.query(
          'SELECT project_id, confirmed, payment_ref_enc FROM refunds ORDER BY project_id',
        ),
      });
      const before = await snapshot();
      const indexer = chain.app.get(EventIndexerService);
      await indexer.reindex();
      await indexer.catchUp();
      expect(await snapshot()).toEqual(before);
    });

    it('refuses impossible slot counts at the database level', async () => {
      await expect(
        db.query(
          'UPDATE projects SET issued_slots = total_slots + 1 WHERE id = $1',
          [projectId],
        ),
      ).rejects.toThrow(/ck_projects_slots/);
    });
  });

  describe('ledger agreement', () => {
    it('agrees with the ledger on every record', async () => {
      expect(await ledgerDisagreements(chain)).toEqual([]);
    });
  });
});
