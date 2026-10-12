/** Warehouse sites and receipts end to end, against the local chain and a throwaway schema. */
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ChainClock } from '../src/blockchain/chain-clock';
import { ContractsRegistry } from '../src/blockchain/contracts.registry';
import { EventIndexerService } from '../src/blockchain/indexer/event-indexer.service';
import { ReceiptApplier } from '../src/blockchain/indexer/receipt-applier';
import { TransactionService } from '../src/blockchain/tx/transaction.service';
import { hashPaymentRef } from '../src/blockchain/utils/payment-ref';
import { bdDate } from '../src/common/time/bd-dates';
import { User } from '../src/modules/users/entities/user.entity';
import { Role } from '../src/modules/users/roles';
import {
  type ChainApp,
  demoToken,
  startChainApp,
  waitForDemoAccounts,
} from './support/chain-app';

const RUN = randomBytes(4).toString('hex').toUpperCase();

describe('Warehouse (node + database)', () => {
  let chain: ChainApp;
  let http: ReturnType<typeof request>;
  let db: DataSource;
  const t: Record<string, string> = {};
  const user: Record<string, User> = {};
  let siteId: string;
  let projectId: string;
  let receiptA: string;
  let receiptB: string;

  const as = (token: string) => ({
    get: (path: string) =>
      http.get(`/api${path}`).auth(token, { type: 'bearer' }),
    post: (path: string, body: object = {}) =>
      http.post(`/api${path}`).auth(token, { type: 'bearer' }).send(body),
    put: (path: string, body: object) =>
      http.put(`/api${path}`).auth(token, { type: 'bearer' }).send(body),
  });

  async function day(offset = 0): Promise<string> {
    const now = await chain.app.get(ChainClock).now();
    return bdDate(new Date(now.getTime() + offset * 86_400_000));
  }

  async function project(produceCode: string, title: string): Promise<string> {
    const id = (
      await as(t.admin)
        .post('/projects', {
          title,
          produceCode,
          districtCode: 'BOGURA',
          location: 'Shibganj',
          farmerId: user.farmer.id,
          durationType: 'short_term',
          durationMonths: 5,
          fundingTarget: '50000',
          slotPrice: '10000',
          estimatedReturnMinBps: 0,
          estimatedReturnMaxBps: 500,
        })
        .expect(201)
    ).body.data.id;
    await as(t.admin).post(`/projects/${id}/publish`).expect(200);
    const r = await as(t.investor)
      .post(`/projects/${id}/reservations`, { slots: 5 })
      .expect(201);
    await as(t.accounts)
      .post(`/reservations/${r.body.data.id}/confirm`, {
        paymentReference: `W-${title}-${RUN}`,
      })
      .expect(200);
    await as(t.admin).post(`/projects/${id}/activate`).expect(200);
    return id;
  }

  const intake = async (over: object = {}) => ({
    projectId,
    quantity: 5000,
    bagCount: 100,
    moisturePercent: '13.50',
    storageBay: 'Bay C-4',
    intakeDate: await day(),
    expiresOn: await day(180),
    ...over,
  });

  beforeAll(async () => {
    chain = await startChainApp({ DEMO_MODE: 'true' });
    http = request(chain.app.getHttpServer());
    db = chain.app.get(DataSource);
    await waitForDemoAccounts(chain);
    for (const r of [
      Role.Admin,
      Role.Accounts,
      Role.Investor,
      Role.Warehouse,
      Role.Farmer,
      Role.FieldOfficer,
      Role.Buyer,
    ]) {
      t[r] = await demoToken(http, r);
      user[r] = await db
        .getRepository(User)
        .findOneByOrFail({ role: r, isDemo: true });
    }
    projectId = await project('MAIZE', 'Maize to store');
  });

  afterAll(async () => {
    await chain?.close();
  });

  describe('sites and operators', () => {
    it('registers a site on the ledger and assigns the operator', async () => {
      const res = await as(t.admin)
        .post('/warehouse-sites', {
          name: `Bogura Central ${RUN}`,
          districtCode: 'BOGURA',
          address: 'Shibganj road, Bogura Sadar',
          storageType: 'warehouse',
          capacityKg: 500000,
        })
        .expect(201);
      siteId = res.body.data.id;
      expect(res.body.data).toMatchObject({
        status: 'registered',
        districtName: 'Bogura',
        operators: [],
      });

      const assigned = await as(t.admin)
        .put(`/warehouse-operators/${user.warehouse.id}`, { siteId })
        .expect(200);
      expect(assigned.body.data.operators).toEqual([
        { id: user.warehouse.id, name: 'Demo Warehouse Operator' },
      ]);
      const mine = await as(t.warehouse).get('/warehouse-sites').expect(200);
      expect(mine.body.data.map((s: { id: string }) => s.id)).toEqual([siteId]);
    });

    it('refuses duplicate names and non-operators', async () => {
      await as(t.admin)
        .post('/warehouse-sites', {
          name: `bogura central ${RUN.toLowerCase()}`,
          districtCode: 'BOGURA',
          address: 'Elsewhere, Bogura',
          storageType: 'cold_storage',
        })
        .expect(409);
      await as(t.admin)
        .put(`/warehouse-operators/${user.farmer.id}`, { siteId })
        .expect(422);
      await as(t.warehouse)
        .put(`/warehouse-operators/${user.warehouse.id}`, { siteId })
        .expect(403);
    });
  });

  describe('issuing', () => {
    it('issues a receipt to the farmer with the intake record in canonical form', async () => {
      const res = await as(t.warehouse)
        .post('/warehouse-receipts', await intake())
        .expect(201);
      receiptA = res.body.data.id;
      expect(receiptA).toMatch(/^0x[0-9a-f]{64}$/);
      expect(res.body.data).toMatchObject({
        status: 'issued',
        quantity: 5000,
        owner: { kind: 'farmer', id: user.farmer.id, name: 'Demo Farmer' },
        site: { id: siteId },
        produce: { code: 'MAIZE', unit: 'kg' },
        intake: {
          bagCount: 100,
          moisturePercent: '13.5',
          storageBay: 'Bay C-4',
        },
        expired: false,
        verifyUrl: `http://localhost:5173/verify/receipt/${receiptA}`,
      });
      receiptB = (
        await as(t.warehouse)
          .post('/warehouse-receipts', await intake({ quantity: 800 }))
          .expect(201)
      ).body.data.id;
    });

    it('refuses bad details, fresh produce and anyone but a site operator', async () => {
      const bad = await as(t.warehouse)
        .post(
          '/warehouse-receipts',
          await intake({
            moisturePercent: '13.55',
            intakeDate: await day(2),
            expiresOn: await day(-1),
          }),
        )
        .expect(422);
      expect(bad.body.details.problems).toHaveLength(4);

      const tomato = await project('TOMATO', 'Tomatoes');
      const fresh = await as(t.warehouse)
        .post('/warehouse-receipts', await intake({ projectId: tomato }))
        .expect(422);
      expect(fresh.body.code).toBe('NOT_STORABLE');
      await as(t.admin)
        .post('/warehouse-receipts', await intake())
        .expect(403);
    });
  });

  describe('verification and access', () => {
    it('lets anyone check a receipt, without seeing its owner', async () => {
      const res = await http
        .get(`/api/verify/receipts/${receiptA}`)
        .expect(200);
      expect(res.body.data).toMatchObject({
        genuine: true,
        quantity: 5000,
        status: 'issued',
        site: { name: `Bogura Central ${RUN}`, district: 'Bogura' },
        partOfLargerReceipt: false,
      });
      expect(JSON.stringify(res.body)).not.toMatch(/Demo Farmer|owner/);
      const qr = await http
        .get(`/api/verify/receipts/${receiptA}/qr.svg`)
        .expect(200);
      expect(qr.headers['content-type']).toMatch(/svg/);

      await db.query(
        `UPDATE warehouse_receipts SET bag_count = 99 WHERE id = $1`,
        [receiptA],
      );
      expect(
        (await http.get(`/api/verify/receipts/${receiptA}`).expect(200)).body
          .data.genuine,
      ).toBe(false);
      await db.query(
        `UPDATE warehouse_receipts SET bag_count = 100 WHERE id = $1`,
        [receiptA],
      );
      expect(
        (
          await http
            .get(`/api/verify/receipts/0x${'00'.repeat(32)}`)
            .expect(200)
        ).body.data.genuine,
      ).toBe(false);
      expect(
        (await http.get('/api/verify/receipts/nonsense').expect(200)).body.data
          .genuine,
      ).toBe(false);
    });

    it('shows receipts to the farmer, their officer, the site and staff only', async () => {
      for (const token of [t.farmer, t.field_officer, t.warehouse, t.admin]) {
        await as(token).get(`/warehouse-receipts/${receiptA}`).expect(200);
      }
      await as(t.buyer).get(`/warehouse-receipts/${receiptA}`).expect(404);
      await as(t.investor).get(`/warehouse-receipts/${receiptA}`).expect(403);
    });
  });

  describe('re-checks and collection', () => {
    it('extends the term only after a later-dated re-check at the issuing site', async () => {
      const current = (
        await as(t.warehouse).get(`/warehouse-receipts/${receiptB}`).expect(200)
      ).body.data.expiresOn;
      await as(t.warehouse)
        .post(`/warehouse-receipts/${receiptB}/extend`, {
          checkedOn: await day(),
          newExpiresOn: current,
        })
        .expect(422);
      const res = await as(t.warehouse)
        .post(`/warehouse-receipts/${receiptB}/extend`, {
          checkedOn: await day(),
          newExpiresOn: await day(365),
          moisturePercent: 12,
          notes: 'Dry and clean',
        })
        .expect(200);
      expect(res.body.data.expiresOn).toBe(await day(365));
      expect(res.body.data.rechecks).toEqual([
        expect.objectContaining({
          moisturePercent: '12.0',
          notes: 'Dry and clean',
          status: 'recorded',
        }),
      ]);
    });

    it('marks unsold goods collected, once and finally', async () => {
      await as(t.field_officer)
        .post(`/warehouse-receipts/${receiptB}/collect`)
        .expect(403);
      const res = await as(t.warehouse)
        .post(`/warehouse-receipts/${receiptB}/collect`)
        .expect(200);
      expect(res.body.data.status).toBe('collected');
      await as(t.warehouse)
        .post(`/warehouse-receipts/${receiptB}/collect`)
        .expect(409);
      await as(t.field_officer)
        .post(`/warehouse-receipts/${receiptB}/handover`)
        .expect(409);
    });
  });

  describe('buy-back and sale', () => {
    it("moves the farmer's receipt to WeGro when an admin accepts the officer's offer", async () => {
      await as(t.farmer)
        .post(`/warehouse-receipts/${receiptA}/handover`)
        .expect(403);
      const offered = await as(t.field_officer)
        .post(`/warehouse-receipts/${receiptA}/handover`)
        .expect(200);
      expect(offered.body.data).toMatchObject({
        status: 'pending_handover',
        pendingHandover: true,
      });
      await as(t.field_officer)
        .post(`/warehouse-receipts/${receiptA}/handover/cancel`)
        .expect(200);
      await as(t.field_officer)
        .post(`/warehouse-receipts/${receiptA}/handover`)
        .expect(200);
      const accepted = await as(t.admin)
        .post(`/warehouse-receipts/${receiptA}/handover/accept`)
        .expect(200);
      expect(accepted.body.data).toMatchObject({
        status: 'issued',
        pendingHandover: false,
        owner: { kind: 'wegro', id: null, name: 'WeGro' },
      });
      await as(t.admin)
        .post(`/warehouse-receipts/${receiptA}/handover/accept`)
        .expect(409);
    });

    it('mirrors a sale: the buyer gets a split-off receipt and the rest stays listed', async () => {
      // The marketplace API comes with item 18; drive the ledger directly here.
      const tx = chain.app.get(TransactionService);
      const applier = chain.app.get(ReceiptApplier);
      const as_ = (role: string) => user[role].keyIndex;
      const apply = async (
        result: Awaited<ReturnType<TransactionService['send']>>,
      ) => {
        await applier.apply(result);
        return result;
      };
      const listed = await apply(
        await tx.send(as_(Role.Admin), 'TradeLedger', (c) =>
          c.listReceipt.populateTransaction(receiptA, 3000n),
        ),
      );
      const listingId = listed.events.find((e) => e.name === 'ListingCreated')!
        .args.listingId as bigint;
      const offer = await apply(
        await tx.send(as_(Role.Buyer), 'TradeLedger', (c) =>
          c.makeOffer.populateTransaction(listingId, 2000n, 3100n),
        ),
      );
      const offerId = offer.events.find((e) => e.name === 'OfferMade')!.args
        .offerId as bigint;
      await apply(
        await tx.send(as_(Role.Admin), 'TradeLedger', (c) =>
          c.approveOffer.populateTransaction(offerId),
        ),
      );
      const paid = await apply(
        await tx.send(as_(Role.Accounts), 'TradeLedger', (c) =>
          c.confirmBuyerPayment.populateTransaction(
            offerId,
            hashPaymentRef(`SALE-${RUN}`, 'p'.repeat(32)),
          ),
        ),
      );
      const childId = String(
        paid.events.find((e) => e.name === 'ReceiptSplit')!.args.childId,
      );

      const parent = (
        await as(t.admin).get(`/warehouse-receipts/${receiptA}`).expect(200)
      ).body.data;
      expect(parent).toMatchObject({
        status: 'listed',
        quantity: 3000,
        originalQuantity: 5000,
        children: [childId],
      });
      const child = (
        await as(t.buyer).get(`/warehouse-receipts/${childId}`).expect(200)
      ).body.data;
      expect(child).toMatchObject({
        status: 'sold',
        quantity: 2000,
        parentId: receiptA,
        owner: { kind: 'buyer', id: user.buyer.id, name: 'Demo Buyer' },
      });
      const check = (
        await http.get(`/api/verify/receipts/${childId}`).expect(200)
      ).body.data;
      expect(check).toMatchObject({
        genuine: true,
        partOfLargerReceipt: true,
        quantity: 2000,
        status: 'sold',
      });
    });

    it('refuses a handover once the receipt has expired by the chain clock', async () => {
      const c = (
        await as(t.warehouse)
          .post(
            '/warehouse-receipts',
            await intake({ quantity: 10, expiresOn: await day() }),
          )
          .expect(201)
      ).body.data.id;
      const provider = chain.app.get(ContractsRegistry).provider;
      await provider.send('evm_increaseTime', [2 * 86_400]);
      await provider.send('evm_mine', []);
      await new Promise((r) => setTimeout(r, 1100));
      const res = await as(t.field_officer)
        .post(`/warehouse-receipts/${c}/handover`)
        .expect(409);
      expect(res.body.message).toMatch(/expired/);
      expect(
        (await as(t.warehouse).get(`/warehouse-receipts/${c}`).expect(200)).body
          .data.expired,
      ).toBe(true);
    });
  });

  describe('integrity', () => {
    it('rebuilds identical sites, operators and receipts from the ledger', async () => {
      const snapshot = async () => ({
        receipts: await db.query(
          'SELECT id, status, owner_id, owner_is_wegro, quantity, expires_on, parent_id FROM warehouse_receipts ORDER BY id',
        ),
        sites: await db.query(
          'SELECT id, status FROM warehouse_sites ORDER BY id',
        ),
        operators: await db.query(
          'SELECT operator_id, site_id FROM warehouse_operators ORDER BY operator_id',
        ),
        rechecks: await db.query(
          'SELECT id, status FROM receipt_rechecks ORDER BY id',
        ),
      });
      const indexer = chain.app.get(EventIndexerService);
      await indexer.catchUp();
      const before = await snapshot();
      await indexer.reindex();
      await indexer.catchUp();
      expect(await snapshot()).toEqual(before);
    });

    it('refuses impossible quantities at the database level', async () => {
      await expect(
        db.query(
          'UPDATE warehouse_receipts SET quantity = original_quantity + 1 WHERE id = $1',
          [receiptA],
        ),
      ).rejects.toThrow(/ck_warehouse_receipts_quantity/);
    });
  });
});
