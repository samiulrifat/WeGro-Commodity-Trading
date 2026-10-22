/** The marketplace end to end, against the local chain and a throwaway schema. */
import { randomBytes, randomInt } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ChainClock } from '../src/blockchain/chain-clock';
import { ContractsRegistry } from '../src/blockchain/contracts.registry';
import { EventIndexerService } from '../src/blockchain/indexer/event-indexer.service';
import { bdDate } from '../src/common/time/bd-dates';
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
import { travel as chainTravel } from './support/chain-time';

const RUN = randomBytes(4).toString('hex').toUpperCase();

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

describe('Marketplace (node + database)', () => {
  let chain: ChainApp;
  let http: ReturnType<typeof request>;
  let db: DataSource;
  const t: Record<string, string> = {};
  const user: Record<string, User> = {};
  let secondBuyer: { id: string; token: string };
  let maizeProject: string;
  let tomatoProject: string;
  let receiptId: string;
  let receiptListing: number;
  let deal: number;

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

  async function activeProject(produceCode: string): Promise<string> {
    const id = (
      await as(t.admin)
        .post('/projects', {
          title: `${produceCode} for sale ${RUN}`,
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
        paymentReference: `M-${produceCode}-${RUN}`,
      })
      .expect(200);
    await as(t.admin).post(`/projects/${id}/activate`).expect(200);
    return id;
  }

  async function travel(seconds: number) {
    return chainTravel(chain.app, seconds);
  }

  beforeAll(async () => {
    chain = await startChainApp({ DEMO_MODE: 'true' });
    http = request(chain.app.getHttpServer());
    db = chain.app.get(DataSource);
    await waitForDemoAccounts(chain);
    for (const r of [
      Role.ADMIN,
      Role.ACCOUNTS,
      Role.INVESTOR,
      Role.WAREHOUSE,
      Role.FARMER,
      Role.FIELD_OFFICER,
      Role.BUYER,
      Role.SELLER,
      Role.SUPER_ADMIN,
    ]) {
      t[r] = await demoToken(http, r);
      user[r] = await db
        .getRepository(User)
        .findOneByOrFail({ role: r, isDemo: true });
    }

    // A second buyer.
    const phone = `0193${String(randomInt(1e6, 1e7))}`;
    const reg = await as(t.admin)
      .post('/participants', {
        role: 'buyer',
        fullName: 'Second Buyer',
        phone,
        nid: `${randomInt(2, 9)}${randomInt(1e8, 1e9)}`,
        dateOfBirth: '1984-04-04',
        district: 'DHAKA',
        address: 'Made-up trading address, Dhaka',
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
    secondBuyer = {
      id: reg.body.data.participant.id,
      token: (
        await as(login.body.data.accessToken)
          .post('/auth/change-password', {
            currentPassword: temp,
            newPassword: `${phone}-pw-ok`,
          })
          .expect(200)
      ).body.data.accessToken,
    };

    // A site with the demo operator, and a receipt for the farmer's maize.
    const site = await as(t.admin)
      .post('/warehouse-sites', {
        name: `Market Hub ${RUN}`,
        districtCode: 'BOGURA',
        address: 'Hub road, Bogura',
        storageType: 'warehouse',
      })
      .expect(201);
    await as(t.admin)
      .put(`/warehouse-operators/${user.warehouse.id}`, {
        siteId: site.body.data.id,
      })
      .expect(200);
    maizeProject = await activeProject('MAIZE');
    tomatoProject = await activeProject('TOMATO');
    receiptId = (
      await as(t.warehouse)
        .post('/warehouse-receipts', {
          projectId: maizeProject,
          quantity: 5000,
          intakeDate: await day(),
          expiresOn: await day(180),
        })
        .expect(201)
    ).body.data.id;
  });

  afterAll(async () => {
    await chain?.close();
  });

  describe('listings', () => {
    it("lets the farmer's officer list the farmer's receipt, locking it", async () => {
      await as(t.admin)
        .post('/listings/receipt', { receiptId, askingUnitPrice: '30' })
        .expect(403);
      const res = await as(t.field_officer)
        .post('/listings/receipt', { receiptId, askingUnitPrice: '30.00' })
        .expect(201);
      receiptListing = res.body.data.id;
      expect(res.body.data).toMatchObject({
        status: 'open',
        source: 'warehouse',
        receiptId,
        seller: { kind: 'farmer', id: user.farmer.id, name: 'Demo Farmer' },
        produce: { code: 'MAIZE', unit: 'kg' },
        district: { code: 'BOGURA', name: 'Bogura' },
        quantity: 5000,
        available: 5000,
        askingUnitPrice: '30.00',
      });
      const receipt = await as(t.warehouse)
        .get(`/warehouse-receipts/${receiptId}`)
        .expect(200);
      expect(receipt.body.data.status).toBe('listed');
    });

    it('shows open listings to every signed-in user, filtered', async () => {
      const res = await as(t.investor)
        .get('/listings?produceCode=MAIZE&districtCode=BOGURA')
        .expect(200);
      expect(res.body.data.map((l: { id: number }) => l.id)).toContain(
        receiptListing,
      );
      await http.get('/api/listings').expect(401);
    });

    it('lists fresh produce straight from its project, and only fresh produce', async () => {
      const farmer = await as(t.field_officer)
        .post('/listings/produce', {
          projectId: tomatoProject,
          quantity: 1000,
          askingUnitPrice: '42',
        })
        .expect(201);
      expect(farmer.body.data).toMatchObject({
        source: 'fresh',
        seller: { kind: 'farmer' },
        receiptId: null,
      });
      const wegro = await as(t.admin)
        .post('/listings/produce', {
          projectId: tomatoProject,
          quantity: 500,
          askingUnitPrice: '40',
        })
        .expect(201);
      expect(wegro.body.data.seller).toEqual({
        kind: 'wegro',
        id: null,
        name: 'WeGro',
      });
      const stored = await as(t.admin)
        .post('/listings/produce', {
          projectId: maizeProject,
          quantity: 1,
          askingUnitPrice: '1',
        })
        .expect(422);
      expect(stored.body.code).toBe('NOT_PERISHABLE');
      await as(t.field_officer)
        .post(`/listings/${wegro.body.data.id}/cancel`)
        .expect(403);
      expect(
        (
          await as(t.admin)
            .post(`/listings/${wegro.body.data.id}/cancel`)
            .expect(200)
        ).body.data.status,
      ).toBe('cancelled');
    });
  });

  describe('offers and deals', () => {
    let rival: number;

    it("takes offers for part of the listing at the buyer's own price", async () => {
      const res = await as(t.buyer)
        .post(`/listings/${receiptListing}/offers`, {
          quantity: 2000,
          unitPrice: '31.00',
        })
        .expect(201);
      deal = res.body.data.id;
      expect(res.body.data).toMatchObject({
        status: 'pending',
        quantity: 2000,
        unitPrice: '31.00',
        amount: '62000.00',
      });
      const tooMuch = await as(t.buyer)
        .post(`/listings/${receiptListing}/offers`, {
          quantity: 5001,
          unitPrice: '31',
        })
        .expect(409);
      expect(tooMuch.body).toMatchObject({
        code: 'EXCEEDS_AVAILABLE',
        details: { available: 5000 },
      });
      rival = (
        await as(secondBuyer.token)
          .post(`/listings/${receiptListing}/offers`, {
            quantity: 4000,
            unitPrice: '30.50',
          })
          .expect(201)
      ).body.data.id;
      // A buyer can take back an offer nobody has answered yet.
      const second = await as(t.buyer)
        .post(`/listings/${receiptListing}/offers`, {
          quantity: 10,
          unitPrice: '29',
        })
        .expect(201);
      const withdrawn = await as(t.buyer)
        .post(`/offers/${second.body.data.id}/withdraw`)
        .expect(200);
      expect(withdrawn.body.data.status).toBe('withdrawn');
    });

    it('holds the quantity once an admin approves, with a payment deadline', async () => {
      const res = await as(t.admin).post(`/offers/${deal}/approve`).expect(200);
      expect(res.body.data.status).toBe('approved');
      // Exactly the ledger's deadline: approval time plus the 7-day dealTtl.
      const trade = chain.app.get(ContractsRegistry).get('TradeLedger');
      const onChain = await trade.getOffer(deal);
      expect(await trade.dealTtl()).toBe(7n * 86_400n);
      expect(new Date(res.body.data.paymentDueAt).getTime()).toBe(
        Number(onChain.paymentDueAt) * 1000,
      );
      const listing = (
        await as(t.buyer).get(`/listings/${receiptListing}`).expect(200)
      ).body.data;
      expect(listing).toMatchObject({ available: 3000, unpaidDeals: 1 });

      const over = await as(t.admin)
        .post(`/offers/${rival}/approve`)
        .expect(409);
      expect(over.body).toMatchObject({
        code: 'EXCEEDS_AVAILABLE',
        details: { available: 3000 },
      });
      await as(t.admin).post(`/offers/${rival}/reject`).expect(200);
      await as(t.admin).post(`/offers/${rival}/reject`).expect(409);
    });

    it('shows each party only the offers that concern them', async () => {
      await as(secondBuyer.token).get(`/offers/${deal}`).expect(404);
      for (const token of [
        t.buyer,
        t.field_officer,
        t.farmer,
        t.warehouse,
        t.admin,
      ]) {
        await as(token).get(`/offers/${deal}`).expect(200);
      }
      await as(t.investor).get(`/offers/${deal}`).expect(403);
    });

    it('will not cancel a listing with unpaid deals', async () => {
      const res = await as(t.field_officer)
        .post(`/listings/${receiptListing}/cancel`)
        .expect(409);
      expect(res.body).toMatchObject({
        code: 'DEALS_PENDING',
        details: { unpaidDeals: 1 },
      });
    });
  });

  describe('payment and delivery', () => {
    it('splits the bought quantity off to the buyer when Accounts confirms payment', async () => {
      const res = await as(t.accounts)
        .post(`/offers/${deal}/payment`, { paymentReference: `bkash ${RUN}` })
        .expect(200);
      expect(res.body.data).toMatchObject({
        status: 'paid',
        paymentReference: `BKASH ${RUN}`,
      });
      expect(res.body.data.receiptPartId).toMatch(/^0x[0-9a-f]{64}$/);
      const mine = (await as(t.buyer).get(`/offers/${deal}`).expect(200)).body
        .data;
      expect(mine).not.toHaveProperty('paymentReference');

      const part = (
        await as(t.buyer)
          .get(`/warehouse-receipts/${res.body.data.receiptPartId}`)
          .expect(200)
      ).body.data;
      expect(part).toMatchObject({
        status: 'sold',
        quantity: 2000,
        owner: { kind: 'buyer', id: user.buyer.id },
      });
      expect(
        (await as(t.buyer).get(`/listings/${receiptListing}`).expect(200)).body
          .data,
      ).toMatchObject({
        available: 3000,
        unpaidDeals: 0,
      });
    });

    it("records each side's delivery, with a photo, and flags a quantity mismatch", async () => {
      const photo = await http
        .post('/api/photos')
        .auth(t.buyer, { type: 'bearer' })
        .attach('file', jpeg(`bags-${RUN}`), 'bags.jpg')
        .expect(201);
      const first = await as(t.buyer)
        .post(`/offers/${deal}/delivery`, {
          quantity: 2000,
          notes: 'All bags dry',
          photoId: photo.body.data.id,
        })
        .expect(200);
      expect(first.body.data).toMatchObject({
        status: 'paid',
        buyerDelivery: {
          quantity: 2000,
          notes: 'All bags dry',
          status: 'recorded',
        },
        handlerDelivery: null,
        discrepancy: false,
      });
      await as(t.buyer)
        .post(`/offers/${deal}/delivery`, { quantity: 2000 })
        .expect(409);
      await as(t.field_officer)
        .post(`/offers/${deal}/delivery`, { quantity: 2000 })
        .expect(403);

      const done = await as(t.warehouse)
        .post(`/offers/${deal}/delivery`, {
          quantity: 1990,
          notes: '10 kg short',
        })
        .expect(200);
      expect(done.body.data).toMatchObject({
        status: 'delivered',
        discrepancy: true,
      });
      expect(done.body.data.handlerDelivery.quantity).toBe(1990);

      const flagged = await as(t.admin)
        .get('/offers?discrepancy=true')
        .expect(200);
      expect(flagged.body.data.map((o: { id: number }) => o.id)).toContain(
        deal,
      );
      const part = (
        await as(t.buyer)
          .get(`/warehouse-receipts/${done.body.data.receiptPartId}`)
          .expect(200)
      ).body.data;
      expect(part.status).toBe('collected');

      const img = await as(t.admin)
        .get(`/offers/${deal}/deliveries/buyer/photo`)
        .buffer(true)
        .parse((r, cb) => {
          const parts: Buffer[] = [];
          r.on('data', (c: Buffer) => parts.push(c));
          r.on('end', () => cb(null, Buffer.concat(parts)));
        })
        .expect(200);
      expect((img.body as Buffer).toString('latin1')).toContain(`bags-${RUN}`);
    });

    it('never accepts a payment reference twice', async () => {
      const o = (
        await as(secondBuyer.token)
          .post(`/listings/${receiptListing}/offers`, {
            quantity: 100,
            unitPrice: '30',
          })
          .expect(201)
      ).body.data.id;
      await as(t.admin).post(`/offers/${o}/approve`).expect(200);
      const res = await as(t.accounts)
        .post(`/offers/${o}/payment`, { paymentReference: `BKASH ${RUN}` })
        .expect(409);
      expect(res.body.code).toBe('PAYMENT_REF_ALREADY_USED');
      await as(t.admin).post(`/offers/${o}/cancel-deal`).expect(200);
    });

    it("lets fresh produce be handed over by the farmer's field officer", async () => {
      const listing = (
        await as(t.buyer)
          .get(`/listings?projectId=${tomatoProject}`)
          .expect(200)
      ).body.data[0];
      const o = (
        await as(t.buyer)
          .post(`/listings/${listing.id}/offers`, {
            quantity: 300,
            unitPrice: '41',
          })
          .expect(201)
      ).body.data.id;
      await as(t.admin).post(`/offers/${o}/approve`).expect(200);
      await as(t.accounts)
        .post(`/offers/${o}/payment`, { paymentReference: `T-${RUN}` })
        .expect(200);
      await as(t.warehouse)
        .post(`/offers/${o}/delivery`, { quantity: 300 })
        .expect(403);
      await as(t.field_officer)
        .post(`/offers/${o}/delivery`, { quantity: 300 })
        .expect(200);
      const done = await as(t.buyer)
        .post(`/offers/${o}/delivery`, { quantity: 300, notes: 'Fresh' })
        .expect(200);
      expect(done.body.data).toMatchObject({
        status: 'delivered',
        discrepancy: false,
        receiptPartId: null,
      });
    });
  });

  describe('payment deadline', () => {
    it('refuses late payment and expires the deal, returning its quantity', async () => {
      const o = (
        await as(secondBuyer.token)
          .post(`/listings/${receiptListing}/offers`, {
            quantity: 1000,
            unitPrice: '30',
          })
          .expect(201)
      ).body.data.id;
      await as(t.admin).post(`/offers/${o}/approve`).expect(200);
      const job = chain.app.get(DealExpiryJob);
      await expect(job.run()).resolves.toBe(0);

      await travel(7 * 86_400 + 1);
      const late = await as(t.accounts)
        .post(`/offers/${o}/payment`, { paymentReference: `LATE-${RUN}` })
        .expect(409);
      expect(late.body.code).toBe('PAYMENT_OVERDUE');
      expect(
        (await as(t.admin).get(`/offers/${o}`).expect(200)).body.data.overdue,
      ).toBe(true);

      await expect(job.run()).resolves.toBe(1);
      expect(
        (await as(t.admin).get(`/offers/${o}`).expect(200)).body.data.status,
      ).toBe('expired');
      expect(
        (await as(t.buyer).get(`/listings/${receiptListing}`).expect(200)).body
          .data,
      ).toMatchObject({
        available: 3000,
        unpaidDeals: 0,
      });
    });
  });

  describe('buyer requests', () => {
    let requestId: number;

    it('posts a request that every buyer can see, with matching listings', async () => {
      const res = await as(t.buyer)
        .post('/buyer-requests', {
          produceCode: 'MAIZE',
          quantity: 20000,
          maxUnitPrice: '32',
          validUntil: await day(30),
        })
        .expect(201);
      requestId = res.body.data.id;
      expect(res.body.data).toMatchObject({
        status: 'open',
        maxUnitPrice: '32.00',
        validUntil: await day(30),
        buyer: { id: user.buyer.id, name: 'Demo Buyer' },
      });
      expect(res.body.data.matchingListings).toContainEqual(
        expect.objectContaining({
          id: receiptListing,
          available: 3000,
          askingUnitPrice: '30.00',
          district: 'Bogura',
        }),
      );
      const seen = await as(secondBuyer.token)
        .get('/buyer-requests?produceCode=MAIZE')
        .expect(200);
      expect(seen.body.data.map((r: { id: number }) => r.id)).toContain(
        requestId,
      );
      await as(t.field_officer).get('/buyer-requests').expect(200);
      await as(t.investor).get('/buyer-requests').expect(403);
      const cheap = await as(t.buyer)
        .post('/buyer-requests', {
          produceCode: 'MAIZE',
          quantity: 10,
          maxUnitPrice: '29.99',
          validUntil: await day(5),
        })
        .expect(201);
      expect(
        cheap.body.data.matchingListings.map((l: { id: number }) => l.id),
      ).not.toContain(receiptListing);
    });

    it('is found by produce words or the buyer, and seen by sellers too', async () => {
      const found = async (token: string, q: string) =>
        (
          await as(token)
            .get(`/buyer-requests?q=${encodeURIComponent(q)}`)
            .expect(200)
        ).body.data.map((r: { id: number }) => r.id);
      expect(await found(t.buyer, 'maize')).toContain(requestId);
      expect(await found(t.buyer, 'Demo Buyer')).toContain(requestId);
      expect(await found(t.buyer, 'Second Buyer')).not.toContain(requestId);
      expect(await found(t.seller, 'maize')).toContain(requestId);
    });

    it('is cancelled only by its own buyer', async () => {
      await as(secondBuyer.token)
        .post(`/buyer-requests/${requestId}/cancel`)
        .expect(404);
      const res = await as(t.buyer)
        .post(`/buyer-requests/${requestId}/cancel`)
        .expect(200);
      expect(res.body.data).toMatchObject({
        status: 'cancelled',
        matchingListings: [],
      });
      const open = await as(t.buyer).get('/buyer-requests').expect(200);
      expect(open.body.data.map((r: { id: number }) => r.id)).not.toContain(
        requestId,
      );
      await as(t.buyer)
        .post('/buyer-requests', {
          produceCode: 'MAIZE',
          quantity: 1,
          maxUnitPrice: '1',
          validUntil: await day(-1),
        })
        .expect(422);
    });
  });

  describe('outside sellers', () => {
    let sellerListing: number;
    let sellerDeal: number;
    const ids = (res: { body: { data: { id: number }[] } }) =>
      res.body.data.map((x) => x.id);

    it("lists a seller's own produce, hidden until an admin approves it", async () => {
      const photo = await http
        .post('/api/photos')
        .auth(t.seller, { type: 'bearer' })
        .attach('file', jpeg(`potato-${RUN}`), 'potato.jpg')
        .expect(201);
      const res = await as(t.seller)
        .post('/listings/external', {
          produceCode: 'POTATO',
          quantity: 1200,
          askingUnitPrice: '25.00',
          districtCode: 'MUNSHIGANJ',
          description: 'Diamond variety, sorted and bagged',
          photoIds: [photo.body.data.id],
        })
        .expect(201);
      sellerListing = res.body.data.id;
      expect(res.body.data).toMatchObject({
        status: 'pending',
        source: 'seller',
        project: null,
        seller: { kind: 'seller', id: user.seller.id, name: 'Demo Seller' },
        district: { code: 'MUNSHIGANJ', name: 'Munshiganj' },
        description: 'Diamond variety, sorted and bagged',
      });
      expect(res.body.data.photos).toEqual([
        `/api/listings/${sellerListing}/photos/0`,
      ]);

      // Not for buyers yet.
      await as(t.buyer).get(`/listings/${sellerListing}`).expect(404);
      expect(
        ids(await as(t.buyer).get('/listings?status=pending').expect(200)),
      ).toEqual([]);
      await as(t.buyer)
        .post(`/listings/${sellerListing}/offers`, {
          quantity: 1,
          unitPrice: '1.00',
        })
        .expect(409);
      expect(
        ids(await as(t.admin).get('/listings?status=pending').expect(200)),
      ).toContain(sellerListing);
      expect(
        ids(await as(t.seller).get('/listings?mine=true').expect(200)),
      ).toContain(sellerListing);
      await http
        .get(`/api/listings/${sellerListing}/photos/0`)
        .auth(t.seller, { type: 'bearer' })
        .expect(200);

      await as(t.buyer).post(`/listings/${sellerListing}/approve`).expect(403);
      const live = await as(t.admin)
        .post(`/listings/${sellerListing}/approve`)
        .expect(200);
      expect(live.body.data.status).toBe('open');
      for (const q of ['Demo Seller', 'potato']) {
        expect(
          ids(
            await as(t.buyer)
              .get(`/listings?q=${encodeURIComponent(q)}`)
              .expect(200),
          ),
        ).toContain(sellerListing);
      }
      expect(
        ids(await as(t.buyer).get('/listings?source=seller').expect(200)),
      ).toContain(sellerListing);
    });

    it('turns a listing down with a reason the seller sees', async () => {
      const photo = await http
        .post('/api/photos')
        .auth(t.seller, { type: 'bearer' })
        .attach('file', jpeg(`onion-${RUN}`), 'onion.jpg')
        .expect(201);
      const res = await as(t.seller)
        .post('/listings/external', {
          produceCode: 'ONION',
          quantity: 300,
          askingUnitPrice: '60.00',
          districtCode: 'PABNA',
          photoIds: [photo.body.data.id],
        })
        .expect(201);
      const turned = await as(t.admin)
        .post(`/listings/${res.body.data.id}/reject`, {
          reason: 'The photo does not show the onions',
        })
        .expect(200);
      expect(turned.body.data).toMatchObject({
        status: 'rejected',
        rejectReason: 'The photo does not show the onions',
      });
      const seen = await as(t.seller)
        .get(`/listings/${res.body.data.id}`)
        .expect(200);
      expect(seen.body.data.rejectReason).toBe(
        'The photo does not show the onions',
      );
    });

    it('lets only the seller decide, fixes the fees, and pays the seller after delivery', async () => {
      // 1,000 kg at Tk 25 = Tk 25,000: Tk 75 a side.
      sellerDeal = (
        await as(t.buyer)
          .post(`/listings/${sellerListing}/offers`, {
            quantity: 1000,
            unitPrice: '25.00',
          })
          .expect(201)
      ).body.data.id;
      const notAdmin = await as(t.admin)
        .post(`/offers/${sellerDeal}/approve`)
        .expect(403);
      expect(notAdmin.body.code).toBe('OFFER_DECIDE_NOT_ALLOWED');
      const approved = await as(t.seller)
        .post(`/offers/${sellerDeal}/approve`)
        .expect(200);
      expect(approved.body.data).toMatchObject({
        status: 'approved',
        external: true,
        seller: { kind: 'seller', id: user.seller.id },
        amount: '25000.00',
        buyerFee: '75.00',
        sellerFee: '75.00',
        buyerPays: '25075.00',
        sellerReceives: '24925.00',
      });

      await as(t.accounts)
        .post(`/offers/${sellerDeal}/payment`, {
          paymentReference: `SELLER-DEAL-${RUN}`,
        })
        .expect(200);
      await as(t.seller)
        .post(`/offers/${sellerDeal}/delivery`, { quantity: 1000 })
        .expect(200);
      const done = await as(t.buyer)
        .post(`/offers/${sellerDeal}/delivery`, { quantity: 1000 })
        .expect(200);
      expect(done.body.data.status).toBe('delivered');
      expect(
        ids(await as(t.accounts).get('/offers?payoutDue=true').expect(200)),
      ).toContain(sellerDeal);

      await as(t.buyer)
        .post(`/offers/${sellerDeal}/seller-payout`, {
          paymentReference: `PAYOUT-${RUN}`,
        })
        .expect(403);
      const paid = await as(t.accounts)
        .post(`/offers/${sellerDeal}/seller-payout`, {
          paymentReference: `PAYOUT-${RUN}`,
        })
        .expect(200);
      expect(paid.body.data).toMatchObject({
        status: 'seller_paid',
        sellerPayoutReference: `PAYOUT-${RUN}`,
      });
      const sellerView = await as(t.seller)
        .get(`/offers/${sellerDeal}`)
        .expect(200);
      expect(sellerView.body.data.sellerPayoutReference).toBeUndefined();
      expect(ids(await as(t.seller).get('/offers').expect(200))).toEqual([
        sellerDeal,
      ]);
    });

    it("charges only the buyer on WeGro's own listings", async () => {
      const own = (await as(t.accounts).get(`/offers/${deal}`).expect(200)).body
        .data;
      expect(own.external).toBe(false);
      expect(own.sellerFee).toBe('0.00');
      expect(Number(own.buyerFee)).toBeGreaterThan(0);
      expect(own.sellerReceives).toBeNull();
      const notThis = await as(t.accounts)
        .post(`/offers/${deal}/seller-payout`, {
          paymentReference: `NOT-EXTERNAL-${RUN}`,
        })
        .expect(409);
      expect(['NOT_EXTERNAL_DEAL', 'OFFER_WRONG_STATUS']).toContain(
        notThis.body.code,
      );
    });

    it('lets only the super admin change the fee slabs', async () => {
      const start = (await as(t.buyer).get('/marketplace/fees').expect(200))
        .body.data;
      expect(start.slabs).toEqual([
        { upTo: '5000.00', fee: '20.00' },
        { upTo: '25000.00', fee: '75.00' },
        { upTo: '100000.00', fee: '250.00' },
        { upTo: '500000.00', fee: '750.00' },
        { upTo: null, fee: '1500.00' },
      ]);
      const next = [
        { upTo: '10000.00', fee: '30.00' },
        { upTo: null, fee: '300.00' },
      ];
      await as(t.admin).put('/marketplace/fees', { slabs: next }).expect(403);
      const bad = await as(t.super_admin)
        .put('/marketplace/fees', {
          slabs: [
            { upTo: '10000.00', fee: '30.00' },
            { upTo: '5000.00', fee: '20.00' },
            { upTo: null, fee: '300.00' },
          ],
        })
        .expect(422);
      expect(bad.body.code).toBe('FEE_SLABS_INVALID');
      const set = await as(t.super_admin)
        .put('/marketplace/fees', { slabs: next })
        .expect(200);
      expect(set.body.data.slabs).toEqual(next);
      await as(t.super_admin)
        .put('/marketplace/fees', { slabs: start.slabs })
        .expect(200);
    });
  });

  describe('integrity', () => {
    it('agrees with the ledger on every record', async () => {
      expect(await ledgerDisagreements(chain)).toEqual([]);
    });

    it('rebuilds identical listings, offers, deliveries and requests from the ledger', async () => {
      const snapshot = async () => ({
        listings: await db.query(
          'SELECT id, status, available, unpaid_deals, details_id, decided_at FROM listings ORDER BY id',
        ),
        offers: await db.query(
          'SELECT id, status, payment_due_at, payment_ref_hash, receipt_part_id, buyer_fee, seller_fee, seller_payout_ref_hash, seller_paid_at FROM offers ORDER BY id',
        ),
        deliveries: await db.query(
          'SELECT offer_id, side, quantity, status FROM deliveries ORDER BY offer_id, side',
        ),
        requests: await db.query(
          'SELECT id, status FROM buyer_requests ORDER BY id',
        ),
        receipts: await db.query(
          'SELECT id, status, quantity FROM warehouse_receipts ORDER BY id',
        ),
      });
      const indexer = chain.app.get(EventIndexerService);
      await indexer.catchUp();
      const before = await snapshot();
      await indexer.reindex();
      await indexer.catchUp();
      expect(await snapshot()).toEqual(before);
    });

    it('refuses impossible listing balances at the database level', async () => {
      await expect(
        db.query('UPDATE listings SET available = quantity + 1 WHERE id = $1', [
          receiptListing,
        ]),
      ).rejects.toThrow(/ck_listings_amounts/);
    });
  });
});
