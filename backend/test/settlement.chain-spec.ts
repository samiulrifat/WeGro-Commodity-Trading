/** Settlement end to end, against the local chain and a throwaway schema. */
import { randomBytes, randomInt } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ChainClock } from '../src/blockchain/chain-clock';
import { ContractsRegistry } from '../src/blockchain/contracts.registry';
import { EventIndexerService } from '../src/blockchain/indexer/event-indexer.service';
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
import { travel as chainTravel } from './support/chain-time';

const RUN = randomBytes(4).toString('hex').toUpperCase();
const DAY = 86_400;

/** A minimal JPEG (structure only), as a phone photo stands in for. */
function jpeg(label: string): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x07]),
    Buffer.from('JFIF\0', 'latin1'),
    Buffer.from([0xff, 0xda, 0x00, 0x04, 0x01, 0x02]),
    Buffer.from(label, 'latin1'),
    Buffer.from([0xff, 0xd9]),
  ]);
}

interface Person {
  id: string;
  token: string;
}

describe('Settlement (node + database)', () => {
  let chain: ChainApp;
  let http: ReturnType<typeof request>;
  let db: DataSource;
  const t: Record<string, string> = {};
  const user: Record<string, User> = {};
  let investor2: Person;
  let accounts2: Person;
  let project: string;
  let staged: number;
  let final: number;

  const as = (token: string) => ({
    get: (path: string) =>
      http.get(`/api${path}`).auth(token, { type: 'bearer' }),
    post: (path: string, body: object = {}) =>
      http.post(`/api${path}`).auth(token, { type: 'bearer' }).send(body),
    put: (path: string, body: object) =>
      http.put(`/api${path}`).auth(token, { type: 'bearer' }).send(body),
  });
  const settlement = () =>
    chain.app.get(ContractsRegistry).get('SettlementLedger');

  async function day(offset = 0): Promise<string> {
    const now = await chain.app.get(ChainClock).now();
    return bdDate(new Date(now.getTime() + offset * DAY * 1000));
  }

  async function travel(seconds: number) {
    return chainTravel(chain.app, seconds);
  }

  /** Registers, verifies and signs in a participant. */
  async function register(
    registrar: string,
    role: Role,
    name: string,
  ): Promise<Person> {
    const phone = `0195${String(randomInt(1e6, 1e7))}`;
    const reg = await as(registrar)
      .post('/participants', {
        role,
        fullName: name,
        phone,
        nid: `${randomInt(2, 9)}${randomInt(1e8, 1e9)}`,
        dateOfBirth: '1985-05-05',
        district: 'DHAKA',
        address: 'Made-up address, Dhaka',
      })
      .expect(201);
    const id = reg.body.data.participant.id;
    await as(registrar).post(`/participants/${id}/verify`).expect(200);
    const temp = reg.body.data.temporaryPassword;
    const login = await http
      .post('/api/auth/login')
      .send({ phone, password: temp })
      .expect(200);
    const token = (
      await as(login.body.data.accessToken)
        .post('/auth/change-password', {
          currentPassword: temp,
          newPassword: `${phone}-pw-ok`,
        })
        .expect(200)
    ).body.data.accessToken;
    return { id, token };
  }

  async function upload(token: string, label: string): Promise<string> {
    const res = await http
      .post('/api/photos')
      .auth(token, { type: 'bearer' })
      .attach('file', jpeg(`${label}-${RUN}`), `${label}.jpg`)
      .expect(201);
    return res.body.data.id;
  }

  const bank = (account: string) => ({
    holderName: 'Account Holder',
    bankName: 'Sonali Bank PLC',
    branchName: 'Bogura Main Branch',
    accountNumber: account,
    routingNumber: '200100123',
  });

  beforeAll(async () => {
    chain = await startChainApp({ DEMO_MODE: 'true' });
    http = request(chain.app.getHttpServer());
    db = chain.app.get(DataSource);
    await waitForDemoAccounts(chain);
    for (const r of [
      Role.SuperAdmin,
      Role.Admin,
      Role.Accounts,
      Role.Investor,
      Role.Farmer,
      Role.FieldOfficer,
      Role.Buyer,
      Role.Auditor,
    ]) {
      t[r] = await demoToken(http, r);
      user[r] = await db
        .getRepository(User)
        .findOneByOrFail({ role: r, isDemo: true });
    }
    investor2 = await register(t.admin, Role.Investor, 'Second Investor');
    accounts2 = await register(t.super_admin, Role.Accounts, 'Second Accounts');

    // A 12-month tomato project paying out every 3 months: 7 slots, held 4 and 3.
    project = (
      await as(t.admin)
        .post('/projects', {
          title: `Staged tomatoes ${RUN}`,
          produceCode: 'TOMATO',
          districtCode: 'BOGURA',
          location: 'Shibganj',
          farmerId: user.farmer.id,
          durationType: 'long_term',
          durationMonths: 12,
          payoutIntervalMonths: 3,
          fundingTarget: '70000',
          slotPrice: '10000',
          estimatedReturnMinBps: 0,
          estimatedReturnMaxBps: 1500,
        })
        .expect(201)
    ).body.data.id;
    await as(t.admin).post(`/projects/${project}/publish`).expect(200);
    for (const [token, slots] of [
      [t.investor, 4],
      [investor2.token, 3],
    ] as const) {
      const r = await as(token)
        .post(`/projects/${project}/reservations`, { slots })
        .expect(201);
      await as(t.accounts)
        .post(`/reservations/${r.body.data.id}/confirm`, {
          paymentReference: `S-${slots}-${RUN}`,
        })
        .expect(200);
    }
    await as(t.admin).post(`/projects/${project}/activate`).expect(200);

    // A delivered sale of fresh produce: 1000 kg at 40.01 = 40010.00 income.
    const listing = (
      await as(t.field_officer)
        .post('/listings/produce', {
          projectId: project,
          quantity: 1000,
          askingUnitPrice: '42',
        })
        .expect(201)
    ).body.data.id;
    const offer = (
      await as(t.buyer)
        .post(`/listings/${listing}/offers`, {
          quantity: 1000,
          unitPrice: '40.01',
        })
        .expect(201)
    ).body.data.id;
    await as(t.admin).post(`/offers/${offer}/approve`).expect(200);
    await as(t.accounts)
      .post(`/offers/${offer}/payment`, { paymentReference: `S-SALE-${RUN}` })
      .expect(200);
    await as(t.buyer)
      .post(`/offers/${offer}/delivery`, { quantity: 1000 })
      .expect(200);
    await as(t.field_officer)
      .post(`/offers/${offer}/delivery`, { quantity: 1000 })
      .expect(200);
  });

  afterAll(async () => {
    await chain?.close();
  });

  describe('bank accounts', () => {
    it("take effect once an admin verifies the payee's own entry", async () => {
      const mine = await as(t.investor)
        .put('/me/bank-account', bank(`0123-4567 ${randomInt(1e5, 1e6)}`))
        .expect(200);
      expect(mine.body.data.pending).toMatchObject({
        status: 'pending',
        routingNumber: '200100123',
        enteredBy: { id: user.investor.id },
      });
      expect(mine.body.data.pending.accountNumber).toMatch(/^\d{14}$/);
      const res = await as(t.admin)
        .post(`/participants/${user.investor.id}/bank-account/verify`)
        .expect(200);
      expect(res.body.data).toMatchObject({
        verified: { status: 'verified', decidedBy: { id: user.admin.id } },
        pending: null,
      });
    });

    it('need a second person when an admin enters them', async () => {
      await as(t.admin)
        .put(`/participants/${investor2.id}/bank-account`, bank('99887766554'))
        .expect(200);
      const same = await as(t.admin)
        .post(`/participants/${investor2.id}/bank-account/verify`)
        .expect(403);
      expect(same.body.code).toBe('SAME_PERSON');
      await as(t.super_admin)
        .post(`/participants/${investor2.id}/bank-account/verify`)
        .expect(200);
      // A later change can be turned down, keeping the verified account.
      await as(t.admin)
        .put(`/participants/${investor2.id}/bank-account`, bank('55443322110'))
        .expect(200);
      const turnedDown = await as(t.super_admin)
        .post(`/participants/${investor2.id}/bank-account/reject`, {
          reason: 'Account holder name does not match',
        })
        .expect(200);
      expect(turnedDown.body.data).toMatchObject({
        verified: { status: 'verified' },
        pending: null,
      });
      expect(turnedDown.body.data.history[0]).toMatchObject({
        status: 'rejected',
        rejectionReason: 'Account holder name does not match',
      });
    });

    it('keep the verified account while a change waits, and keep history', async () => {
      const verified = (
        await as(t.investor).get('/me/bank-account').expect(200)
      ).body.data.verified;
      const { holderName, bankName, branchName, accountNumber, routingNumber } =
        verified;
      await as(t.investor)
        .put('/me/bank-account', {
          holderName,
          bankName,
          branchName,
          accountNumber,
          routingNumber,
        })
        .expect(409);
      await as(t.investor)
        .put('/me/bank-account', bank('11112222333'))
        .expect(200);
      const queue = await as(t.admin)
        .get('/bank-accounts/pending?limit=100')
        .expect(200);
      expect(
        queue.body.data.find(
          (p: { owner: { id: string } }) => p.owner.id === user.investor.id,
        ),
      ).toMatchObject({ isChange: true, ownerRole: 'investor' });
      const seen = await as(t.auditor)
        .get(`/participants/${user.investor.id}/bank-account`)
        .expect(200);
      expect(seen.body.data.verified.accountNumber).toMatch(/^•+\d{4}$/);
      expect(seen.body.data.pending.accountNumber).toBe('•••••••2333');
    });

    it('refuse bad numbers and non-payees', async () => {
      await as(t.investor)
        .put('/me/bank-account', { ...bank('123456'), routingNumber: '12345' })
        .expect(400);
      await as(t.admin)
        .put(`/participants/${user.buyer.id}/bank-account`, bank('123456789'))
        .expect(422);
      await as(t.buyer).get('/me/bank-account').expect(403);
    });
  });

  describe('costs', () => {
    let wrong: string;

    it('are entered by Accounts with the bill, fingerprinted on the ledger', async () => {
      const photo = await upload(t.accounts, 'truck-bill');
      const res = await as(t.accounts)
        .post(`/settlement/projects/${project}/costs`, {
          category: 'transport',
          amount: '1500',
          incurredOn: await day(),
          note: 'Truck hire, field to hub',
          photoId: photo,
        })
        .expect(201);
      expect(res.body.data).toMatchObject({
        category: 'transport',
        amount: '1500.00',
        status: 'recorded',
        photoUrl: `/api/settlement/costs/${res.body.data.id}/photo`,
        enteredBy: { id: user.accounts.id },
      });
      const onChain = await settlement().getCost(res.body.data.costId);
      expect(onChain.detailsHash).toBe(res.body.data.detailsHash);
      expect(onChain.amount).toBe(150_000n);
      const one = await as(t.accounts)
        .get(`/settlement/costs/${res.body.data.id}`)
        .expect(200);
      expect(one.body.data).toEqual(res.body.data);
    });

    it('are voided, not edited, when wrong', async () => {
      wrong = (
        await as(t.accounts)
          .post(`/settlement/projects/${project}/costs`, {
            category: 'labour',
            amount: '999',
            incurredOn: await day(),
            note: 'Entered twice by mistake',
          })
          .expect(201)
      ).body.data.id;
      const res = await as(t.accounts)
        .post(`/settlement/costs/${wrong}/void`)
        .expect(200);
      expect(res.body.data).toMatchObject({
        status: 'voided',
        voidedBy: { id: user.accounts.id },
      });
      await as(t.accounts).post(`/settlement/costs/${wrong}/void`).expect(409);
    });

    it('refuse future days and other roles', async () => {
      const body = {
        category: 'storage',
        amount: '10',
        incurredOn: await day(3),
        note: 'Later',
      };
      await as(t.accounts)
        .post(`/settlement/projects/${project}/costs`, body)
        .expect(422);
      await as(t.accounts)
        .post(`/settlement/projects/${project}/costs`, {
          ...body,
          category: 'bribes',
        })
        .expect(400);
      await as(t.field_officer)
        .post(`/settlement/projects/${project}/costs`, body)
        .expect(403);
    });

    it("are seen by the project's own people only", async () => {
      const list = await as(investor2.token)
        .get(`/settlement/projects/${project}/costs`)
        .expect(200);
      expect(list.body.data.map((c: { amount: string }) => c.amount)).toEqual([
        '1500.00',
      ]);
      const all = await as(t.farmer)
        .get(`/settlement/projects/${project}/costs?includeVoided=true`)
        .expect(200);
      expect(all.body.data).toHaveLength(2);
      const outsider = await register(t.admin, Role.Investor, 'Outsider');
      await as(outsider.token)
        .get(`/settlement/projects/${project}/costs`)
        .expect(404);
      await as(t.buyer)
        .get(`/settlement/projects/${project}/costs`)
        .expect(403);
    });
  });

  describe('staged round', () => {
    it('is not due before the payout interval, and says when', async () => {
      const res = await as(t.accounts)
        .get(`/settlement/projects/${project}`)
        .expect(200);
      expect(res.body.data).toMatchObject({
        stage: 'active',
        income: { sales: '40010.00', insurance: '0.00', total: '40010.00' },
        costs: { inputs: '0.00', other: '1500.00', total: '1500.00' },
        net: '38510.00',
        distributedProfit: '0.00',
        staged: {
          allowed: false,
          reason: 'TOO_EARLY',
          preview: {
            profit: '38510.00',
            farmerShare: '15404.00',
            investorShare: '15404.00',
            wegroShare: '7702.00',
            leftover: '0.01',
            payees: 3,
          },
        },
        final: { allowed: false, reason: 'ROUND_WRONG_STAGE' },
      });
      const early = await as(t.accounts)
        .post(`/settlement/projects/${project}/rounds`, { final: false })
        .expect(409);
      expect(early.body.code).toBe('TOO_EARLY');
      expect(Date.parse(early.body.details.nextAllowedAt)).toBeGreaterThan(
        Date.now() - 365 * DAY * 1000,
      );
    });

    it('splits the profit so far, each line hashed on the ledger', async () => {
      await travel(90 * DAY + 60);
      const res = await as(t.accounts)
        .post(`/settlement/projects/${project}/rounds`, { final: false })
        .expect(201);
      staged = res.body.data.id;
      expect(res.body.data).toMatchObject({
        isFinal: false,
        status: 'prepared',
        income: '40010.00',
        costs: '1500.00',
        profit: '38510.00',
        farmerShare: '15404.00',
        investorShare: '15404.00',
        wegroShare: '7702.00',
        capitalReturn: '0.00',
        leftover: '0.01',
        verified: true,
        preparedBy: { id: user.accounts.id },
        payeeCount: 3,
      });
      const amounts = Object.fromEntries(
        res.body.data.lines.map(
          (l: { payee: { id: string }; amount: string }) => [
            l.payee.id,
            l.amount,
          ],
        ),
      );
      expect(amounts).toEqual({
        [user.farmer.id]: '15404.00',
        [user.investor.id]: '8802.28',
        [investor2.id]: '6601.71',
      });
      const round = await settlement().getRound(staged);
      expect(round.fingerprint).toBe(res.body.data.fingerprint);
      for (const l of res.body.data.lines) {
        expect(
          await settlement().payoutLineHash(staged, uuidToBytes32(l.payee.id)),
        ).toBe(l.lineHash);
        expect(l.verified).toBe(true);
      }
      const again = await as(t.accounts)
        .post(`/settlement/projects/${project}/rounds`, { final: false })
        .expect(409);
      expect(again.body.code).toBe('ROUND_OPEN');
    });

    it('is approved by a second Accounts person', async () => {
      const same = await as(t.accounts)
        .post(`/settlement/rounds/${staged}/approve`)
        .expect(403);
      expect(same.body.code).toBe('SAME_ACCOUNTANT');
      const res = await as(accounts2.token)
        .post(`/settlement/rounds/${staged}/approve`)
        .expect(200);
      expect(res.body.data).toMatchObject({
        status: 'approved',
        approvedBy: { id: accounts2.id },
      });
    });

    it('gives Accounts a payout sheet with verified bank details', async () => {
      const res = await as(t.accounts)
        .get(`/settlement/rounds/${staged}/payout-sheet.csv`)
        .expect(200);
      expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['content-disposition']).toBe(
        `attachment; filename="payout-round-${staged}.csv"`,
      );
      const rows = res.text.replace('\uFEFF', '').trim().split('\r\n');
      expect(rows[0]).toContain('account_number,routing_number');
      const row = (id: string) => rows.find((r) => r.includes(id))!;
      expect(row(investor2.id)).toContain('99887766554');
      expect(row(investor2.id)).toContain(',verified,');
      expect(row(user.investor.id)).toContain(
        'verified (a change is waiting for verification)',
      );
      expect(row(user.farmer.id)).toContain(',missing,');
      expect(row(user.farmer.id)).toContain('15404.00');
      await as(t.auditor)
        .get(`/settlement/rounds/${staged}/payout-sheet.csv`)
        .expect(403);
    });

    it('records each payment once; all paid = round paid', async () => {
      const pay = (payeeId: string, ref: string) =>
        as(accounts2.token).post(`/settlement/rounds/${staged}/payments`, {
          payeeId,
          paymentReference: ref,
        });
      const first = await pay(user.investor.id, `PAY-1-${RUN}`).expect(200);
      expect(
        first.body.data.lines.find(
          (l: { payee: { id: string } }) => l.payee.id === user.investor.id,
        ),
      ).toMatchObject({ paid: true, paymentReference: `PAY-1-${RUN}` });
      expect(
        (await pay(investor2.id, `pay-1-${RUN}`).expect(409)).body.code,
      ).toBe('PAYMENT_REF_ALREADY_USED');
      expect(
        (await pay(user.investor.id, `PAY-X-${RUN}`).expect(409)).body.code,
      ).toBe('ALREADY_PAID');
      await pay(user.buyer.id, `PAY-B-${RUN}`).expect(404);
      await pay(investor2.id, `PAY-2-${RUN}`).expect(200);
      const done = await pay(user.farmer.id, `PAY-3-${RUN}`).expect(200);
      expect(done.body.data).toMatchObject({
        status: 'paid',
        paidCount: 3,
      });
      const again = await as(t.accounts)
        .get(`/settlement/rounds/${staged}`)
        .expect(200);
      expect(again.body.data).toMatchObject({ id: staged, status: 'paid' });
      const listed = await as(t.accounts)
        .get(`/settlement/rounds?projectId=${project}&status=paid`)
        .expect(200);
      expect(listed.body.data.map((r: { id: number }) => r.id)).toEqual([
        staged,
      ]);
      const summary = await as(t.farmer)
        .get(`/settlement/projects/${project}`)
        .expect(200);
      expect(summary.body.data).toMatchObject({
        distributedProfit: '38510.00',
        openRoundId: null,
        staged: { allowed: false, reason: 'TOO_EARLY' },
      });
    });
  });

  describe('final round', () => {
    it('waits for the project to be ready for sale', async () => {
      const res = await as(t.accounts)
        .post(`/settlement/projects/${project}/rounds`, { final: true })
        .expect(409);
      expect(res.body.code).toBe('ROUND_WRONG_STAGE');
      await as(t.admin).post(`/projects/${project}/ready-for-sale`).expect(200);
      const summary = await as(t.accounts)
        .get(`/settlement/projects/${project}`)
        .expect(200);
      expect(summary.body.data.final).toMatchObject({
        allowed: true,
        outstanding: [],
        preview: { profit: '0.00', capitalReturn: '70000.00', payees: 2 },
      });
    });

    it('freezes costs while open, and can be sent back with a reason', async () => {
      const first = (
        await as(t.accounts)
          .post(`/settlement/projects/${project}/rounds`, { final: true })
          .expect(201)
      ).body.data;
      expect(first.lines).toHaveLength(2);
      const frozen = await as(t.accounts)
        .post(`/settlement/projects/${project}/costs`, {
          category: 'other',
          amount: '1',
          incurredOn: await day(),
          note: 'Late cost',
        })
        .expect(409);
      expect(frozen.body.code).toBe('FINAL_ROUND_OPEN');
      const rejected = await as(accounts2.token)
        .post(`/settlement/rounds/${first.id}/reject`, {
          reason: 'Check the storage bill first',
        })
        .expect(200);
      expect(rejected.body.data).toMatchObject({
        status: 'rejected',
        rejectReason: 'Check the storage bill first',
        rejectedBy: { id: accounts2.id },
      });
    });

    it('returns capital, then marks the project paid out', async () => {
      const res = await as(t.accounts)
        .post(`/settlement/projects/${project}/rounds`, { final: true })
        .expect(201);
      final = res.body.data.id;
      expect(res.body.data).toMatchObject({
        isFinal: true,
        profit: '0.00',
        capitalReturn: '70000.00',
        verified: true,
      });
      expect(
        Object.fromEntries(
          res.body.data.lines.map(
            (l: { payee: { id: string }; amount: string }) => [
              l.payee.id,
              l.amount,
            ],
          ),
        ),
      ).toEqual({
        [user.investor.id]: '40000.00',
        [investor2.id]: '30000.00',
      });
      await as(accounts2.token)
        .post(`/settlement/rounds/${final}/approve`)
        .expect(200);
      for (const [payeeId, n] of [
        [user.investor.id, 4],
        [investor2.id, 5],
      ] as const) {
        await as(t.accounts)
          .post(`/settlement/rounds/${final}/payments`, {
            payeeId,
            paymentReference: `PAY-${n}-${RUN}`,
          })
          .expect(200);
      }
      const p = await as(t.admin).get(`/projects/${project}`).expect(200);
      expect(p.body.data.stage).toBe('paid_out');
      const settled = await as(t.accounts)
        .get(`/settlement/projects/${project}`)
        .expect(200);
      expect(settled.body.data).toMatchObject({
        settled: true,
        final: { allowed: false, reason: 'ALREADY_SETTLED' },
      });
    });
  });

  describe('reports and statements', () => {
    it('give each investor their own statement, checkable against the ledger', async () => {
      const res = await as(t.investor).get('/me/statement').expect(200);
      const mine = res.body.data.projects.find(
        (p: { project: { id: string } }) => p.project.id === project,
      );
      expect(mine).toMatchObject({
        stage: 'paid_out',
        role: 'investor',
        slots: 4,
        invested: '40000.00',
        received: '48802.28',
        due: '0.00',
        refunded: '0.00',
      });
      expect(
        mine.payouts.map((p: { roundId: number; amount: string }) => [
          p.roundId,
          p.amount,
        ]),
      ).toEqual([
        [staged, '8802.28'],
        [final, '40000.00'],
      ]);
      expect(
        await settlement().lineHash(
          final,
          uuidToBytes32(user.investor.id),
          4_000_000n,
        ),
      ).toBe(mine.payouts[1].lineHash);

      const farmer = await as(t.accounts)
        .get(`/settlement/statements/${user.farmer.id}`)
        .expect(200);
      expect(
        farmer.body.data.projects.find(
          (p: { project: { id: string } }) => p.project.id === project,
        ),
      ).toMatchObject({ role: 'farmer', invested: null, received: '15404.00' });
      await as(t.investor)
        .get(`/settlement/statements/${investor2.id}`)
        .expect(403);
      const csv = await as(investor2.token)
        .get('/me/statement.csv')
        .expect(200);
      expect(csv.text).toContain(`Staged tomatoes ${RUN}`);
      expect(csv.text).toContain('6601.71');
    });

    it('report a project item by item against the ledger totals', async () => {
      const res = await as(t.auditor)
        .get(`/settlement/projects/${project}/report.csv`)
        .expect(200);
      expect(res.text).toContain('Sale of 1000 TOMATO');
      expect(res.text).toContain('transport: Truck hire');
      expect(res.text).not.toContain('Entered twice by mistake');
      expect(res.text).toContain('Income (items above),,40010.00');
      expect(res.text).toContain('Income (ledger),,40010.00');
      expect(res.text).toContain('Costs (ledger),,1500.00');
      expect(res.text).toContain(
        `Round ${staged} (staged, paid): farmer share`,
      );
      await as(t.farmer)
        .get(`/settlement/projects/${project}/report.csv`)
        .expect(403);
    });

    it('list the rounds approved in a period for the books', async () => {
      const res = await as(t.accounts)
        .get(
          `/settlement/reports/period.csv?from=${await day(-1)}&to=${await day()}`,
        )
        .expect(200);
      const ids = res.text
        .split('\r\n')
        .slice(1)
        .map((r) => r.split(',')[0]);
      expect(ids).toEqual(expect.arrayContaining([String(final)]));
      await as(t.accounts)
        .get(
          `/settlement/reports/period.csv?from=${await day()}&to=${await day(-1)}`,
        )
        .expect(422);
    });
  });

  describe('integrity', () => {
    it('agrees with the ledger on every record', async () => {
      expect(await ledgerDisagreements(chain)).toEqual([]);
    });

    it('rebuilds identical costs, rounds and lines from the ledger', async () => {
      const snapshot = async () => ({
        costs: await db.query(
          'SELECT id, cost_id, status FROM project_costs ORDER BY id',
        ),
        rounds: await db.query(
          'SELECT id, status, verified, approved_by_id, paid_count, reject_reason FROM settlement_rounds ORDER BY id',
        ),
        lines: await db.query(
          'SELECT round_id, payee_id, amount, verified, paid_at, payment_ref_hash FROM payout_lines ORDER BY round_id, payee_id',
        ),
      });
      const indexer = chain.app.get(EventIndexerService);
      await indexer.catchUp();
      const before = await snapshot();
      await indexer.reindex();
      await indexer.catchUp();
      expect(await snapshot()).toEqual(before);
    });

    it('refuses a split above the profit at the database level', async () => {
      await expect(
        db.query(
          'UPDATE settlement_rounds SET farmer_share = profit + 1 WHERE id = $1',
          [staged],
        ),
      ).rejects.toThrow(/ck_settlement_rounds_split/);
    });
  });

  describe('after the payout', () => {
    it('lets an admin close the paid-out project', async () => {
      const res = await as(t.admin)
        .post(`/projects/${project}/close`)
        .expect(200);
      expect(res.body.data.stage).toBe('closed');
    });
  });
});
