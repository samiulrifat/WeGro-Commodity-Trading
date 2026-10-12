/** Vouchers, batches and sales end to end, against the local chain and a throwaway schema. */
import { randomBytes, randomInt } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ChainClock } from '../src/blockchain/chain-clock';
import { ContractsRegistry } from '../src/blockchain/contracts.registry';
import { EventIndexerService } from '../src/blockchain/indexer/event-indexer.service';
import { bdDate } from '../src/modules/vouchers/batch-dates';
import { SaleExpiryJob } from '../src/modules/vouchers/sale-expiry.job';
import { User } from '../src/modules/users/entities/user.entity';
import { Role } from '../src/modules/users/roles';
import {
  type ChainApp,
  demoToken,
  startChainApp,
  waitForDemoAccounts,
} from './support/chain-app';

const RUN = randomBytes(4).toString('hex').toUpperCase();

describe('Vouchers (node + database)', () => {
  let chain: ChainApp;
  let http: ReturnType<typeof request>;
  let db: DataSource;
  const t: Record<string, string> = {};
  const id: Record<string, string> = {};
  let projectId: string;
  let voucherId: string;
  let batchId: string;
  let otherSupplier: { id: string; token: string };

  const as = (token: string) => ({
    get: (path: string) =>
      http.get(`/api${path}`).auth(token, { type: 'bearer' }),
    post: (path: string, body: object = {}) =>
      http.post(`/api${path}`).auth(token, { type: 'bearer' }).send(body),
    put: (path: string, body: object) =>
      http.put(`/api${path}`).auth(token, { type: 'bearer' }).send(body),
  });

  async function chainTimeTravel(seconds: number) {
    const provider = chain.app.get(ContractsRegistry).provider;
    await provider.send('evm_increaseTime', [seconds]);
    await provider.send('evm_mine', []);
    // The app reads the chain clock through a one-second cache.
    await new Promise((r) => setTimeout(r, 1100));
  }

  async function chainToday(offsetDays = 0): Promise<string> {
    const now = await chain.app.get(ChainClock).now();
    return bdDate(new Date(now.getTime() + offsetDays * 86_400_000));
  }

  beforeAll(async () => {
    chain = await startChainApp({ DEMO_MODE: 'true' });
    http = request(chain.app.getHttpServer());
    db = chain.app.get(DataSource);
    await waitForDemoAccounts(chain);
    const roles = [
      Role.SuperAdmin,
      Role.Admin,
      Role.Operations,
      Role.Accounts,
      Role.Investor,
      Role.Supplier,
      Role.Farmer,
      Role.FieldOfficer,
      Role.Buyer,
    ];
    const tokens = await Promise.all(roles.map((r) => demoToken(http, r)));
    roles.forEach((r, i) => (t[r] = tokens[i]));
    const users = db.getRepository(User);
    for (const r of [Role.Farmer, Role.Supplier, Role.FieldOfficer]) {
      id[r] = (await users.findOneByOrFail({ role: r, isDemo: true })).id;
    }

    // A second, verified supplier who is not on the voucher.
    const phone = `0191${String(randomInt(1e6, 1e7))}`;
    const reg = await as(t.admin)
      .post('/participants', {
        role: 'supplier',
        fullName: 'Second Supplier',
        phone,
        nid: `${randomInt(2, 9)}${randomInt(1e8, 1e9)}`,
        dateOfBirth: '1985-02-02',
        district: 'BOGURA',
        address: 'Made-up shop address, Bogura',
      })
      .expect(201);
    await as(t.admin)
      .post(`/participants/${reg.body.data.participant.id}/verify`)
      .expect(200);
    const temp = reg.body.data.temporaryPassword;
    const login = await http
      .post('/api/auth/login')
      .send({ phone, password: temp })
      .expect(200);
    const changed = await as(login.body.data.accessToken)
      .post('/auth/change-password', {
        currentPassword: temp,
        newPassword: `${phone}-pw-ok`,
      })
      .expect(200);
    otherSupplier = {
      id: reg.body.data.participant.id,
      token: changed.body.data.accessToken,
    };

    // A funded project: 10 slots of Tk 20,000.
    projectId = (
      await as(t.admin)
        .post('/projects', {
          title: 'Maize for vouchers',
          produceCode: 'MAIZE',
          districtCode: 'BOGURA',
          location: 'Shibganj',
          farmerId: id.farmer,
          durationType: 'long_term',
          durationMonths: 8,
          fundingTarget: '200000',
          slotPrice: '20000',
          estimatedReturnMinBps: 500,
          estimatedReturnMaxBps: 1200,
        })
        .expect(201)
    ).body.data.id;
    await as(t.admin).post(`/projects/${projectId}/publish`).expect(200);
    const r = await as(t.investor)
      .post(`/projects/${projectId}/reservations`, { slots: 10 })
      .expect(201);
    await as(t.accounts)
      .post(`/reservations/${r.body.data.id}/confirm`, {
        paymentReference: `V-${RUN}`,
      })
      .expect(200);
  });

  afterAll(async () => {
    await chain?.close();
  });

  describe('proposing and approving', () => {
    it('lets Operations propose a voucher at a fixed unit price', async () => {
      const res = await as(t.operations)
        .post(`/projects/${projectId}/vouchers`, {
          inputTypeCode: 'UREA',
          quantity: 150,
          unitPrice: '27.50',
          supplierIds: [id.supplier],
        })
        .expect(201);
      voucherId = res.body.data.id;
      expect(res.body.data).toMatchObject({
        status: 'proposed',
        value: '4125.00',
        availableQuantity: 0,
        input: { code: 'UREA', unit: 'kg' },
        farmer: { id: id.farmer, name: 'Demo Farmer' },
        suppliers: [{ id: id.supplier, name: 'Demo Supplier' }],
      });
    });

    it('never commits more than the funding target, and says how much is left', async () => {
      const res = await as(t.operations)
        .post(`/projects/${projectId}/vouchers`, {
          inputTypeCode: 'UREA',
          quantity: 10_000,
          unitPrice: '20',
          supplierIds: [id.supplier],
        })
        .expect(422);
      expect(res.body).toMatchObject({
        code: 'EXCEEDS_FUNDING_TARGET',
        details: { value: '200000.00', room: '195875.00' },
      });
    });

    it('accepts only verified suppliers, each once', async () => {
      const bad = await as(t.operations)
        .post(`/projects/${projectId}/vouchers`, {
          inputTypeCode: 'TSP',
          quantity: 1,
          unitPrice: '1',
          supplierIds: [id.supplier, id.farmer],
        })
        .expect(422);
      expect(bad.body).toMatchObject({
        code: 'SUPPLIER_NOT_VERIFIED',
        details: { supplierIds: [id.farmer] },
      });
      await as(t.operations)
        .post(`/projects/${projectId}/vouchers`, {
          inputTypeCode: 'TSP',
          quantity: 1,
          unitPrice: '1',
          supplierIds: [id.supplier, id.supplier],
        })
        .expect(400);
      await as(t.admin)
        .post(`/projects/${projectId}/vouchers`, {
          inputTypeCode: 'TSP',
          quantity: 1,
          unitPrice: '1',
          supplierIds: [id.supplier],
        })
        .expect(403);
    });

    it('activates the project in the same step as the first approval', async () => {
      await as(t.operations).post(`/vouchers/${voucherId}/approve`).expect(403);
      const res = await as(t.accounts)
        .post(`/vouchers/${voucherId}/approve`)
        .expect(200);
      expect(res.body.data).toMatchObject({
        status: 'active',
        availableQuantity: 150,
        availableBalance: '4125.00',
      });
      // Applied from the receipt, with no indexer run in between.
      const project = await as(t.admin)
        .get(`/projects/${projectId}`)
        .expect(200);
      expect(project.body.data.stage).toBe('active');
      await as(t.accounts).post(`/vouchers/${voucherId}/approve`).expect(409);
    });
  });

  describe('batches and QR codes', () => {
    it('registers a batch and proves it genuine to anyone who scans it', async () => {
      const res = await as(t.supplier)
        .post('/batches', {
          inputTypeCode: 'UREA',
          lotNumber: `KF-${RUN}`,
          quantity: 2000,
          manufacturer: 'Karnaphuli Fertilizer',
          producedOn: await chainToday(-1),
          expiresOn: await chainToday(700),
        })
        .expect(201);
      batchId = res.body.data.id;
      expect(res.body.data).toMatchObject({
        status: 'registered',
        verifyUrl: `http://localhost:5173/verify/batch/${batchId}`,
      });

      const check = await http
        .get(`/api/verify/batches/${batchId}`)
        .expect(200);
      expect(check.body.data).toMatchObject({
        genuine: true,
        expired: false,
        lotNumber: `KF-${RUN}`,
        supplierName: 'Demo Supplier',
        product: { code: 'UREA' },
      });

      const qr = await http
        .get(`/api/verify/batches/${batchId}/qr.svg`)
        .buffer(true)
        .parse(text)
        .expect(200);
      expect(qr.headers['content-type']).toMatch(/image\/svg\+xml/);
      expect(qr.body).toMatch(/^<svg /);
    });

    it('says not genuine for unknown ids, junk and edited records', async () => {
      const unknown = await http
        .get('/api/verify/batches/7d3f2c1a-0b4e-4f6a-9c8d-1e2f3a4b5c6d')
        .expect(200);
      expect(unknown.body.data.genuine).toBe(false);
      expect(
        (await http.get('/api/verify/batches/not-a-batch').expect(200)).body
          .data.genuine,
      ).toBe(false);

      await db.query(
        `UPDATE input_batches SET manufacturer = 'Someone Else' WHERE id = $1`,
        [batchId],
      );
      expect(
        (await http.get(`/api/verify/batches/${batchId}`).expect(200)).body.data
          .genuine,
      ).toBe(false);
      await db.query(
        `UPDATE input_batches SET manufacturer = 'Karnaphuli Fertilizer' WHERE id = $1`,
        [batchId],
      );
      expect(
        (await http.get(`/api/verify/batches/${batchId}`).expect(200)).body.data
          .genuine,
      ).toBe(true);
    });

    it('refuses repeated lot numbers and future production dates', async () => {
      await as(t.supplier)
        .post('/batches', {
          inputTypeCode: 'UREA',
          lotNumber: `KF-${RUN}`,
          producedOn: await chainToday(-1),
        })
        .expect(409);
      await as(t.supplier)
        .post('/batches', {
          inputTypeCode: 'UREA',
          lotNumber: `FUT-${RUN}`,
          producedOn: await chainToday(3),
        })
        .expect(422);
      await as(t.farmer)
        .post('/batches', {
          inputTypeCode: 'UREA',
          lotNumber: 'X',
          producedOn: await chainToday(-1),
        })
        .expect(403);
    });

    it('shows each supplier only their own batches', async () => {
      const mine = await as(t.supplier).get('/batches').expect(200);
      expect(mine.body.data.map((b: { id: string }) => b.id)).toContain(
        batchId,
      );
      await as(otherSupplier.token).get(`/batches/${batchId}`).expect(404);
    });
  });

  describe('sales', () => {
    let saleId: number;

    it('records a sale at the voucher price, holding the quantity', async () => {
      const res = await as(t.supplier)
        .post(`/vouchers/${voucherId}/sales`, {
          quantity: 50,
          batchIds: [batchId],
        })
        .expect(201);
      saleId = res.body.data.id;
      expect(res.body.data).toMatchObject({
        status: 'pending',
        quantity: 50,
        amount: '1375.00',
        batches: [{ id: batchId, lotNumber: `KF-${RUN}` }],
      });
      const v = (await as(t.supplier).get(`/vouchers/${voucherId}`).expect(200))
        .body.data;
      expect(v).toMatchObject({
        heldQuantity: 50,
        availableQuantity: 100,
        availableBalance: '2750.00',
      });
    });

    it('refuses more than is left, batches of another input, and unapproved suppliers', async () => {
      const more = await as(t.supplier)
        .post(`/vouchers/${voucherId}/sales`, { quantity: 101 })
        .expect(409);
      expect(more.body).toMatchObject({
        code: 'EXCEEDS_VOUCHER_QUANTITY',
        details: { available: 100 },
      });

      const tsp = await as(t.supplier)
        .post('/batches', {
          inputTypeCode: 'TSP',
          lotNumber: `TSP-${RUN}`,
          producedOn: await chainToday(-1),
        })
        .expect(201);
      const wrong = await as(t.supplier)
        .post(`/vouchers/${voucherId}/sales`, {
          quantity: 1,
          batchIds: [tsp.body.data.id],
        })
        .expect(422);
      expect(wrong.body.code).toBe('INVALID_BATCHES');

      await as(otherSupplier.token)
        .post(`/vouchers/${voucherId}/sales`, { quantity: 1 })
        .expect(404);
    });

    it("is confirmed by the farmer's own field officer, once", async () => {
      await as(t.supplier).post(`/voucher-sales/${saleId}/confirm`).expect(403);
      const res = await as(t.field_officer)
        .post(`/voucher-sales/${saleId}/confirm`)
        .expect(200);
      expect(res.body.data.status).toBe('confirmed');
      await as(t.field_officer)
        .post(`/voucher-sales/${saleId}/confirm`)
        .expect(409);
      const v = (
        await as(t.operations).get(`/vouchers/${voucherId}`).expect(200)
      ).body.data;
      expect(v).toMatchObject({
        spentQuantity: 50,
        heldQuantity: 0,
        availableQuantity: 100,
      });
      const summary = (
        await as(t.accounts)
          .get(`/projects/${projectId}/voucher-summary`)
          .expect(200)
      ).body.data;
      expect(summary).toMatchObject({
        committed: '4125.00',
        spent: '1375.00',
        pendingSales: '0.00',
        room: '195875.00',
      });
    });

    it('can be cancelled by the farmer, releasing the quantity', async () => {
      const sale = await as(t.supplier)
        .post(`/vouchers/${voucherId}/sales`, { quantity: 30 })
        .expect(201);
      await as(otherSupplier.token)
        .post(`/voucher-sales/${sale.body.data.id}/cancel`)
        .expect(403);
      const res = await as(t.farmer)
        .post(`/voucher-sales/${sale.body.data.id}/cancel`)
        .expect(200);
      expect(res.body.data.status).toBe('cancelled');
      const v = (await as(t.farmer).get(`/vouchers/${voucherId}`).expect(200))
        .body.data;
      expect(v).toMatchObject({ heldQuantity: 0, availableQuantity: 100 });
    });

    it('expires an unconfirmed sale once the chain says so', async () => {
      const sale = await as(t.supplier)
        .post(`/vouchers/${voucherId}/sales`, { quantity: 20 })
        .expect(201);
      const job = chain.app.get(SaleExpiryJob);
      await expect(job.run()).resolves.toBe(0);
      await chainTimeTravel(7 * 86_400 + 1);
      await expect(job.run()).resolves.toBe(1);
      const res = await as(t.field_officer)
        .get(`/voucher-sales?voucherId=${voucherId}&status=expired`)
        .expect(200);
      expect(res.body.data.map((s: { id: number }) => s.id)).toEqual([
        sale.body.data.id,
      ]);
    });
  });

  describe('inactivity limit', () => {
    it('is set only by the super admin and flags the voucher by the chain clock', async () => {
      await as(t.admin)
        .put(`/vouchers/${voucherId}/inactivity-limit`, { days: 3 })
        .expect(403);
      const set = await as(t.super_admin)
        .put(`/vouchers/${voucherId}/inactivity-limit`, { days: 3 })
        .expect(200);
      // Last activity was a sale more than 7 chain-days ago.
      expect(set.body.data.inactivityLimitDays).toBe(3);
      expect(set.body.data.inactiveSince).not.toBeNull();
      const flagged = await as(t.admin)
        .get('/vouchers?inactive=true')
        .expect(200);
      expect(flagged.body.data.map((v: { id: string }) => v.id)).toContain(
        voucherId,
      );

      await as(t.super_admin)
        .put(`/vouchers/${voucherId}/inactivity-limit`, { days: 30 })
        .expect(200);
      const calm = await as(t.admin).get('/vouchers?inactive=true').expect(200);
      expect(calm.body.data.map((v: { id: string }) => v.id)).not.toContain(
        voucherId,
      );
      await as(t.super_admin)
        .put(`/vouchers/${voucherId}/inactivity-limit`, { days: null })
        .expect(200);
      await as(t.super_admin)
        .put(`/vouchers/${voucherId}/inactivity-limit`, { days: 0 })
        .expect(400);
    });
  });

  describe('who sees what', () => {
    it('limits each role to its own part', async () => {
      const ids = async (token: string) =>
        (await as(token).get('/vouchers').expect(200)).body.data.map(
          (v: { id: string }) => v.id,
        );
      expect(await ids(t.farmer)).toContain(voucherId);
      expect(await ids(t.field_officer)).toContain(voucherId);
      expect(await ids(t.supplier)).toContain(voucherId);
      expect(await ids(otherSupplier.token)).not.toContain(voucherId);
      await as(t.buyer).get('/vouchers').expect(403);
      await as(t.investor).get(`/vouchers/${voucherId}`).expect(403);
    });

    it("serves the farmer's voucher QR to those who may see the voucher", async () => {
      const qr = await as(t.farmer)
        .get(`/vouchers/${voucherId}/qr.svg`)
        .expect(200);
      expect(qr.headers['content-type']).toMatch(/image\/svg\+xml/);
      await as(otherSupplier.token)
        .get(`/vouchers/${voucherId}/qr.svg`)
        .expect(404);
    });
  });

  describe('cancelling and integrity', () => {
    it('voids the unused balance when an admin cancels', async () => {
      const res = await as(t.admin)
        .post(`/vouchers/${voucherId}/cancel`)
        .expect(200);
      // 150 - 50 spent, nothing held: 100 x Tk 27.50.
      expect(res.body.data).toMatchObject({
        status: 'cancelled',
        voidedAmount: '2750.00',
        availableQuantity: 0,
      });
      await as(t.supplier)
        .post(`/vouchers/${voucherId}/sales`, { quantity: 1 })
        .expect(409);
    });

    it('rebuilds identical vouchers, sales and batches from the ledger', async () => {
      const snapshot = async () => ({
        vouchers: await db.query(
          'SELECT id, status, spent_quantity, held_quantity, voided_amount, last_activity_at FROM vouchers ORDER BY id',
        ),
        sales: await db.query(
          'SELECT id, status, quantity, confirmed_by_id FROM voucher_sales ORDER BY id',
        ),
        links: await db.query(
          'SELECT sale_id, batch_id FROM voucher_sale_batches ORDER BY sale_id, batch_id',
        ),
        batches: await db.query(
          'SELECT id, status FROM input_batches ORDER BY id',
        ),
        projects: await db.query('SELECT id, stage FROM projects ORDER BY id'),
      });
      const indexer = chain.app.get(EventIndexerService);
      await indexer.catchUp(); // block times replace the receipt-time stamps
      const before = await snapshot();
      await indexer.reindex();
      await indexer.catchUp();
      expect(await snapshot()).toEqual(before);
    });

    it('refuses an impossible balance at the database level', async () => {
      await expect(
        db.query(
          'UPDATE vouchers SET spent_quantity = quantity + 1 WHERE id = $1',
          [voucherId],
        ),
      ).rejects.toThrow(/ck_vouchers_balance/);
    });
  });
});

/** Read an image/svg+xml response as text (supertest buffers images as binary). */
function text(
  res: request.Response,
  done: (err: Error | null, body: string) => void,
) {
  const stream = res as unknown as NodeJS.ReadableStream;
  let body = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk: string) => (body += chunk));
  stream.on('end', () => done(null, body));
}
