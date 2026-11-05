/**
 * Buyers and sellers never learn who the other is, so that every deal goes
 * through the platform: checked on what the API sends, not on what a screen
 * shows, through a whole sale.
 */
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ChainClock } from '../src/blockchain/chain-clock';
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

describe('Who buys and who sells stays unknown (node + database)', () => {
  let chain: ChainApp;
  let http: ReturnType<typeof request>;
  const t: Record<string, string> = {};
  const user: Record<string, User> = {};
  const phones: Record<string, string> = {};
  let sellerListing: number;
  let farmerListing: number;
  let sellerDeal: number;
  let farmerDeal: number;
  let projectId: string;
  let photoId: string;

  const as = (token: string) => ({
    get: (path: string) =>
      http.get(`/api${path}`).auth(token, { type: 'bearer' }),
    post: (path: string, body: object = {}) =>
      http.post(`/api${path}`).auth(token, { type: 'bearer' }).send(body),
  });

  /** Nothing in a reply may name this person or carry their id or number. */
  function saysNothingOf(body: unknown, who: User): void {
    const text = JSON.stringify(body);
    expect(text).not.toContain(who.id);
    expect(text).not.toContain(phones[who.id]);
    expect(text).not.toMatch(/Demo (Buyer|Seller|Farmer)/);
  }

  const paidDeal = async (listing: number, ref: string): Promise<number> => {
    const made = await as(t.buyer)
      .post(`/listings/${listing}/offers`, { quantity: 10, unitPrice: '20' })
      .expect(201);
    const id = made.body.data.id as number;
    await as(listing === sellerListing ? t.seller : t.admin)
      .post(`/offers/${id}/approve`)
      .expect(200);
    await as(t.accounts)
      .post(`/offers/${id}/payment`, { paymentReference: `${ref}-${RUN}` })
      .expect(200);
    return id;
  };

  beforeAll(async () => {
    chain = await startChainApp({ DEMO_MODE: 'true' });
    http = request(chain.app.getHttpServer());
    await waitForDemoAccounts(chain);
    const db = chain.app.get(DataSource);
    for (const r of [
      Role.ADMIN,
      Role.ACCOUNTS,
      Role.INVESTOR,
      Role.OPERATIONS,
      Role.FARMER,
      Role.FIELD_OFFICER,
      Role.BUYER,
      Role.SELLER,
    ]) {
      t[r] = await demoToken(http, r);
      user[r] = await db
        .getRepository(User)
        .findOneByOrFail({ role: r, isDemo: true });
    }

    for (const r of [Role.BUYER, Role.SELLER, Role.FARMER]) {
      const person = await as(t.admin)
        .get(`/participants/${user[r].id}`)
        .expect(200);
      phones[user[r].id] = person.body.data.phone as string;
      expect(phones[user[r].id]).toMatch(/^\+8801\d{9}$/);
    }

    // Fresh produce from a farmer's project, listed by their officer.
    projectId = (
      await as(t.admin)
        .post('/projects', {
          title: `Tomato ${RUN}`,
          produceCode: 'TOMATO',
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
    await as(t.admin).post(`/projects/${projectId}/publish`).expect(200);
    const booked = await as(t.investor)
      .post(`/projects/${projectId}/reservations`, { slots: 5 })
      .expect(201);
    await as(t.accounts)
      .post(`/reservations/${booked.body.data.id}/confirm`, {
        paymentReference: `FUND-${RUN}`,
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

    // An outside seller's own produce.
    photoId = (
      await http
        .post('/api/photos')
        .auth(t.seller, { type: 'bearer' })
        .attach('file', jpeg(`goods-${RUN}`), 'goods.jpg')
        .expect(201)
    ).body.data.id;
    sellerListing = (
      await as(t.seller)
        .post('/listings/external', {
          produceCode: 'TOMATO',
          quantity: 1000,
          askingUnitPrice: '20',
          districtCode: 'MUNSHIGANJ',
          description: 'Sorted and bagged, 2026-10-20',
          photoIds: [photoId],
        })
        .expect(201)
    ).body.data.id;
    await as(t.admin).post(`/listings/${sellerListing}/approve`).expect(200);

    sellerDeal = await paidDeal(sellerListing, 'SELLER');
    farmerDeal = await paidDeal(farmerListing, 'FARMER');
  });

  afterAll(async () => {
    await chain?.close();
  });

  describe('a buyer', () => {
    it('sees listings with no seller, farmer or project', async () => {
      const list = await as(t.buyer).get('/listings?limit=100').expect(200);
      saysNothingOf(list.body, user.seller);
      saysNothingOf(list.body, user.farmer);
      const one = await as(t.buyer)
        .get(`/listings/${sellerListing}`)
        .expect(200);
      expect(one.body.data.seller).toEqual({
        kind: 'seller',
        id: null,
        name: null,
      });
      const fresh = await as(t.buyer)
        .get(`/listings/${farmerListing}`)
        .expect(200);
      expect(fresh.body.data.seller).toEqual({
        kind: 'farmer',
        id: null,
        name: null,
      });
      expect(fresh.body.data.project).toBeNull();
      saysNothingOf(fresh.body, user.farmer);
    });

    it('sees no seller on a deal, even paid and delivered', async () => {
      for (const [id, who] of [
        [sellerDeal, user.seller],
        [farmerDeal, user.farmer],
      ] as const) {
        const deal = await as(t.buyer).get(`/offers/${id}`).expect(200);
        expect(deal.body.data.status).toBe('paid');
        expect(deal.body.data.seller.id).toBeNull();
        expect(deal.body.data.seller.name).toBeNull();
        expect(JSON.stringify(deal.body)).not.toContain(who.id);
      }
      const mine = await as(t.buyer).get('/offers?limit=100').expect(200);
      expect(JSON.stringify(mine.body)).not.toContain(user.seller.id);
      expect(JSON.stringify(mine.body)).not.toContain(user.farmer.id);
    });

    it('cannot find a seller by name, number or NID', async () => {
      const q = encodeURIComponent;
      for (const text of ['Demo Seller', phones[user.seller.id]]) {
        // The office finds them this way, so a buyer's nothing means something.
        const office = await as(t.admin)
          .get(`/listings?q=${q(text)}&limit=100`)
          .expect(200);
        expect(office.body.data.map((l: { id: number }) => l.id)).toContain(
          sellerListing,
        );
        const found = await as(t.buyer)
          .get(`/listings?q=${q(text)}`)
          .expect(200);
        expect(found.body.data).toEqual([]);
        const deals = await as(t.buyer)
          .get(`/offers?q=${q(text)}`)
          .expect(200);
        expect(deals.body.data).toEqual([]);
      }
      // By produce and by number it still finds what it should.
      const tomato = await as(t.buyer).get('/listings?q=tomato').expect(200);
      expect(tomato.body.data.length).toBeGreaterThan(0);
      const number = await as(t.buyer)
        .get(`/offers?q=${q(`#${sellerDeal}`)}`)
        .expect(200);
      expect(number.body.data).toHaveLength(1);
    });

    it('cannot open a project, which names its farmer', async () => {
      await as(t.buyer).get('/projects').expect(403);
      await as(t.buyer).get(`/projects/${projectId}`).expect(403);
      await as(t.buyer).get(`/projects/${projectId}/timeline`).expect(403);
      await as(t.buyer).get(`/projects/${projectId}/cover`).expect(403);
      await as(t.buyer).get(`/participants/${user.seller.id}`).expect(403);
    });
  });

  describe('a seller', () => {
    it('sees no buyer on their deals, and themselves as they are', async () => {
      const deal = await as(t.seller).get(`/offers/${sellerDeal}`).expect(200);
      expect(deal.body.data.buyer).toEqual({ id: null, name: null });
      expect(deal.body.data.seller).toEqual({
        kind: 'seller',
        id: user.seller.id,
        name: 'Demo Seller',
      });
      saysNothingOf(
        (await as(t.seller).get('/offers?limit=100').expect(200)).body.data.map(
          (o: { buyer: unknown }) => o.buyer,
        ),
        user.buyer,
      );
    });

    it('sees no name on a buyer’s request, nor can find one by it', async () => {
      const posted = await as(t.buyer)
        .post('/buyer-requests', {
          produceCode: 'TOMATO',
          quantity: 5,
          maxUnitPrice: '10',
          validUntil: bdDate(
            new Date(
              (await chain.app.get(ChainClock).now()).getTime() + 86_400_000,
            ),
          ),
        })
        .expect(201);
      // The buyer themselves knows it is theirs.
      expect(posted.body.data.buyer.id).toBe(user.buyer.id);
      const seen = await as(t.seller)
        .get('/buyer-requests?limit=100')
        .expect(200);
      saysNothingOf(seen.body, user.buyer);
      const found = await as(t.seller)
        .get(`/buyer-requests?q=${encodeURIComponent('Demo Buyer')}`)
        .expect(200);
      expect(found.body.data).toEqual([]);
    });

    it('cannot open a project either', async () => {
      await as(t.seller).get(`/projects/${projectId}`).expect(403);
    });
  });

  describe('a farmer', () => {
    it('sees no buyer on the deal for their produce', async () => {
      const deal = await as(t.farmer).get(`/offers/${farmerDeal}`).expect(200);
      expect(deal.body.data.buyer).toEqual({ id: null, name: null });
      expect(deal.body.data.seller.id).toBe(user.farmer.id);
    });

    it('sees no outside seller on another’s listing', async () => {
      const other = await as(t.farmer)
        .get(`/listings/${sellerListing}`)
        .expect(200);
      expect(other.body.data.seller.name).toBeNull();
    });
  });

  describe('WeGro’s side', () => {
    it('knows both sides, to arrange the handover', async () => {
      for (const token of [t.admin, t.accounts, t.operations]) {
        const deal = await as(token).get(`/offers/${sellerDeal}`).expect(200);
        expect(deal.body.data.buyer.id).toBe(user.buyer.id);
        expect(deal.body.data.seller.id).toBe(user.seller.id);
      }
      const found = await as(t.admin)
        .get(`/offers?q=${encodeURIComponent('Demo Seller')}`)
        .expect(200);
      expect(found.body.data.map((o: { id: number }) => o.id)).toContain(
        sellerDeal,
      );
    });

    it('a farmer’s officer knows the buyer and their own farmer', async () => {
      const deal = await as(t.field_officer)
        .get(`/offers/${farmerDeal}`)
        .expect(200);
      expect(deal.body.data.buyer.id).toBe(user.buyer.id);
      expect(deal.body.data.seller.id).toBe(user.farmer.id);
      const listing = await as(t.field_officer)
        .get(`/listings/${farmerListing}`)
        .expect(200);
      expect(listing.body.data.project.id).toBe(projectId);
      // An outside seller is no officer's own.
      const other = await as(t.field_officer)
        .get(`/listings/${sellerListing}`)
        .expect(200);
      expect(other.body.data.seller.name).toBeNull();
    });

    it('admins are told to arrange a handover with no warehouse between', async () => {
      const notes = await as(t.admin)
        .get('/notifications?limit=100')
        .expect(200);
      const asked = (
        notes.body.data.items as Array<{
          kind: string;
          subject: { id: string };
        }>
      )
        .filter((n) => n.kind === 'deal.arrange-handover')
        .map((n) => n.subject.id);
      expect(asked).toEqual(
        expect.arrayContaining([String(sellerDeal), String(farmerDeal)]),
      );
    });
  });

  describe('free text the other side reads', () => {
    it.each([
      'Call 01711-000-001',
      '০১৭১১০০০০০১',
      'rahim@example.com',
      'wa.me/8801711000001',
      'on WhatsApp',
    ])('refuses %s in a listing description', async (description) => {
      const res = await as(t.seller)
        .post('/listings/external', {
          produceCode: 'TOMATO',
          quantity: 10,
          askingUnitPrice: '20',
          districtCode: 'MUNSHIGANJ',
          description,
          photoIds: [photoId],
        })
        .expect(422);
      expect(res.body.code).toBe('CONTACT_DETAILS_NOT_ALLOWED');
    });

    it('refuses it in delivery notes, and takes plain notes', async () => {
      const refused = await as(t.buyer)
        .post(`/offers/${sellerDeal}/delivery`, {
          quantity: 10,
          notes: 'Next time call me on 01711000001',
        })
        .expect(422);
      expect(refused.body.code).toBe('CONTACT_DETAILS_NOT_ALLOWED');
      await as(t.buyer)
        .post(`/offers/${sellerDeal}/delivery`, {
          quantity: 10,
          notes: 'All 10 kg arrived in good condition',
        })
        .expect(200);
    });
  });
});
