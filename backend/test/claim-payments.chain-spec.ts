/** Insurers paying approved claims end to end: proofs, Accounts' review, the ledger. */
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ChainClock } from '../src/blockchain/chain-clock';
import { ContractsRegistry } from '../src/blockchain/contracts.registry';
import { uuidToBytes32 } from '../src/blockchain/utils/ids';
import { bdDate } from '../src/common/time/bd-dates';
import { User } from '../src/modules/users/entities/user.entity';
import { Role } from '../src/modules/users/roles';
import {
  type ChainApp,
  demoToken,
  ledgerDisagreements,
  startChainApp,
  waitForDemoAccounts,
} from './support/chain-app';

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

describe('Paying insurance claims (node + database)', () => {
  let chain: ChainApp;
  let http: ReturnType<typeof request>;
  let db: DataSource;
  const t: Record<string, string> = {};
  const user: Record<string, User> = {};
  let otherInsurer: string;
  let flood: string;
  let made = 0;
  const registry = () =>
    chain.app.get(ContractsRegistry).get('InsuranceRegistry');

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

  /** A second insurer, registered and signed in. */
  async function registerInsurer(): Promise<string> {
    const phone = `0194${String(randomInt(1e6, 1e7))}`;
    const reg = await as(t.admin)
      .post('/participants', {
        role: 'insurer',
        fullName: 'Second Insurer',
        phone,
        nid: `${randomInt(2, 9)}${randomInt(1e8, 1e9)}`,
        dateOfBirth: '1979-09-09',
        district: 'DHAKA',
        address: 'Made-up insurer office, Dhaka',
      })
      .expect(201);
    const id = reg.body.data.participant.id;
    await as(t.admin).post(`/participants/${id}/verify`).expect(200);
    const temp = reg.body.data.temporaryPassword;
    const login = await http
      .post('/api/auth/login')
      .send({ phone, password: temp })
      .expect(200);
    return (
      await as(login.body.data.accessToken)
        .post('/auth/change-password', {
          currentPassword: temp,
          newPassword: `${phone}-pw-ok`,
        })
        .expect(200)
    ).body.data.accessToken;
  }

  /**
   * An insured, active project of the demo farmer's, covered by the demo
   * insurer, with a flood claim opened by the officer: triggered, or carried
   * on to approved for `amount`.
   */
  async function claim(amount: string | null = '25000'): Promise<{
    id: string;
    project: string;
  }> {
    made += 1;
    const project = (
      await as(t.admin)
        .post('/projects', {
          title: `Insured maize ${made} ${RUN}`,
          produceCode: 'MAIZE',
          districtCode: 'BOGURA',
          location: 'Shibganj',
          farmerId: user.farmer.id,
          durationType: 'short_term',
          durationMonths: 5,
          fundingTarget: '50000',
          slotPrice: '10000',
          estimatedReturnMinBps: 0,
          estimatedReturnMaxBps: 500,
          insured: true,
        })
        .expect(201)
    ).body.data.id as string;
    await as(t.admin).post(`/projects/${project}/publish`).expect(200);
    const r = await as(t.investor)
      .post(`/projects/${project}/reservations`, { slots: 5 })
      .expect(201);
    await as(t.accounts)
      .post(`/reservations/${r.body.data.id}/confirm`, {
        paymentReference: ref(`FUND ${made}`),
      })
      .expect(200);
    await as(t.admin).post(`/projects/${project}/activate`).expect(200);
    await as(t.admin)
      .put(`/insurance/projects/${project}/insurer`, {
        insurerId: user.insurer.id,
      })
      .expect(200);
    await as(t.insurer)
      .put(`/insurance/projects/${project}/coverage`, {
        maxAmount: '40000',
        coveredEventTypes: ['FLOOD'],
      })
      .expect(200);
    const id = (
      await as(t.field_officer)
        .post(`/insurance/projects/${project}/claims`, {
          eventId: flood,
          damagePercent: '30',
          notes: 'Field under water for three days',
        })
        .expect(201)
    ).body.data.id as string;
    if (amount !== null) {
      await as(t.insurer).post(`/insurance/claims/${id}/review`).expect(200);
      await as(t.insurer)
        .post(`/insurance/claims/${id}/approve`, {
          amount,
          notes: 'Loss confirmed on site',
        })
        .expect(200);
    }
    return { id, project };
  }

  /** A proof: the fields as a multipart form with the files. */
  const sendProof = (
    claimId: string,
    fields: Record<string, string>,
    files: Array<[Buffer, string]> = [[jpeg('slip'), 'slip.jpg']],
    token = t.insurer,
  ) => {
    let req = http
      .post(`/api/insurance/claims/${claimId}/proofs`)
      .auth(token, { type: 'bearer' });
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    for (const [data, name] of files) req = req.attach('files', data, name);
    return req;
  };
  const today = () =>
    new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10);

  const notices = async (token: string, claimId: string, kind: string) => {
    const all = await as(token).get('/notifications?limit=100').expect(200);
    return (
      all.body.data.items as Array<{
        kind: string;
        subject: { type: string; id: string };
      }>
    ).filter((n) => n.kind === kind && n.subject?.id === claimId);
  };

  beforeAll(async () => {
    chain = await startChainApp({ DEMO_MODE: 'true' });
    http = request(chain.app.getHttpServer());
    db = chain.app.get(DataSource);
    await waitForDemoAccounts(chain);
    for (const r of [
      Role.ADMIN,
      Role.ACCOUNTS,
      Role.INVESTOR,
      Role.FARMER,
      Role.FIELD_OFFICER,
      Role.INSURER,
      Role.AUDITOR,
    ]) {
      t[r] = await demoToken(http, r);
      user[r] = await db
        .getRepository(User)
        .findOneByOrFail({ role: r, isDemo: true });
    }
    otherInsurer = await registerInsurer();
    flood = (
      await as(t.admin)
        .post('/insurance/weather-events', {
          districtCode: 'BOGURA',
          eventTypeCode: 'FLOOD',
          occurredOn: await day(-1),
          severity: 'severe',
          notes: 'River above danger level',
        })
        .expect(201)
    ).body.data.id;
  });

  afterAll(async () => {
    await chain?.close();
  });

  it("are paid in parts, and record the claim's payment on the ledger when they add up", async () => {
    const { id, project } = await claim('25000');
    const before = await as(t.insurer).get(`/insurance/claims/${id}`);
    expect(before.body.data).toMatchObject({
      status: 'approved',
      paid: '0.00',
      underReview: '0.00',
      remaining: '25000.00',
    });
    // The farmer sees the claim, not the money moving.
    const farmerView = await as(t.farmer)
      .get(`/insurance/claims/${id}`)
      .expect(200);
    expect(farmerView.body.data).not.toHaveProperty('paid');
    expect(farmerView.body.data).not.toHaveProperty('remaining');

    // More than is owed, a deposit without its bank, not a picture: refused.
    const over = await sendProof(id, {
      amount: '25000.01',
      transferredOn: today(),
      method: 'cash',
    }).expect(422);
    expect(over.body).toMatchObject({
      code: 'PROOF_AMOUNT_INVALID',
      details: { remaining: '25000.00' },
    });
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
        amount: '10000',
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
      claimId: id,
      project: { id: project },
      insurer: { id: user.insurer.id },
      status: 'pending',
      amount: '10000.00',
      claimTotal: '25000.00',
      claimStatus: 'approved',
      bankName: 'SONALI BANK LTD.',
      branchName: 'BAGERHAT',
      districtName: 'BAGERHAT',
      routingNumber: '200010074',
      reference: 'TRX 1',
      note: 'First part',
    });
    expect(sent.body.data.files).toHaveLength(2);
    // The insurer is not shown Accounts' own reference.
    expect(sent.body.data).not.toHaveProperty('verifiedReference');
    expect(await notices(t.accounts, id, 'claim-proof.submitted')).toHaveLength(
      1,
    );
    const held = await as(t.insurer).get(`/insurance/claims/${id}`);
    expect(held.body.data).toMatchObject({
      underReview: '10000.00',
      remaining: '15000.00',
    });

    // With a proof sent, Accounts reviews it rather than recording outright.
    const outright = await as(t.accounts)
      .post(`/insurance/claims/${id}/payment`, {
        paymentReference: ref('OUTRIGHT'),
      })
      .expect(409);
    expect(outright.body.code).toBe('CLAIM_PROOFS_TO_REVIEW');

    // The file opens decrypted, as sent, only for those it is for.
    const url = sent.body.data.files[1].url as string;
    const file = await http
      .get(url)
      .auth(t.accounts, { type: 'bearer' })
      .expect(200);
    expect(file.headers['content-type']).toBe('application/pdf');
    expect(Buffer.from(file.body as Buffer).toString()).toContain('statement');
    await http.get(url).auth(t.insurer, { type: 'bearer' }).expect(200);
    await http.get(url).auth(otherInsurer, { type: 'bearer' }).expect(404);
    await http.get(url).auth(t.farmer, { type: 'bearer' }).expect(403);
    await as(otherInsurer).get(`/insurance/claims/${id}/proofs`).expect(404);
    await as(t.field_officer).get(`/insurance/claims/${id}/proofs`).expect(403);
    await sendProof(
      id,
      { amount: '1', transferredOn: today(), method: 'cash' },
      undefined,
      otherInsurer,
    ).expect(404);

    // Accepted in part: the claim waits for the rest.
    const accepted = await as(t.accounts)
      .post(`/claim-proofs/${first}/accept`, {
        paymentReference: ` ${ref('BANK A')} `,
      })
      .expect(200);
    expect(accepted.body.data).toMatchObject({
      status: 'accepted',
      verifiedReference: ref('BANK A'),
      decided: { by: { id: user.accounts.id } },
    });
    const again = await as(t.accounts)
      .post(`/claim-proofs/${first}/accept`, {
        paymentReference: ref('BANK A2'),
      })
      .expect(409);
    expect(again.body.code).toBe('PROOF_ALREADY_DECIDED');
    expect(await notices(t.insurer, id, 'claim-proof.accepted')).toHaveLength(
      1,
    );
    const part = await as(t.accounts).get(`/insurance/claims/${id}`);
    expect(part.body.data).toMatchObject({
      status: 'approved',
      paid: '10000.00',
      underReview: '0.00',
      remaining: '15000.00',
    });

    // Turned down with a reason; the insurer sends again.
    const second = await sendProof(id, {
      amount: '15000',
      transferredOn: today(),
      method: 'cash',
    }).expect(201);
    const turned = await as(t.accounts)
      .post(`/claim-proofs/${second.body.data.id}/reject`, {
        reason: 'The slip cannot be read',
      })
      .expect(200);
    expect(turned.body.data).toMatchObject({
      status: 'rejected',
      rejectionReason: 'The slip cannot be read',
    });
    expect(await notices(t.insurer, id, 'claim-proof.rejected')).toHaveLength(
      1,
    );
    const third = await sendProof(id, {
      amount: '15000',
      transferredOn: today(),
      method: 'cheque',
      routingNumber: '200010074',
    }).expect(201);

    // The rest accepted: the claim is paid on the ledger, both references in one.
    await as(t.accounts)
      .post(`/claim-proofs/${third.body.data.id}/accept`, {
        paymentReference: ref('BANK B'),
      })
      .expect(200);
    const paid = await as(t.accounts)
      .get(`/insurance/claims/${id}`)
      .expect(200);
    expect(paid.body.data).toMatchObject({
      status: 'paid',
      paid: '25000.00',
      remaining: '0.00',
      paymentReference: `${ref('BANK A')} + ${ref('BANK B')}`,
    });
    const onChain = await registry().getClaim(uuidToBytes32(id));
    expect(Number(onChain.status)).toBe(5);
    expect(await registry().paidTotal(uuidToBytes32(project))).toBe(2_500_000n);
    const late = await sendProof(id, {
      amount: '1',
      transferredOn: today(),
      method: 'cash',
    }).expect(409);
    expect(late.body.code).toBe('CLAIM_WRONG_STATUS');

    // Newest first, for the insurer and payment staff alike.
    const listed = await as(t.insurer)
      .get(`/insurance/claims/${id}/proofs`)
      .expect(200);
    expect(listed.body.data.map((p: { id: string }) => p.id)).toEqual([
      third.body.data.id,
      second.body.data.id,
      first,
    ]);
  });

  it('pays the claim at once when one proof covers it all, and still allows recording outright when none is sent', async () => {
    const whole = await claim('5000');
    const sent = await sendProof(whole.id, {
      amount: '5000',
      transferredOn: today(),
      method: 'cash',
    }).expect(201);
    await as(t.accounts)
      .post(`/claim-proofs/${sent.body.data.id}/accept`, {
        paymentReference: ref('ONE GO'),
      })
      .expect(200);
    const done = await as(t.accounts)
      .get(`/insurance/claims/${whole.id}`)
      .expect(200);
    expect(done.body.data).toMatchObject({
      status: 'paid',
      paymentReference: ref('ONE GO'),
    });

    const outright = await claim('3000');
    const res = await as(t.accounts)
      .post(`/insurance/claims/${outright.id}/payment`, {
        paymentReference: ref('NO PROOF SENT'),
      })
      .expect(200);
    expect(res.body.data).toMatchObject({
      status: 'paid',
      paid: '3000.00',
      underReview: '0.00',
      remaining: '0.00',
    });
  });

  it('refuse what cannot be a payment, and answer 404 for what does not exist', async () => {
    const { id } = await claim('8000');
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

    // A claim not yet approved has nothing to pay.
    const open = await claim(null);
    const early = await sendProof(open.id, {
      amount: '50',
      transferredOn: today(),
      method: 'cash',
    }).expect(409);
    expect(early.body.code).toBe('CLAIM_WRONG_STATUS');
    const unapproved = await as(t.insurer)
      .get(`/insurance/claims/${open.id}`)
      .expect(200);
    expect(unapproved.body.data).not.toHaveProperty('remaining');

    const sent = await sendProof(id, {
      amount: '50',
      transferredOn: today(),
      method: 'cash',
    }).expect(201);
    const blank = await as(t.accounts)
      .post(`/claim-proofs/${sent.body.data.id}/accept`, {
        paymentReference: '   ',
      })
      .expect(422);
    expect(blank.body.code).toBe('PAYMENT_REF_INVALID');
    // A statement reference is used once.
    const other = await sendProof(id, {
      amount: '50',
      transferredOn: today(),
      method: 'cash',
    }).expect(201);
    await as(t.accounts)
      .post(`/claim-proofs/${other.body.data.id}/accept`, {
        paymentReference: ref('ONCE'),
      })
      .expect(200);
    const reused = await as(t.accounts)
      .post(`/claim-proofs/${sent.body.data.id}/accept`, {
        paymentReference: ref('ONCE'),
      })
      .expect(409);
    expect(reused.body.code).toBe('PAYMENT_REF_ALREADY_USED');
    // Only Accounts decides.
    await as(t.insurer)
      .post(`/claim-proofs/${sent.body.data.id}/accept`, {
        paymentReference: ref('SELF'),
      })
      .expect(403);
    await as(t.insurer).get('/claim-proofs').expect(403);

    expect(
      (
        await as(t.insurer)
          .get(`/insurance/claims/${randomUUID()}/proofs`)
          .expect(404)
      ).body.code,
    ).toBe('CLAIM_NOT_FOUND');
    expect(
      (
        await as(t.accounts)
          .post(`/claim-proofs/${randomUUID()}/accept`, {
            paymentReference: ref('NO PROOF'),
          })
          .expect(404)
      ).body.code,
    ).toBe('PROOF_NOT_FOUND');
    expect(
      (
        await as(t.accounts)
          .post(`/claim-proofs/${randomUUID()}/reject`, {
            reason: 'No such proof here',
          })
          .expect(404)
      ).body.code,
    ).toBe('PROOF_NOT_FOUND');
    expect(
      (
        await as(t.accounts)
          .get(`/claim-proofs/files/${randomUUID()}`)
          .expect(404)
      ).body.code,
    ).toBe('PROOF_FILE_MISSING');
  });

  it('show on the dashboard exactly as Accounts’ page lists them, found by the insurer', async () => {
    type Queue = { key: string; count: number; oldest: unknown[] };
    const queue = async (key: string) =>
      (
        (await as(t.accounts).get('/dashboard').expect(200)).body.data
          .queues as Queue[]
      ).find((q) => q.key === key)!;
    const listed = async (path: string) =>
      (await as(t.accounts).get(path).expect(200)).body.meta.total as number;
    const agrees = async () =>
      expect((await queue('claim-proofs.pending')).count).toBe(
        await listed('/claim-proofs?status=pending'),
      );

    const before = (await queue('claim-proofs.pending')).count;
    const { id, project } = await claim('2000');
    expect((await queue('claim-proofs.pending')).count).toBe(before);
    const sent = await sendProof(id, {
      amount: '2000',
      transferredOn: today(),
      method: 'cash',
    }).expect(201);
    const waiting = await queue('claim-proofs.pending');
    expect(waiting.count).toBe(before + 1);
    expect(waiting.oldest).toContainEqual(
      expect.objectContaining({
        id: sent.body.data.id,
        project: expect.objectContaining({ id: project }),
        params: { amount: '2000.00' },
      }),
    );
    await agrees();

    const byName = await as(t.accounts)
      .get('/claim-proofs?status=pending&q=Demo%20Insurer&limit=100')
      .expect(200);
    expect(byName.body.data.map((p: { id: string }) => p.id)).toContain(
      sent.body.data.id,
    );
    const nobody = await as(t.accounts)
      .get('/claim-proofs?status=pending&q=Second%20Insurer')
      .expect(200);
    expect(nobody.body.data).toEqual([]);

    await as(t.accounts)
      .post(`/claim-proofs/${sent.body.data.id}/reject`, {
        reason: 'Wrong account',
      })
      .expect(200);
    expect((await queue('claim-proofs.pending')).count).toBe(before);
    await agrees();
  });

  it('agree with the ledger', async () => {
    expect(await ledgerDisagreements(chain)).toEqual([]);
  });
});
