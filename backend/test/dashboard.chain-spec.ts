/** The staff dashboard end to end, against the local chain and a throwaway schema. */
import { randomBytes, randomInt } from 'node:crypto';
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
import { travel as chainTravel } from './support/chain-time';

const RUN = randomBytes(4).toString('hex').toUpperCase();

interface Queue {
  key: string;
  count: number;
  urgent?: Record<string, number>;
  oldest: Array<{
    id: string;
    title: string;
    person: { id: string; name: string } | null;
    project: { id: string; name: string } | null;
  }>;
}

describe('Dashboard (node + database)', () => {
  let chain: ChainApp;
  let http: ReturnType<typeof request>;
  let db: DataSource;
  const t: Record<string, string> = {};
  const user: Record<string, User> = {};
  let funding: string;
  let tomato: string;
  let maize: string;
  let newcomer: { id: string; token: string };
  let pendingReservation: number;
  let pendingOffer: number;
  let deal: number;
  let receipt: string;

  const as = (token: string) => ({
    get: (path: string) =>
      http.get(`/api${path}`).auth(token, { type: 'bearer' }),
    post: (path: string, body: object = {}) =>
      http.post(`/api${path}`).auth(token, { type: 'bearer' }).send(body),
    put: (path: string, body: object) =>
      http.put(`/api${path}`).auth(token, { type: 'bearer' }).send(body),
  });
  const dashboard = async (token: string) =>
    (await as(token).get('/dashboard').expect(200)).body.data;
  const queue = (d: { queues: Queue[] }, key: string) =>
    d.queues.find((q) => q.key === key)!;

  async function day(offset = 0): Promise<string> {
    const now = await chain.app.get(ChainClock).now();
    return bdDate(new Date(now.getTime() + offset * 86_400_000));
  }

  async function travel(seconds: number) {
    return chainTravel(chain.app, seconds);
  }

  async function project(name: string, produceCode: string) {
    const id = (
      await as(t.admin)
        .post('/projects', {
          title: `${name} ${RUN}`,
          produceCode,
          districtCode: 'BOGURA',
          location: 'Shibganj',
          farmerId: user.farmer.id,
          durationType: 'short_term',
          durationMonths: 5,
          fundingTarget: '50000',
          slotPrice: '10000',
          estimatedReturnMinBps: 0,
          estimatedReturnMaxBps: 1000,
        })
        .expect(201)
    ).body.data.id as string;
    await as(t.admin).post(`/projects/${id}/publish`).expect(200);
    return id;
  }

  async function reserve(projectId: string, slots: number, pay: boolean) {
    const r = await as(t.investor)
      .post(`/projects/${projectId}/reservations`, { slots })
      .expect(201);
    if (pay) {
      await as(t.accounts)
        .post(`/reservations/${r.body.data.id}/confirm`, {
          paymentReference: `DSH-${r.body.data.id}-${RUN}`,
        })
        .expect(200);
    }
    return r.body.data.id as number;
  }

  async function active(name: string, produceCode: string) {
    const id = await project(name, produceCode);
    await reserve(id, 5, true);
    await as(t.admin).post(`/projects/${id}/activate`).expect(200);
    return id;
  }

  beforeAll(async () => {
    chain = await startChainApp({ DEMO_MODE: 'true' });
    http = request(chain.app.getHttpServer());
    db = chain.app.get(DataSource);
    await waitForDemoAccounts(chain);
    for (const r of [
      Role.SUPER_ADMIN,
      Role.ADMIN,
      Role.OPERATIONS,
      Role.ACCOUNTS,
      Role.AUDITOR,
      Role.INVESTOR,
      Role.FARMER,
      Role.FIELD_OFFICER,
      Role.BUYER,
      Role.WAREHOUSE,
    ]) {
      t[r] = await demoToken(http, r);
      user[r] = await db
        .getRepository(User)
        .findOneByOrFail({ role: r, isDemo: true });
    }

    // A registration left unverified.
    const reg = await as(t.admin)
      .post('/participants', {
        role: 'buyer',
        fullName: 'Waiting Buyer',
        phone: `0198${String(randomInt(1e6, 1e7))}`,
        nid: `${randomInt(2, 9)}${randomInt(1e8, 1e9)}`,
        dateOfBirth: '1988-08-08',
        district: 'DHAKA',
        address: 'Made-up address, Dhaka',
      })
      .expect(201);
    newcomer = { id: reg.body.data.participant.id, token: '' };

    // Bank details waiting for an admin.
    await as(t.investor)
      .put('/me/bank-account', {
        holderName: 'Demo Investor',
        bankName: 'Sonali Bank PLC',
        branchName: 'Motijheel',
        accountNumber: String(randomInt(1e9, 1e10)),
        routingNumber: '200100123',
      })
      .expect(200);

    // Funding: 2 of 5 slots paid, 1 more reserved and unpaid.
    funding = await project('Funding maize', 'MAIZE');
    await reserve(funding, 2, true);
    pendingReservation = await reserve(funding, 1, false);

    // Active fresh produce with a pending offer and an unpaid deal.
    tomato = await active('Active tomatoes', 'TOMATO');
    const listing = (
      await as(t.field_officer)
        .post('/listings/produce', {
          projectId: tomato,
          quantity: 1000,
          askingUnitPrice: '42',
        })
        .expect(201)
    ).body.data.id;
    pendingOffer = (
      await as(t.buyer)
        .post(`/listings/${listing}/offers`, { quantity: 100, unitPrice: '40' })
        .expect(201)
    ).body.data.id;
    deal = (
      await as(t.buyer)
        .post(`/listings/${listing}/offers`, { quantity: 200, unitPrice: '41' })
        .expect(201)
    ).body.data.id;
    await as(t.admin).post(`/offers/${deal}/approve`).expect(200);

    // A stored-crop receipt offered to WeGro for buy-back.
    maize = await active('Stored maize', 'MAIZE');
    const site = await as(t.admin)
      .post('/warehouse-sites', {
        name: `Dash Hub ${RUN}`,
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
    receipt = (
      await as(t.warehouse)
        .post('/warehouse-receipts', {
          projectId: maize,
          quantity: 3000,
          intakeDate: await day(),
          expiresOn: await day(180),
        })
        .expect(201)
    ).body.data.id;
    await as(t.field_officer)
      .post(`/warehouse-receipts/${receipt}/handover`)
      .expect(200);
  });

  afterAll(async () => {
    await chain?.close();
  });

  it('shows funding progress and active projects', async () => {
    const d = await dashboard(t.admin);
    expect(d.stages).toMatchObject({ open_for_funding: 1, active: 2 });
    expect(d.funding).toMatchObject({
      openProjects: 1,
      target: '50000.00',
      raised: '20000.00',
      percentFunded: '40.0',
    });
    expect(d.funding.projects[0]).toMatchObject({
      project: { id: funding },
      farmer: { id: user.farmer.id, name: 'Demo Farmer' },
      totalSlots: 5,
      issuedSlots: 2,
      reservedSlots: 1,
      pendingReservations: 1,
      percentFunded: '40.0',
    });
    expect(d.active.count).toBe(2);
    const tomatoRow = d.active.projects.find(
      (p: { project: { id: string } }) => p.project.id === tomato,
    );
    expect(tomatoRow).toMatchObject({
      raised: '50000.00',
      startedOn: await day(),
      overdue: false,
      openListings: 1,
      openClaims: 0,
    });
  });

  it('lists every queue the admin acts on, oldest first, with names', async () => {
    const d = await dashboard(t.admin);
    expect(d.queues).toHaveLength(14);
    const people = queue(d, 'participants.pending');
    expect(people.count).toBe(1);
    expect(people.oldest[0]).toMatchObject({
      id: newcomer.id,
      person: { id: newcomer.id, name: 'Waiting Buyer' },
    });
    expect(queue(d, 'bank-accounts.pending').oldest[0].person).toMatchObject({
      id: user.investor.id,
    });
    expect(queue(d, 'reservations.pending')).toMatchObject({
      count: 1,
      urgent: { expiringSoon: 0 },
      oldest: [{ id: String(pendingReservation), project: { id: funding } }],
    });
    expect(queue(d, 'offers.pending').oldest[0]).toMatchObject({
      id: String(pendingOffer),
      person: { id: user.buyer.id },
      project: { id: tomato },
    });
    expect(queue(d, 'deals.awaiting-payment')).toMatchObject({
      count: 1,
      urgent: { overdue: 0 },
      oldest: [{ id: String(deal) }],
    });
    expect(queue(d, 'handovers.pending')).toMatchObject({
      count: 1,
      oldest: [{ id: receipt, project: { id: maize } }],
    });
    for (const key of [
      'vouchers.proposed',
      'voucher-sales.pending',
      'vouchers.inactive',
      'deliveries.discrepancy',
      'rounds.awaiting-approval',
      'rounds.unpaid',
      'projects.ready-for-settlement',
      'claims.open',
    ]) {
      expect(queue(d, key)).toMatchObject({ count: 0, oldest: [] });
    }
  });

  it('tailors the queues to each role', async () => {
    const keys = async (token: string) =>
      (await dashboard(token)).queues.map((q: Queue) => q.key);
    expect(await keys(t.accounts)).toEqual([
      'reservations.pending',
      'vouchers.proposed',
      'deals.awaiting-payment',
      'rounds.awaiting-approval',
      'rounds.unpaid',
      'projects.ready-for-settlement',
    ]);
    expect(await keys(t.operations)).toEqual([
      'vouchers.proposed',
      'voucher-sales.pending',
      'vouchers.inactive',
    ]);
    expect(await keys(t.auditor)).toHaveLength(14);
    expect(await keys(t.super_admin)).toHaveLength(14);
    for (const token of [t.farmer, t.investor, t.field_officer, t.buyer]) {
      await as(token).get('/dashboard').expect(403);
    }
  });

  it('gives all-time figures and twelve months of trends', async () => {
    const d = await dashboard(t.super_admin);
    expect(d.figures).toMatchObject({
      fundingRaised: '120000.00',
      salesIncome: '0.00',
      payoutsPaid: '0.00',
    });
    expect(d.figures.participants.farmer).toBeGreaterThan(0);
    expect(d.trends.months).toHaveLength(12);
    expect(d.trends.months[11]).toBe((await day()).slice(0, 7));
    expect(d.trends.fundingRaised[11]).toBe('120000.00');
    expect(d.trends.projectsStarted[11]).toBe(2);
    expect(Date.parse(d.figuresAsOf)).toBeLessThanOrEqual(Date.parse(d.asOf));
  });

  it('flags what becomes urgent by the ledger clock', async () => {
    // Reservations hold for 120 h, deals for 7 days.
    await travel(100 * 3600);
    let d = await dashboard(t.accounts);
    expect(queue(d, 'reservations.pending').urgent).toEqual({
      expiringSoon: 1,
    });
    expect(queue(d, 'deals.awaiting-payment').urgent).toEqual({ overdue: 0 });
    await travel(3 * 86_400);
    d = await dashboard(t.accounts);
    expect(queue(d, 'deals.awaiting-payment').urgent).toEqual({ overdue: 1 });
  });
});
