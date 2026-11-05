/**
 * Someone who signs up as more than one of investor, buyer and seller holds
 * every one of them, their permissions merged, on the ledger as in the API;
 * and being on both sides of the marketplace must not undo its rules: nobody
 * deals with themselves, and the other side of each deal stays unknown.
 */
import { randomBytes, randomInt } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ContractsRegistry } from '../src/blockchain/contracts.registry';
import { uuidToBytes32 } from '../src/blockchain/utils/ids';
import { bdDate } from '../src/common/time/bd-dates';
import { ChainClock } from '../src/blockchain/chain-clock';
import { MemorySmsSender, SmsSender } from '../src/modules/auth/sms/sms-sender';
import { normalisePhone } from '../src/modules/participants/id-check/id-check';
import { User } from '../src/modules/users/entities/user.entity';
import {
  CHAIN_ROLE,
  type ParticipantRole,
  Role,
} from '../src/modules/users/roles';
import {
  type ChainApp,
  demoToken,
  startChainApp,
  waitForDemoAccounts,
} from './support/chain-app';

const RUN = randomBytes(4).toString('hex').toUpperCase();
const PASSWORD = 'my-own-password-1';
/** Names are letters only. */
const NAME = `Merged ${RUN.replace(/\d/g, (d) => 'GHIJKLMNOP'[Number(d)])} Person`;

function jpeg(label: string): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x07]),
    Buffer.from('JFIF\0', 'latin1'),
    Buffer.from([0xff, 0xda, 0x00, 0x04, 0x01, 0x02]),
    Buffer.from(label, 'latin1'),
    Buffer.from([0xff, 0xd9]),
  ]);
}

describe('Signing up with several roles (node + database)', () => {
  let chain: ChainApp;
  let http: ReturnType<typeof request>;
  let contracts: ContractsRegistry;
  const t: Record<string, string> = {};
  const demo: Record<string, User> = {};
  /** Buyer and seller, ticked the other way round. */
  const both = { id: '', token: '', phone: '' };
  /** All three. */
  const all = { id: '', token: '', phone: '' };

  const as = (token: string) => ({
    get: (path: string) =>
      http.get(`/api${path}`).auth(token, { type: 'bearer' }),
    post: (path: string, body: object = {}) =>
      http.post(`/api${path}`).auth(token, { type: 'bearer' }).send(body),
  });

  const details = () => {
    const phone = `0181${String(randomInt(1e6, 1e7))}`;
    return {
      fullName: NAME,
      phone,
      nid: `${randomInt(2, 9)}${String(randomInt(1e8, 1e9))}`,
      dateOfBirth: '1988-03-21',
      district: 'BOGURA',
      address: 'Made-up test address, Bogura',
    };
  };

  const code = async (phone: string): Promise<string> => {
    await http
      .post('/api/auth/sign-up/code')
      .send({ phone, language: 'en' })
      .expect(200);
    const text = (chain.app.get(SmsSender) as MemorySmsSender).outbox
      .filter((m) => m.phone === normalisePhone(phone))
      .at(-1)!.text;
    return /\b(\d{6})\b/.exec(text)![1];
  };

  const signUp = async (roles: string[]) => {
    const d = details();
    const res = await http
      .post('/api/auth/sign-up')
      .send({
        ...d,
        roles,
        password: PASSWORD,
        phoneCode: await code(d.phone),
      })
      .expect(201);
    return {
      id: res.body.data.user.id as string,
      token: res.body.data.accessToken as string,
      phone: d.phone,
      user: res.body.data.user as {
        role: string;
        extraRoles: string[];
        status: string;
      },
    };
  };

  /** An outside seller's listing, approved by an admin. */
  const listing = async (token: string, produceCode = 'TOMATO') => {
    const photo = await http
      .post('/api/photos')
      .auth(token, { type: 'bearer' })
      .attach('file', jpeg(randomBytes(6).toString('hex')), 'goods.jpg')
      .expect(201);
    const made = await as(token)
      .post('/listings/external', {
        produceCode,
        quantity: 1000,
        askingUnitPrice: '20',
        districtCode: 'MUNSHIGANJ',
        description: 'Sorted and bagged',
        photoIds: [photo.body.data.id],
      })
      .expect(201);
    const id = made.body.data.id as number;
    await as(t.admin).post(`/listings/${id}/approve`).expect(200);
    return id;
  };

  const offer = async (token: string, id: number): Promise<number> =>
    (
      await as(token)
        .post(`/listings/${id}/offers`, { quantity: 10, unitPrice: '20' })
        .expect(201)
    ).body.data.id;

  const holds = (account: string, role: ParticipantRole) =>
    contracts.get('AccessRegistry').hasRole(CHAIN_ROLE[role], account);

  beforeAll(async () => {
    chain = await startChainApp({ DEMO_MODE: 'true' });
    http = request(chain.app.getHttpServer());
    contracts = chain.app.get(ContractsRegistry);
    await waitForDemoAccounts(chain);
    const db = chain.app.get(DataSource);
    for (const r of [
      Role.ADMIN,
      Role.BUYER,
      Role.SELLER,
      Role.INVESTOR,
      Role.ACCOUNTS,
      Role.FARMER,
      Role.FIELD_OFFICER,
    ]) {
      t[r] = await demoToken(http, r);
      demo[r] = await db
        .getRepository(User)
        .findOneByOrFail({ role: r, isDemo: true });
    }
  });

  afterAll(async () => {
    await chain?.close();
  });

  describe('choosing', () => {
    it.each([
      ['nothing chosen', []],
      ['the same role twice', ['buyer', 'buyer']],
      ['a role nobody may choose', ['farmer']],
      ['an allowed role beside one nobody may choose', ['buyer', 'admin']],
      ['an unknown role', ['buyer', 'trader']],
      ['a single word in place of a list', 'buyer'],
    ])('refuses %s', async (_what, roles) => {
      const d = details();
      await http
        .post('/api/auth/sign-up')
        .send({ ...d, roles, password: PASSWORD, phoneCode: '123456' })
        .expect(400);
    });

    it('no longer takes a single role in place of the list', async () => {
      const d = details();
      await http
        .post('/api/auth/sign-up')
        .send({ ...d, role: 'buyer', password: PASSWORD, phoneCode: '123456' })
        .expect(400);
    });

    it('keeps one role as just that', async () => {
      const one = await signUp(['buyer']);
      expect(one.user).toMatchObject({ role: 'buyer', extraRoles: [] });
    });

    it('holds every role chosen, whichever way round, on the ledger too', async () => {
      const a = await signUp(['seller', 'buyer']);
      Object.assign(both, a);
      expect(a.user).toMatchObject({
        role: 'buyer',
        extraRoles: ['seller'],
        status: 'verified',
      });
      const b = await signUp(['seller', 'investor', 'buyer']);
      Object.assign(all, b);
      expect(b.user).toMatchObject({
        role: 'investor',
        extraRoles: ['buyer', 'seller'],
      });

      const registry = contracts.get('AccessRegistry');
      for (const role of [Role.INVESTOR, Role.BUYER, Role.SELLER] as const) {
        await expect(
          registry.isVerifiedAs(uuidToBytes32(all.id), CHAIN_ROLE[role]),
        ).resolves.toBe(true);
      }
      await expect(
        registry.isVerifiedAs(
          uuidToBytes32(both.id),
          CHAIN_ROLE[Role.INVESTOR],
        ),
      ).resolves.toBe(false);

      // The office sees them all, and their record agrees with the ledger.
      const detail = await as(t.admin)
        .get(`/participants/${all.id}`)
        .expect(200);
      expect(detail.body.data).toMatchObject({
        role: 'investor',
        extraRoles: ['buyer', 'seller'],
        selfRegistered: true,
        chainState: 'confirmed',
      });
      const integrity = await as(t.admin)
        .get(`/participants/${all.id}/integrity`)
        .expect(200);
      expect(integrity.body.data.matches).toBe(true);
      expect(integrity.body.data.ledger.extraRoles).toEqual([
        'buyer',
        'seller',
      ]);

      // Counted once under each role they hold.
      const figures = (await as(t.admin).get('/dashboard').expect(200)).body
        .data.figures.participants as Record<string, number>;
      for (const role of ['investor', 'buyer', 'seller']) {
        const [{ n }] = await chain.app.get(DataSource).query<[{ n: string }]>(
          `SELECT COUNT(*) AS n FROM users
            WHERE status = 'verified' AND (role = $1 OR $1 = ANY(extra_roles))`,
          [role],
        );
        expect(figures[role]).toBe(Number(n));
      }
      const primaryOnly = await chain.app
        .get(DataSource)
        .query<[{ n: string }]>(
          `SELECT COUNT(*) AS n FROM users WHERE status = 'verified' AND role = 'seller'`,
        );
      expect(figures.seller).toBeGreaterThan(Number(primaryOnly[0].n));
    });

    it('stays in their session and comes back on signing in', async () => {
      const me = await as(all.token).get('/auth/me').expect(200);
      expect(me.body.data).toMatchObject({
        role: 'investor',
        extraRoles: ['buyer', 'seller'],
      });
      const signedIn = await http
        .post('/api/auth/login')
        .send({ phone: both.phone, password: PASSWORD })
        .expect(200);
      expect(signedIn.body.data.user).toMatchObject({
        role: 'buyer',
        extraRoles: ['seller'],
      });
    });

    it('is found under each role they hold, and no other', async () => {
      const found = async (role: string, name: string) => {
        const res = await as(t.admin)
          .get(
            `/participants?role=${role}&limit=100&q=${encodeURIComponent(name)}`,
          )
          .expect(200);
        return (res.body.data as Array<{ id: string }>).map((p) => p.id);
      };
      const name = NAME;
      expect(await found('investor', name)).toContain(all.id);
      expect(await found('seller', name)).toContain(all.id);
      expect(await found('seller', name)).toContain(both.id);
      expect(await found('investor', name)).not.toContain(both.id);
      expect(await found('farmer', name)).not.toContain(all.id);
    });
  });

  describe('permissions merged', () => {
    it('opens to someone all that each of their roles may', async () => {
      await as(all.token).get('/projects').expect(200);
      await as(all.token).get('/reservations').expect(200);
      await as(all.token).get('/offers').expect(200);
      await as(all.token).get('/me/bank-account').expect(200);
      await listing(all.token);
    });

    it('gives nothing they did not choose', async () => {
      // Buyer and seller, never investor.
      await as(both.token).get('/projects').expect(403);
      await as(both.token).get('/reservations').expect(403);
      // Nobody gets an office power by holding several.
      await as(all.token).post('/projects', {}).expect(403);
      await as(all.token).get('/deal-proofs').expect(403);
    });

    it('changes nothing for someone with one role', async () => {
      const photo = await http
        .post('/api/photos')
        .auth(t.buyer, { type: 'bearer' })
        .attach('file', jpeg(`b-${RUN}`), 'b.jpg');
      await as(t.buyer)
        .post('/listings/external', {
          produceCode: 'TOMATO',
          quantity: 1,
          askingUnitPrice: '20',
          districtCode: 'BOGURA',
          description: 'x',
          photoIds: [photo.body.data?.id],
        })
        .expect(403);
      await as(t.buyer).get('/me/bank-account').expect(403);
      await as(t.seller).get('/projects').expect(403);
      await as(t.investor).get('/offers').expect(403);
    });

    it('lets a buyer who also sells keep bank details, as a seller', async () => {
      await as(both.token).get('/me/bank-account').expect(200);
    });
  });

  describe('on both sides of the marketplace', () => {
    let own: number;
    let others: number;
    let sale: number;
    let purchase: number;
    let buyerPhone: string;

    beforeAll(async () => {
      own = await listing(both.token);
      others = await listing(t.seller);
      sale = await offer(t.buyer, own);
      purchase = await offer(both.token, others);
      buyerPhone = (
        await as(t.admin).get(`/participants/${demo.buyer.id}`).expect(200)
      ).body.data.phone;
    });

    it('cannot buy from themselves', async () => {
      const res = await as(both.token)
        .post(`/listings/${own}/offers`, { quantity: 10, unitPrice: '20' })
        .expect(409);
      expect(res.body.code).toBe('OWN_LISTING');
    });

    it('never learns who buys from them', async () => {
      const res = await as(both.token).get(`/offers/${sale}`).expect(200);
      expect(res.body.data.buyer).toEqual({ id: null, name: null });
      expect(res.body.data.seller.id).toBe(both.id);
      const text = JSON.stringify(res.body);
      expect(text).not.toContain(demo.buyer.id);
      expect(text).not.toContain(buyerPhone);
    });

    it('never learns who sells to them', async () => {
      const res = await as(both.token).get(`/offers/${purchase}`).expect(200);
      expect(res.body.data.buyer.id).toBe(both.id);
      expect(res.body.data.seller).toMatchObject({ id: null, name: null });
      expect(JSON.stringify(res.body)).not.toContain(demo.seller.id);
      const seen = await as(both.token).get(`/listings/${others}`).expect(200);
      expect(seen.body.data.seller).toMatchObject({ id: null, name: null });
    });

    it('cannot find the other side by searching', async () => {
      const res = await as(both.token)
        .get(`/offers?q=${encodeURIComponent(buyerPhone)}`)
        .expect(200);
      expect(res.body.data).toEqual([]);
    });

    it('sees what was paid only on what they are buying', async () => {
      const bought = await as(both.token)
        .get(`/offers/${purchase}`)
        .expect(200);
      expect(bought.body.data).toHaveProperty('paid');
      const sold = await as(both.token).get(`/offers/${sale}`).expect(200);
      expect(sold.body.data).not.toHaveProperty('paid');
      expect(sold.body.data).not.toHaveProperty('underReview');
    });

    it('sends payment proofs only for what they are buying', async () => {
      await as(both.token).get(`/offers/${purchase}/proofs`).expect(200);
      const res = await as(both.token)
        .get(`/offers/${sale}/proofs`)
        .expect(404);
      expect(res.body.code).toBe('OFFER_NOT_FOUND');
    });

    it('decides offers only on their own listing', async () => {
      const refused = await as(both.token)
        .post(`/offers/${purchase}/approve`)
        .expect(403);
      expect(refused.body.code).toBe('OFFER_DECIDE_NOT_ALLOWED');
      await as(both.token).post(`/offers/${sale}/approve`).expect(200);
    });

    it('withdraws only their own offers', async () => {
      const someone = await offer(t.buyer, own);
      await as(both.token).post(`/offers/${someone}/withdraw`).expect(404);
    });

    it('sees buying and selling apart, or together', async () => {
      const ids = async (query: string) =>
        (
          (await as(both.token).get(`/offers?limit=100${query}`).expect(200))
            .body.data as Array<{ id: number }>
        ).map((o) => o.id);
      const buying = await ids('&side=buying');
      const selling = await ids('&side=selling');
      expect(buying).toContain(purchase);
      expect(buying).not.toContain(sale);
      expect(selling).toContain(sale);
      expect(selling).not.toContain(purchase);
      expect(await ids('')).toEqual(expect.arrayContaining([sale, purchase]));
      // Nobody else's.
      const someoneElse = await offer(t.buyer, others);
      expect(await ids('')).not.toContain(someoneElse);
    });

    it('shows people with one role nothing from a side they are not on', async () => {
      const buyerSelling = await as(t.buyer)
        .get('/offers?side=selling')
        .expect(200);
      expect(buyerSelling.body.data).toEqual([]);
      const sellerBuying = await as(t.seller)
        .get('/offers?side=buying')
        .expect(200);
      expect(sellerBuying.body.data).toEqual([]);
      await as(t.admin).get('/offers?side=buying').expect(200);
    });

    it('counts and lists a deal with no project on the dashboard alike', async () => {
      const queues = (await as(t.admin).get('/dashboard').expect(200)).body.data
        .queues as Array<{
        key: string;
        count: number;
        oldest: Array<{ id: string; project: unknown }>;
      }>;
      const deals = queues.find((q) => q.key === 'deals.awaiting-payment')!;
      expect(deals.count).toBeGreaterThan(0);
      expect(deals.oldest).toContainEqual(
        expect.objectContaining({ id: String(sale), project: null }),
      );
    });

    it('still lets the office find both sides', async () => {
      const res = await as(t.admin).get(`/offers/${sale}`).expect(200);
      expect(res.body.data.buyer.id).toBe(demo.buyer.id);
      expect(res.body.data.seller.id).toBe(both.id);
    });

    it('is not told that their own new listing can fill their own request', async () => {
      const validUntil = bdDate(
        new Date(
          (await chain.app.get(ChainClock).now()).getTime() + 10 * 86_400_000,
        ),
      );
      const post = (token: string) =>
        as(token)
          .post('/buyer-requests', {
            produceCode: 'POTATO',
            quantity: 5,
            maxUnitPrice: '30',
            validUntil,
          })
          .expect(201);
      await post(both.token);
      await post(t.buyer);
      const fresh = await listing(both.token, 'POTATO');
      const told = async (token: string) => {
        const res = await as(token).get('/notifications?limit=100').expect(200);
        return (
          res.body.data.items as Array<{
            kind: string;
            subject: { id: string } | null;
          }>
        ).some(
          (n) =>
            n.kind === 'request.listing-added' &&
            n.subject?.id === String(fresh),
        );
      };
      await expect(told(t.buyer)).resolves.toBe(true);
      await expect(told(both.token)).resolves.toBe(false);

      // Nor is it offered as a match for their own request.
      const matches = async (token: string) => {
        const res = await as(token)
          .get('/buyer-requests?mine=true&produceCode=POTATO')
          .expect(200);
        return (
          res.body.data as Array<{ matchingListings: Array<{ id: number }> }>
        ).flatMap((r) => r.matchingListings.map((m) => m.id));
      };
      expect(await matches(t.buyer)).toContain(fresh);
      expect(await matches(both.token)).not.toContain(fresh);
    });
  });

  describe('investing and buying, both', () => {
    let projectId: string;
    let farmerListing: number;

    beforeAll(async () => {
      projectId = (
        await as(t.admin)
          .post('/projects', {
            title: `Merged Tomato ${RUN}`,
            produceCode: 'TOMATO',
            districtCode: 'BOGURA',
            location: 'Shibganj',
            farmerId: demo.farmer.id,
            durationType: 'short_term',
            durationMonths: 5,
            fundingTarget: '50000',
            slotPrice: '10000',
            estimatedReturnMinBps: 0,
            estimatedReturnMaxBps: 500,
          })
          .expect(201)
      ).body.data.id;
      await as(t.admin).post(`/projects/${projectId}/publish`).expect(200);
      const booked = await as(all.token)
        .post(`/projects/${projectId}/reservations`, { slots: 5 })
        .expect(201);
      await as(t.accounts)
        .post(`/reservations/${booked.body.data.id}/confirm`, {
          paymentReference: `MERGED-${RUN}`,
        })
        .expect(200);
      await as(t.admin).post(`/projects/${projectId}/activate`).expect(200);
      farmerListing = (
        await as(t.field_officer)
          .post('/listings/produce', {
            projectId,
            quantity: 1000,
            askingUnitPrice: '20',
          })
          .expect(201)
      ).body.data.id;
    });

    it('invests like anyone: sees the project, and their own bookings', async () => {
      await as(all.token).get(`/projects/${projectId}`).expect(200);
      const mine = await as(all.token).get('/reservations').expect(200);
      expect(mine.body.data).toHaveLength(1);
      expect(mine.body.data[0].investor?.id ?? all.id).toBe(all.id);
    });

    it('cannot tell which farmer a listing comes from', async () => {
      const seen = await as(all.token)
        .get(`/listings/${farmerListing}`)
        .expect(200);
      expect(seen.body.data.project).toBeNull();
      expect(seen.body.data.seller).toMatchObject({ id: null, name: null });
      // Not by asking for a project's listings either.
      const asked = await as(all.token)
        .get(`/listings?projectId=${projectId}`)
        .expect(200);
      expect(asked.body.data).toEqual([]);
      const receipts = await as(all.token)
        .get(`/warehouse-receipts?projectId=${projectId}`)
        .expect(200);
      expect(receipts.body.data).toEqual([]);
      // The office and the farmer's officer can.
      const office = await as(t.admin)
        .get(`/listings?projectId=${projectId}`)
        .expect(200);
      expect(office.body.data.map((l: { id: number }) => l.id)).toContain(
        farmerListing,
      );
    });

    it('sees their statement as an investor', async () => {
      await as(all.token).get('/me/statement').expect(200);
    });
  });

  describe('leaving', () => {
    it('loses every role when access is revoked, and regains them all', async () => {
      const leaver = await signUp(['investor', 'buyer', 'seller']);
      const account = (
        await as(t.admin).get(`/participants/${leaver.id}`).expect(200)
      ).body.data.account as string;
      const roles = [Role.INVESTOR, Role.BUYER, Role.SELLER] as const;
      for (const r of roles)
        await expect(holds(account, r)).resolves.toBe(true);

      await as(t.admin)
        .post(`/participants/${leaver.id}/revoke`, {
          reason: 'contract_ended',
        })
        .expect(200);
      for (const r of roles)
        await expect(holds(account, r)).resolves.toBe(false);
      await as(leaver.token).get('/offers').expect(401);

      await as(t.admin)
        .post(`/participants/${leaver.id}/verify`, {})
        .expect(200);
      for (const r of roles)
        await expect(holds(account, r)).resolves.toBe(true);
    });

    it('keeps every role on a new key', async () => {
      const person = await signUp(['buyer', 'seller']);
      const before = (
        await as(t.admin).get(`/participants/${person.id}`).expect(200)
      ).body.data.account as string;
      await as(t.admin)
        .post(`/participants/${person.id}/replace-key`)
        .expect((res) => {
          expect([200, 201]).toContain(res.status);
        });
      const after = (
        await as(t.admin).get(`/participants/${person.id}`).expect(200)
      ).body.data.account as string;
      expect(after).not.toBe(before);
      await expect(holds(after, Role.BUYER)).resolves.toBe(true);
      await expect(holds(after, Role.SELLER)).resolves.toBe(true);
      await expect(holds(before, Role.SELLER)).resolves.toBe(false);
    });
  });
});
