/** Paying for deals end to end: proofs, the stopped clock, confirmation, refunds. */
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ContractsRegistry } from '../src/blockchain/contracts.registry';
import { DealExpiryJob } from '../src/modules/trade/deal-expiry.job';
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

describe('Paying for deals (node + database)', () => {
  let chain: ChainApp;
  let http: ReturnType<typeof request>;
  let db: DataSource;
  let admin: string;
  let accounts: string;
  let investor: string;
  let buyer: string;
  let auditor: string;
  let fieldOfficer: string;
  let otherBuyer: string;
  let farmerId: string;
  let listing: number;
  const ledger = () => chain.app.get(ContractsRegistry).get('TradeLedger');

  const as = (token: string) => ({
    get: (path: string) =>
      http.get(`/api${path}`).auth(token, { type: 'bearer' }),
    post: (path: string, body: object = {}) =>
      http.post(`/api${path}`).auth(token, { type: 'bearer' }).send(body),
  });

  beforeAll(async () => {
    chain = await startChainApp({ DEMO_MODE: 'true' });
    http = request(chain.app.getHttpServer());
    db = chain.app.get(DataSource);
    await waitForDemoAccounts(chain);
    [admin, accounts, investor, buyer, auditor, fieldOfficer] =
      await Promise.all(
        [
          Role.ADMIN,
          Role.ACCOUNTS,
          Role.INVESTOR,
          Role.BUYER,
          Role.AUDITOR,
          Role.FIELD_OFFICER,
        ].map((r) => demoToken(http, r)),
      );
    farmerId = (
      await db
        .getRepository(User)
        .findOneByOrFail({ role: Role.FARMER, isDemo: true })
    ).id;

    // A second buyer, who must never reach the first one's money.
    const phone = `0194${String(randomInt(1e6, 1e7))}`;
    const reg = await as(admin)
      .post('/participants', {
        role: 'buyer',
        fullName: 'Other Buyer',
        phone,
        nid: `${randomInt(2, 9)}${randomInt(1e8, 1e9)}`,
        dateOfBirth: '1984-04-04',
        district: 'DHAKA',
        address: 'Made-up trading address, Dhaka',
      })
      .expect(201);
    await as(admin)
      .post(`/participants/${reg.body.data.participant.id}/verify`)
      .expect(200);
    const temp = reg.body.data.temporaryPassword;
    const login = await http
      .post('/api/auth/login')
      .send({ phone, password: temp })
      .expect(200);
    otherBuyer = (
      await as(login.body.data.accessToken)
        .post('/auth/change-password', {
          currentPassword: temp,
          newPassword: `${phone}-pw-ok`,
        })
        .expect(200)
    ).body.data.accessToken;

    // An active project of fresh tomatoes, listed for sale.
    const project = (
      await as(admin)
        .post('/projects', {
          title: `Tomato for sale ${RUN}`,
          produceCode: 'TOMATO',
          districtCode: 'BOGURA',
          location: 'Shibganj',
          farmerId,
          durationType: 'short_term',
          durationMonths: 5,
          fundingTarget: '50000',
          slotPrice: '10000',
          estimatedReturnMinBps: 0,
          estimatedReturnMaxBps: 500,
        })
        .expect(201)
    ).body.data.id;
    await as(admin).post(`/projects/${project}/publish`).expect(200);
    const booked = await as(investor)
      .post(`/projects/${project}/reservations`, { slots: 5 })
      .expect(201);
    await as(accounts)
      .post(`/reservations/${booked.body.data.id}/confirm`, {
        paymentReference: ref('FUND'),
      })
      .expect(200);
    await as(admin).post(`/projects/${project}/activate`).expect(200);
    listing = (
      await as(admin)
        .post('/listings/produce', {
          projectId: project,
          quantity: 100_000,
          askingUnitPrice: '40',
        })
        .expect(201)
    ).body.data.id;
  });

  afterAll(async () => {
    await chain?.close();
  });

  /** A proof: the fields as a multipart form with the files. */
  const sendProof = (
    offer: number,
    fields: Record<string, string>,
    files: Array<[Buffer, string]> = [[jpeg('slip'), 'slip.jpg']],
    token = buyer,
  ) => {
    let req = http
      .post(`/api/offers/${offer}/proofs`)
      .auth(token, { type: 'bearer' });
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    for (const [data, name] of files) req = req.attach('files', data, name);
    return req;
  };
  const today = () =>
    new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10);

  /** An approved deal of the demo buyer's: what the buyer pays comes back with it. */
  async function approvedDeal(
    quantity = 100,
  ): Promise<{ id: number; buyerPays: string }> {
    const made = await as(buyer)
      .post(`/listings/${listing}/offers`, { quantity, unitPrice: '40' })
      .expect(201);
    const done = await as(admin)
      .post(`/offers/${made.body.data.id}/approve`)
      .expect(200);
    return { id: done.body.data.id, buyerPays: done.body.data.buyerPays };
  }

  const notices = async (token: string, offer: number, kind: string) => {
    const all = await as(token).get('/notifications?limit=100').expect(200);
    return (
      all.body.data.items as Array<{
        kind: string;
        subject: { type: string; id: string };
      }>
    ).filter((n) => n.kind === kind && n.subject?.id === String(offer));
  };

  it('stop the clock, are paid in parts, and confirm the deal on the ledger when they add up', async () => {
    const { id, buyerPays } = await approvedDeal();
    const whole = Number(buyerPays);
    const before = await as(buyer).get(`/offers/${id}`).expect(200);
    expect(before.body.data).toMatchObject({
      status: 'approved',
      onHold: false,
      paid: '0.00',
      underReview: '0.00',
      remaining: buyerPays,
    });
    expect(whole).toBeGreaterThan(4000); // The fee is part of what is paid.

    // More than is owed, a bank deposit without its bank, not a picture: refused.
    const over = await sendProof(id, {
      amount: String(whole + 1),
      transferredOn: today(),
      method: 'cash',
    }).expect(422);
    expect(over.body.code).toBe('PROOF_AMOUNT_INVALID');
    const noBank = await sendProof(id, {
      amount: '1000',
      transferredOn: today(),
      method: 'bank_deposit',
    }).expect(422);
    expect(noBank.body.code).toBe('PROOF_BANK_REQUIRED');
    await sendProof(
      id,
      { amount: '1000', transferredOn: today(), method: 'cash' },
      [[Buffer.from('not a picture'), 'x.txt']],
    ).expect(415);

    const sent = await sendProof(
      id,
      {
        amount: '1500',
        transferredOn: today(),
        method: 'bank_deposit',
        routingNumber: '200010074',
        reference: 'TRX 1',
        note: 'First part',
      },
      [
        [jpeg('slip-1'), 'slip.jpg'],
        [pdf('statement'), 'statement.pdf'],
      ],
    ).expect(201);
    const first = sent.body.data.id as string;
    expect(sent.body.data).toMatchObject({
      offerId: id,
      status: 'pending',
      amount: '1500.00',
      dealTotal: buyerPays,
      dealStatus: 'approved',
      bankName: 'SONALI BANK LTD.',
      branchName: 'BAGERHAT',
      districtName: 'BAGERHAT',
      routingNumber: '200010074',
      reference: 'TRX 1',
      produce: { code: 'TOMATO' },
      quantity: 100,
    });
    expect(sent.body.data.files).toHaveLength(2);
    await expect(ledger().pausedRemaining(id)).resolves.toBeGreaterThan(0n);
    expect(await notices(accounts, id, 'deal-proof.submitted')).toHaveLength(1);
    const held = await as(buyer).get(`/offers/${id}`).expect(200);
    expect(held.body.data).toMatchObject({
      onHold: true,
      overdue: false,
      underReview: '1500.00',
      remaining: (whole - 1500).toFixed(2),
    });
    expect(held.body.data.pausedRemainingSeconds).toBeGreaterThan(0);

    // Who else sees the money: payment staff yes; the seller's side not.
    const staff = await as(auditor).get(`/offers/${id}`).expect(200);
    expect(staff.body.data.underReview).toBe('1500.00');
    const sellerSide = await as(fieldOfficer).get(`/offers/${id}`).expect(200);
    expect(sellerSide.body.data.onHold).toBe(true);
    expect(sellerSide.body.data).not.toHaveProperty('paid');
    expect(sellerSide.body.data).not.toHaveProperty('remaining');

    // The file opens decrypted, as sent, only for those it is for.
    const url = sent.body.data.files[1].url as string;
    const file = await http
      .get(url)
      .auth(accounts, { type: 'bearer' })
      .expect(200);
    expect(file.headers['content-type']).toBe('application/pdf');
    expect(Buffer.from(file.body as Buffer).toString()).toContain('statement');
    await http.get(url).auth(buyer, { type: 'bearer' }).expect(200);
    await http.get(url).auth(otherBuyer, { type: 'bearer' }).expect(404);
    await http.get(url).auth(investor, { type: 'bearer' }).expect(403);
    await as(otherBuyer).get(`/offers/${id}/proofs`).expect(404);
    await as(fieldOfficer).get(`/offers/${id}/proofs`).expect(403);
    await sendProof(
      id,
      { amount: '1', transferredOn: today(), method: 'cash' },
      undefined,
      otherBuyer,
    ).expect(404);

    // Days pass under review: it does not lapse.
    await travel(chain.app, 8 * 24 * 3600);
    await chain.app.get(DealExpiryJob).run();
    const waited = await as(buyer).get(`/offers/${id}`).expect(200);
    expect(waited.body.data).toMatchObject({
      status: 'approved',
      overdue: false,
    });
    const queue = await as(accounts)
      .get('/deal-proofs?status=pending&limit=100')
      .expect(200);
    expect(queue.body.data.map((p: { id: string }) => p.id)).toContain(first);
    await as(buyer).get('/deal-proofs').expect(403);
    await as(buyer)
      .post(`/deal-proofs/${first}/accept`, { paymentReference: 'NOPE' })
      .expect(403);

    const accepted = await as(accounts)
      .post(`/deal-proofs/${first}/accept`, {
        paymentReference: ref('SONALI 1'),
      })
      .expect(200);
    expect(accepted.body.data).toMatchObject({
      status: 'accepted',
      verifiedReference: ref('SONALI 1'),
      refund: 'none',
      decided: { by: { fullName: expect.any(String) } },
    });
    expect(await notices(buyer, id, 'deal-proof.accepted')).toHaveLength(1);
    // Nothing left under review: the clock runs on for what was left of it.
    const resumed = await as(buyer).get(`/offers/${id}`).expect(200);
    expect(resumed.body.data).toMatchObject({
      onHold: false,
      overdue: false,
      status: 'approved',
      paid: '1500.00',
      remaining: (whole - 1500).toFixed(2),
    });
    await expect(ledger().pausedRemaining(id)).resolves.toBe(0n);
    expect(new Date(resumed.body.data.paymentDueAt).getTime()).toBe(
      Number((await ledger().getOffer(id)).paymentDueAt) * 1000,
    );

    // Accounts cannot confirm it outright, past the proofs.
    const direct = await as(accounts)
      .post(`/offers/${id}/payment`, { paymentReference: ref('DIRECT') })
      .expect(409);
    expect(direct.body.code).toBe('DEAL_PROOFS_TO_REVIEW');

    const rest = await sendProof(id, {
      amount: (whole - 1500).toFixed(2),
      transferredOn: today(),
      method: 'cheque',
      routingNumber: '185010078',
    }).expect(201);
    // Everything is sent: nothing more can be.
    const nothingLeft = await sendProof(id, {
      amount: '1',
      transferredOn: today(),
      method: 'cash',
    }).expect(422);
    expect(nothingLeft.body.details).toEqual({ remaining: '0.00' });
    // The same statement line cannot pay twice.
    const twice = await as(accounts)
      .post(`/deal-proofs/${rest.body.data.id}/accept`, {
        paymentReference: ref('SONALI 1'),
      })
      .expect(409);
    expect(twice.body.code).toBe('PAYMENT_REF_ALREADY_USED');
    await as(accounts)
      .post(`/deal-proofs/${rest.body.data.id}/accept`, {
        paymentReference: ref('RUPALI CHQ 2'),
      })
      .expect(200);
    const done = await as(buyer).get(`/offers/${id}`).expect(200);
    expect(done.body.data).toMatchObject({
      status: 'paid',
      onHold: false,
      paid: buyerPays,
      remaining: '0.00',
    });
    expect(done.body.data.paidAt).toEqual(expect.any(String));
    expect(Number((await ledger().getOffer(id)).status)).toBeGreaterThan(0);
    await expect(ledger().pausedRemaining(id)).resolves.toBe(0n);
    expect(await notices(buyer, id, 'deal.paid')).toHaveLength(1);
    const decided = await as(accounts)
      .post(`/deal-proofs/${rest.body.data.id}/accept`, {
        paymentReference: ref('AGAIN'),
      })
      .expect(409);
    expect(decided.body.code).toBe('PROOF_ALREADY_DECIDED');
  });

  it('confirm the deal at once when one proof covers it all', async () => {
    const { id, buyerPays } = await approvedDeal(50);
    const sent = await sendProof(id, {
      amount: buyerPays,
      transferredOn: today(),
      method: 'cash',
    }).expect(201);
    await as(accounts)
      .post(`/deal-proofs/${sent.body.data.id}/accept`, {
        paymentReference: ref('WHOLE'),
      })
      .expect(200);
    const done = await as(accounts).get(`/offers/${id}`).expect(200);
    expect(done.body.data.status).toBe('paid');
    expect(done.body.data.paymentReference).toBe(ref('WHOLE'));
  });

  it('turned down, let the clock run again and the buyer send another', async () => {
    const { id, buyerPays } = await approvedDeal(20);
    const sent = await sendProof(id, {
      amount: buyerPays,
      transferredOn: today(),
      method: 'cash',
    }).expect(201);
    await as(accounts)
      .post(`/deal-proofs/${sent.body.data.id}/reject`, {
        reason: 'No such deposit on the statement',
      })
      .expect(200);
    expect(await notices(buyer, id, 'deal-proof.rejected')).toHaveLength(1);
    const after = await as(buyer).get(`/offers/${id}`).expect(200);
    expect(after.body.data).toMatchObject({
      onHold: false,
      paid: '0.00',
      remaining: buyerPays,
    });
    const proofs = await as(buyer).get(`/offers/${id}/proofs`).expect(200);
    expect(proofs.body.data[0]).toMatchObject({
      status: 'rejected',
      rejectionReason: 'No such deposit on the statement',
    });
    // The buyer never sees Accounts' references.
    expect(proofs.body.data[0]).not.toHaveProperty('verifiedReference');
    // With no proof accepted or waiting, Accounts may confirm it outright.
    await as(accounts)
      .post(`/offers/${id}/payment`, { paymentReference: ref('OUTRIGHT') })
      .expect(200);
  });

  it('stay on hold until the last one under review is decided', async () => {
    const { id, buyerPays } = await approvedDeal(30);
    const one = await sendProof(id, {
      amount: '100',
      transferredOn: today(),
      method: 'cash',
    }).expect(201);
    const two = await sendProof(id, {
      amount: '200',
      transferredOn: today(),
      method: 'cash',
    }).expect(201);
    await as(accounts)
      .post(`/deal-proofs/${one.body.data.id}/reject`, {
        reason: 'Not on the statement',
      })
      .expect(200);
    const still = await as(buyer).get(`/offers/${id}`).expect(200);
    expect(still.body.data).toMatchObject({
      onHold: true,
      underReview: '200.00',
    });
    await as(accounts)
      .post(`/deal-proofs/${two.body.data.id}/accept`, {
        paymentReference: ref('PART 200'),
      })
      .expect(200);
    const running = await as(buyer).get(`/offers/${id}`).expect(200);
    expect(running.body.data).toMatchObject({
      onHold: false,
      paid: '200.00',
      remaining: (Number(buyerPays) - 200).toFixed(2),
    });
  });

  it('refuse what cannot be a payment, and answer 404 for what does not exist', async () => {
    const { id } = await approvedDeal(10);
    const tomorrow = new Date(Date.now() + 30 * 3600_000)
      .toISOString()
      .slice(0, 10);
    const future = await sendProof(id, {
      amount: '50',
      transferredOn: tomorrow,
      method: 'cash',
    }).expect(422);
    expect(future.body.code).toBe('PROOF_DATE_FUTURE');
    const noFile = await sendProof(
      id,
      { amount: '50', transferredOn: today(), method: 'cash' },
      [],
    ).expect(400);
    expect(noFile.body.code).toBe('PROOF_FILE_COUNT');
    const zero = await sendProof(id, {
      amount: '0',
      transferredOn: today(),
      method: 'cash',
    }).expect(422);
    expect(zero.body.code).toBe('PROOF_AMOUNT_INVALID');

    // An offer not yet a deal has nothing to pay.
    const made = await as(buyer)
      .post(`/listings/${listing}/offers`, { quantity: 5, unitPrice: '40' })
      .expect(201);
    const early = await sendProof(made.body.data.id, {
      amount: '50',
      transferredOn: today(),
      method: 'cash',
    }).expect(409);
    expect(early.body.code).toBe('OFFER_WRONG_STATUS');
    const unapproved = await as(buyer)
      .get(`/offers/${made.body.data.id}`)
      .expect(200);
    expect(unapproved.body.data.remaining).toBeNull();

    const sent = await sendProof(id, {
      amount: '50',
      transferredOn: today(),
      method: 'cash',
    }).expect(201);
    const blank = await as(accounts)
      .post(`/deal-proofs/${sent.body.data.id}/accept`, {
        paymentReference: '   ',
      })
      .expect(422);
    expect(blank.body.code).toBe('PAYMENT_REF_INVALID');
    // Accepted money of a deal that stands is not refunded.
    await as(accounts)
      .post(`/deal-proofs/${sent.body.data.id}/accept`, {
        paymentReference: ref('STANDS'),
      })
      .expect(200);
    const refund = await as(accounts)
      .post(`/deal-proofs/${sent.body.data.id}/refund`, {
        paymentReference: ref('REFUND NOT DUE'),
      })
      .expect(409);
    expect(refund.body.code).toBe('DEAL_PROOF_NOT_REFUNDABLE');
    expect(
      (await as(buyer).get('/offers/999999/proofs').expect(404)).body.code,
    ).toBe('OFFER_NOT_FOUND');
    expect(
      (
        await as(accounts)
          .post(`/deal-proofs/${randomUUID()}/accept`, {
            paymentReference: ref('NO PROOF'),
          })
          .expect(404)
      ).body.code,
    ).toBe('PROOF_NOT_FOUND');
    expect(
      (
        await as(accounts)
          .post(`/deal-proofs/${randomUUID()}/refund`, {
            paymentReference: ref('NO PROOF 2'),
          })
          .expect(404)
      ).body.code,
    ).toBe('PROOF_NOT_FOUND');
    expect(
      (await as(accounts).get(`/deal-proofs/files/${randomUUID()}`).expect(404))
        .body.code,
    ).toBe('PROOF_FILE_MISSING');
  });

  it('cannot be sent once the deadline has passed, and the deal lapses', async () => {
    const { id } = await approvedDeal(15);
    await travel(chain.app, 8 * 24 * 3600);
    const late = await sendProof(id, {
      amount: '50',
      transferredOn: today(),
      method: 'cash',
    }).expect(409);
    expect(late.body.code).toBe('PAYMENT_OVERDUE');
    await chain.app.get(DealExpiryJob).run();
    const gone = await as(buyer).get(`/offers/${id}`).expect(200);
    expect(gone.body.data.status).toBe('expired');
    const ended = await sendProof(id, {
      amount: '50',
      transferredOn: today(),
      method: 'cash',
    }).expect(409);
    expect(ended.body.code).toBe('OFFER_WRONG_STATUS');
  });

  it('leave a refund due when an admin cancels a deal already part paid, even on hold', async () => {
    const { id } = await approvedDeal(25);
    const accepted = await sendProof(id, {
      amount: '500',
      transferredOn: today(),
      method: 'cash',
    }).expect(201);
    await as(accounts)
      .post(`/deal-proofs/${accepted.body.data.id}/accept`, {
        paymentReference: ref('CASH 500'),
      })
      .expect(200);
    // Another part is on its way when the deal is cancelled.
    const waiting = await sendProof(id, {
      amount: '100',
      transferredOn: today(),
      method: 'cash',
    }).expect(201);
    const cancelled = await as(admin)
      .post(`/offers/${id}/cancel-deal`)
      .expect(200);
    expect(cancelled.body.data).toMatchObject({
      status: 'cancelled',
      onHold: false,
    });
    await expect(ledger().pausedRemaining(id)).resolves.toBe(0n);

    // Accepted afterwards, it is money to give back too; the ledger is left alone.
    await as(accounts)
      .post(`/deal-proofs/${waiting.body.data.id}/accept`, {
        paymentReference: ref('CASH 100'),
      })
      .expect(200);

    const due = await as(accounts)
      .get('/deal-proofs?refund=due&limit=100')
      .expect(200);
    const line = due.body.data.find(
      (p: { id: string }) => p.id === accepted.body.data.id,
    );
    expect(line).toMatchObject({ refund: 'due', dealStatus: 'cancelled' });
    await as(accounts)
      .post(`/deal-proofs/${accepted.body.data.id}/refund`, {
        paymentReference: ref('REFUND 500'),
      })
      .expect(200);
    expect(await notices(buyer, id, 'deal-proof.refunded')).toHaveLength(1);
    const back = await as(buyer).get(`/offers/${id}/proofs`).expect(200);
    expect(
      back.body.data.find(
        (p: { id: string }) => p.id === accepted.body.data.id,
      ),
    ).toMatchObject({ refund: 'refunded' });
    const repeat = await as(accounts)
      .post(`/deal-proofs/${accepted.body.data.id}/refund`, {
        paymentReference: ref('REFUND AGAIN'),
      })
      .expect(409);
    expect(repeat.body.code).toBe('DEAL_PROOF_ALREADY_REFUNDED');
    const done = await as(accounts)
      .get('/deal-proofs?refund=refunded&limit=100')
      .expect(200);
    const refunded = done.body.data.find(
      (p: { id: string }) => p.id === accepted.body.data.id,
    );
    expect(refunded.refundReference).toBe(ref('REFUND 500'));
  });

  it('are found by the buyer in Accounts’ queue, and agree with the ledger', async () => {
    const byName = await as(accounts)
      .get('/deal-proofs?status=accepted&q=Other%20Buyer')
      .expect(200);
    expect(byName.body.data).toEqual([]);
    expect(await ledgerDisagreements(chain)).toEqual([]);
  });
});
