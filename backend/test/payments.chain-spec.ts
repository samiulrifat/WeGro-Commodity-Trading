/** Paying for bookings end to end: payment accounts, proofs, the stopped clock, confirmation, refunds. */
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ContractsRegistry } from '../src/blockchain/contracts.registry';
import { uuidToBytes32 } from '../src/blockchain/utils/ids';
import { User } from '../src/modules/users/entities/user.entity';
import { Role } from '../src/modules/users/roles';
import {
  type ChainApp,
  demoToken,
  startChainApp,
  waitForDemoAccounts,
} from './support/chain-app';
import { travel } from './support/chain-time';

// Payment references are used once, across runs too: make them unique.
const RUN = randomBytes(4).toString('hex').toUpperCase();
const ref = (name: string) => `${name}-${RUN}`;

/** A minimal JPEG (structure only). */
function jpeg(label: string): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x07]),
    Buffer.from('JFIF\0', 'latin1'),
    Buffer.from([0xff, 0xda, 0x00, 0x04, 0x01, 0x02]),
    Buffer.from(label, 'latin1'),
    Buffer.from([0xff, 0xd9]),
  ]);
}
const pdf = (label: string) => Buffer.from(`%PDF-1.4\n% ${label}\n%%EOF\n`);

describe('Payments (node + database)', () => {
  let chain: ChainApp;
  let http: ReturnType<typeof request>;
  let db: DataSource;
  let admin: string;
  let accounts: string;
  let investor: string;
  let buyer: string;
  let farmerId: string;
  let projectId: string;
  const ledger = () => chain.app.get(ContractsRegistry).get('ProjectLedger');

  beforeAll(async () => {
    chain = await startChainApp({ DEMO_MODE: 'true' });
    http = request(chain.app.getHttpServer());
    db = chain.app.get(DataSource);
    await waitForDemoAccounts(chain);
    [admin, accounts, investor, buyer] = await Promise.all(
      [Role.ADMIN, Role.ACCOUNTS, Role.INVESTOR, Role.BUYER].map((r) =>
        demoToken(http, r),
      ),
    );
    farmerId = (
      await db
        .getRepository(User)
        .findOneByOrFail({ role: Role.FARMER, isDemo: true })
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
    put: (path: string) =>
      http.put(`/api${path}`).auth(token, { type: 'bearer' }),
    delete: (path: string) =>
      http.delete(`/api${path}`).auth(token, { type: 'bearer' }),
  });

  /** A proof: the fields as a multipart form with the files. */
  const sendProof = (
    reservation: number,
    fields: Record<string, string>,
    files: Array<[Buffer, string]> = [[jpeg('slip'), 'slip.jpg']],
  ) => {
    let req = http
      .post(`/api/reservations/${reservation}/proofs`)
      .auth(investor, { type: 'bearer' });
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    for (const [data, name] of files) req = req.attach('files', data, name);
    return req;
  };
  const today = () =>
    new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10);

  describe('payment accounts', () => {
    it('are kept by Accounts from the bank list, and shown to investors while in use', async () => {
      const made = await as(accounts)
        .post('/payment-accounts', {
          routingNumber: '200100405',
          accountName: 'WEGRO TECHNOLOGIES LTD',
          accountNumber: '1042 1120 0000 0463',
        })
        .expect(201);
      expect(made.body.data).toMatchObject({
        bankName: 'SONALI BANK LTD.',
        branchName: 'BOGRA BAZAR',
        accountNumber: '1042112000000463',
        active: true,
      });
      await as(investor).post('/payment-accounts', made.body.data).expect(403);
      await as(accounts)
        .post('/payment-accounts', {
          routingNumber: '999999999',
          accountName: 'X',
          accountNumber: '123456',
        })
        .expect(422);
      // The same branch and number once only.
      const again = await as(accounts)
        .post('/payment-accounts', {
          routingNumber: '200100405',
          accountName: 'WEGRO TECHNOLOGIES LTD',
          accountNumber: '1042112000000463',
        })
        .expect(409);
      expect(again.body.code).toBe('PAYMENT_ACCOUNT_EXISTS');
      const shown = await as(investor).get('/payment-accounts').expect(200);
      expect(shown.body.data.map((a: { id: string }) => a.id)).toContain(
        made.body.data.id,
      );
      await as(accounts)
        .patch(`/payment-accounts/${made.body.data.id}`, { active: false })
        .expect(200);
      const after = await as(investor).get('/payment-accounts').expect(200);
      expect(after.body.data.map((a: { id: string }) => a.id)).not.toContain(
        made.body.data.id,
      );
      const all = await as(accounts).get('/payment-accounts/all').expect(200);
      expect(all.body.data.map((a: { id: string }) => a.id)).toContain(
        made.body.data.id,
      );
    });
  });

  describe('projects for investors', () => {
    it('take a cover photo while drafted, and are found by words and saved as favourites', async () => {
      const res = await as(admin)
        .post('/projects', {
          title: `Shibganj potato ${RUN}`,
          produceCode: 'POTATO',
          districtCode: 'BOGURA',
          location: 'Shibganj upazila',
          farmerId,
          durationType: 'short_term',
          durationMonths: 4,
          fundingTarget: '100000',
          slotPrice: '20000',
          estimatedReturnMinBps: 800,
          estimatedReturnMaxBps: 1200,
        })
        .expect(201);
      projectId = res.body.data.id;
      const covered = await http
        .post(`/api/projects/${projectId}/cover`)
        .auth(admin, { type: 'bearer' })
        .attach('file', jpeg(`cover-${RUN}`), 'cover.jpg')
        .expect(200);
      expect(covered.body.data.coverPhotoUrl).toBe(
        `/api/projects/${projectId}/cover`,
      );
      await as(admin).post(`/projects/${projectId}/publish`).expect(200);
      // Terms and picture are fixed once published.
      await http
        .post(`/api/projects/${projectId}/cover`)
        .auth(admin, { type: 'bearer' })
        .attach('file', jpeg('later'), 'later.jpg')
        .expect(409);
      const photo = await as(investor)
        .get(`/projects/${projectId}/cover`)
        .expect(200);
      expect(photo.headers['content-type']).toBe('image/jpeg');

      const found = await as(investor)
        .get(`/projects?q=${encodeURIComponent(`shib ${RUN}`)}`)
        .expect(200);
      expect(found.body.data.map((p: { id: string }) => p.id)).toEqual([
        projectId,
      ]);
      const byCrop = await as(investor)
        .get(`/projects?q=${encodeURIComponent(`আলু ${RUN}`)}`)
        .expect(200);
      expect(byCrop.body.data).toHaveLength(1);

      const saved = await as(investor)
        .put(`/projects/${projectId}/favourite`)
        .expect(200);
      expect(saved.body.data.favourite).toBe(true);
      const mine = await as(investor)
        .get('/projects?favourites=true')
        .expect(200);
      expect(mine.body.data.map((p: { id: string }) => p.id)).toContain(
        projectId,
      );
      await as(buyer).put(`/projects/${projectId}/favourite`).expect(403);
      const off = await as(investor)
        .delete(`/projects/${projectId}/favourite`)
        .expect(200);
      expect(off.body.data.favourite).toBe(false);
    });
  });

  describe('the super admin', () => {
    it('drafts, publishes and cancels a project like an admin', async () => {
      const superAdmin = await demoToken(http, Role.SUPER_ADMIN);
      const res = await as(superAdmin)
        .post('/projects', {
          title: `Super admin lentil ${RUN}`,
          produceCode: 'LENTIL',
          districtCode: 'BOGURA',
          location: 'Sherpur upazila',
          farmerId,
          durationType: 'short_term',
          durationMonths: 4,
          fundingTarget: '50000',
          slotPrice: '10000',
          estimatedReturnMinBps: 600,
          estimatedReturnMaxBps: 900,
        })
        .expect(201);
      const id = res.body.data.id;
      const published = await as(superAdmin)
        .post(`/projects/${id}/publish`)
        .expect(200);
      expect(published.body.data.stage).toBe('open_for_funding');
      await as(superAdmin).post(`/projects/${id}/cancel`).expect(200);
      // Still not Accounts' to do.
      await as(accounts).post(`/projects/${id}/publish`).expect(403);
    });
  });

  describe('proofs', () => {
    let booking: number;
    let first: string;

    it('stop the clock, are paid in parts, and confirm the booking on the ledger when they add up', async () => {
      const reserved = await as(investor)
        .post(`/projects/${projectId}/reservations`, { slots: 2 })
        .expect(201);
      booking = reserved.body.data.id;
      expect(reserved.body.data).toMatchObject({
        amount: '40000.00',
        paid: '0.00',
        remaining: '40000.00',
        onHold: false,
      });
      const project = await as(investor)
        .get(`/projects/${projectId}`)
        .expect(200);
      expect(project.body.data.investingToday).toBe(1);

      // More than is owed, a bank deposit without its bank, a future date: refused.
      await sendProof(booking, {
        amount: '40001',
        transferredOn: today(),
        method: 'cash',
      }).expect(422);
      const noBank = await sendProof(booking, {
        amount: '10000',
        transferredOn: today(),
        method: 'bank_deposit',
      }).expect(422);
      expect(noBank.body.code).toBe('PROOF_BANK_REQUIRED');
      await sendProof(
        booking,
        { amount: '10000', transferredOn: today(), method: 'cash' },
        [[Buffer.from('not a picture'), 'x.txt']],
      ).expect(415);

      const sent = await sendProof(
        booking,
        {
          amount: '15000',
          transferredOn: today(),
          method: 'bank_deposit',
          bankCode: '200',
          reference: 'TRX 1',
          note: 'First part',
        },
        [
          [jpeg('slip-1'), 'slip.jpg'],
          [pdf('statement'), 'statement.pdf'],
        ],
      ).expect(201);
      first = sent.body.data.id;
      expect(sent.body.data).toMatchObject({
        status: 'pending',
        amount: '15000.00',
        bankName: 'SONALI BANK LTD.',
        reference: 'TRX 1',
      });
      expect(sent.body.data.files).toHaveLength(2);
      await expect(ledger().pausedRemaining(booking)).resolves.toBeGreaterThan(
        0n,
      );
      const held = await as(investor)
        .get(`/reservations/${booking}`)
        .expect(200);
      expect(held.body.data).toMatchObject({
        onHold: true,
        underReview: '15000.00',
        remaining: '25000.00',
      });

      // The file opens decrypted, as sent; the stored copy is not the file.
      const file = await http
        .get(sent.body.data.files[1].url)
        .auth(accounts, { type: 'bearer' })
        .expect(200);
      expect(file.headers['content-type']).toBe('application/pdf');
      expect(Buffer.from(file.body as Buffer).toString()).toContain(
        'statement',
      );
      await http
        .get(sent.body.data.files[1].url)
        .auth(buyer, { type: 'bearer' })
        .expect(403);

      // Days pass under review: it does not expire.
      await travel(chain.app, 8 * 24 * 3600);
      const queue = await as(accounts)
        .get('/payment-proofs?status=pending&limit=100')
        .expect(200);
      expect(queue.body.data.map((p: { id: string }) => p.id)).toContain(first);

      const accepted = await as(accounts)
        .post(`/payment-proofs/${first}/accept`, {
          paymentReference: ref('SONALI 1'),
        })
        .expect(200);
      expect(accepted.body.data).toMatchObject({
        status: 'accepted',
        verifiedReference: ref('SONALI 1'),
        decided: { by: { fullName: expect.any(String) } },
      });
      // Nothing left under review: the clock runs on for what was left of it.
      const resumed = await as(investor)
        .get(`/reservations/${booking}`)
        .expect(200);
      expect(resumed.body.data).toMatchObject({
        onHold: false,
        paid: '15000.00',
        remaining: '25000.00',
        status: 'pending',
      });
      await expect(ledger().pausedRemaining(booking)).resolves.toBe(0n);

      // Money sent: the investor can no longer cancel it themselves.
      const cancel = await as(investor)
        .post(`/reservations/${booking}/cancel`)
        .expect(409);
      expect(cancel.body.code).toBe('BOOKING_HAS_PAYMENTS');
      // Nor can Accounts confirm it outright, past the proofs.
      const direct = await as(accounts)
        .post(`/reservations/${booking}/confirm`, {
          paymentReference: ref('DIRECT'),
        })
        .expect(409);
      expect(direct.body.code).toBe('PROOFS_TO_REVIEW');

      const rest = await sendProof(booking, {
        amount: '25000',
        transferredOn: today(),
        method: 'cheque',
        bankCode: '185',
      }).expect(201);
      // The same statement line cannot pay twice.
      await as(accounts)
        .post(`/payment-proofs/${rest.body.data.id}/accept`, {
          paymentReference: ref('SONALI 1'),
        })
        .expect(409);
      await as(accounts)
        .post(`/payment-proofs/${rest.body.data.id}/accept`, {
          paymentReference: ref('RUPALI CHQ 2'),
        })
        .expect(200);
      const done = await as(investor)
        .get(`/reservations/${booking}`)
        .expect(200);
      expect(done.body.data).toMatchObject({
        status: 'confirmed',
        paid: '40000.00',
        remaining: '0.00',
      });
      const investorId = (
        await db
          .getRepository(User)
          .findOneByOrFail({ role: Role.INVESTOR, isDemo: true })
      ).id;
      const holding = await ledger().holdingOf(
        uuidToBytes32(projectId),
        uuidToBytes32(investorId),
      );
      expect(holding).toBe(2n);
      await as(accounts)
        .post(`/payment-proofs/${rest.body.data.id}/accept`, {
          paymentReference: ref('AGAIN'),
        })
        .expect(409);
    });

    it('turned down, let the clock run again; nothing sent, the investor cancels', async () => {
      const reserved = await as(investor)
        .post(`/projects/${projectId}/reservations`, { slots: 1 })
        .expect(201);
      const id = reserved.body.data.id;
      const sent = await sendProof(id, {
        amount: '20000',
        transferredOn: today(),
        method: 'cash',
      }).expect(201);
      await as(accounts)
        .post(`/payment-proofs/${sent.body.data.id}/reject`, {
          reason: 'No such deposit on the statement',
        })
        .expect(200);
      const after = await as(investor).get(`/reservations/${id}`).expect(200);
      expect(after.body.data).toMatchObject({ onHold: false, paid: '0.00' });
      const proofs = await as(investor)
        .get(`/reservations/${id}/proofs`)
        .expect(200);
      expect(proofs.body.data[0]).toMatchObject({
        status: 'rejected',
        rejectionReason: 'No such deposit on the statement',
      });
      // The investor never sees Accounts' references.
      expect(proofs.body.data[0]).not.toHaveProperty('verifiedReference');
      await as(investor).post(`/reservations/${id}/cancel`).expect(200);
    });

    it('leave a refund due when an admin cancels a booking already part paid', async () => {
      const reserved = await as(investor)
        .post(`/projects/${projectId}/reservations`, { slots: 1 })
        .expect(201);
      const id = reserved.body.data.id;
      const sent = await sendProof(id, {
        amount: '5000',
        transferredOn: today(),
        method: 'cash',
      }).expect(201);
      await as(accounts)
        .post(`/payment-proofs/${sent.body.data.id}/accept`, {
          paymentReference: ref('CASH 5000'),
        })
        .expect(200);
      await as(admin).post(`/reservations/${id}/cancel`).expect(200);
      const due = await as(accounts)
        .get('/payment-proofs?refund=due&limit=100')
        .expect(200);
      const line = due.body.data.find(
        (p: { id: string }) => p.id === sent.body.data.id,
      );
      expect(line).toMatchObject({
        refund: 'due',
        reservationStatus: 'cancelled',
      });
      await as(accounts)
        .post(`/payment-proofs/${sent.body.data.id}/refund`, {
          paymentReference: ref('REFUND 5000'),
        })
        .expect(200);
      const back = await as(investor)
        .get(`/reservations/${id}/proofs`)
        .expect(200);
      expect(back.body.data[0]).toMatchObject({ refund: 'refunded' });
      await as(accounts)
        .post(`/payment-proofs/${sent.body.data.id}/refund`, {
          paymentReference: ref('REFUND AGAIN'),
        })
        .expect(409);
    });
  });
});
