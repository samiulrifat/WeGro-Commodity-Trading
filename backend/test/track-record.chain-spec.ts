/** Track records and bank permission end to end, against the local chain and a throwaway schema. */
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ChainClock } from '../src/blockchain/chain-clock';
import { ContractsRegistry } from '../src/blockchain/contracts.registry';
import { EventIndexerService } from '../src/blockchain/indexer/event-indexer.service';
import { uuidToBytes32 } from '../src/blockchain/utils/ids';
import { bdDate } from '../src/common/time/bd-dates';
import { BACKFILL_STAGE_DATES } from '../src/database/migrations/1791873366982-TrackRecord';
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

interface Outcome {
  id: string;
  money: Record<string, string | null>;
  harvest: Record<string, string | null>;
  onTime: boolean | null;
  durationMonths: number;
}

describe('Track record and bank permission (node + database)', () => {
  let chain: ChainApp;
  let http: ReturnType<typeof request>;
  let db: DataSource;
  const t: Record<string, string> = {};
  const user: Record<string, User> = {};
  let accounts2: string;
  let project: string;
  let bankA: string;
  let bankB: string;
  let version: number;
  let firstGrant: string;

  const as = (token: string) => ({
    get: (path: string) =>
      http.get(`/api${path}`).auth(token, { type: 'bearer' }),
    post: (path: string, body: object = {}) =>
      http.post(`/api${path}`).auth(token, { type: 'bearer' }).send(body),
    put: (path: string, body: object) =>
      http.put(`/api${path}`).auth(token, { type: 'bearer' }).send(body),
  });
  const consent = () => chain.app.get(ContractsRegistry).get('ConsentRegistry');
  const farmerPath = () => `/farmers/${user.farmer.id}`;

  async function day(offset = 0): Promise<string> {
    const now = await chain.app.get(ChainClock).now();
    return bdDate(new Date(now.getTime() + offset * DAY * 1000));
  }

  async function upload(token: string, label: string): Promise<string> {
    const res = await http
      .post('/api/photos')
      .auth(token, { type: 'bearer' })
      .attach('file', jpeg(`${label}-${RUN}`), `${label}.jpg`)
      .expect(201);
    return res.body.data.id;
  }

  async function travel(seconds: number) {
    return chainTravel(chain.app, seconds);
  }

  async function registerAccounts(): Promise<string> {
    const phone = `0196${String(randomInt(1e6, 1e7))}`;
    const reg = await as(t.super_admin)
      .post('/participants', {
        role: Role.Accounts,
        fullName: 'Second Accounts',
        phone,
        nid: `${randomInt(2, 9)}${randomInt(1e8, 1e9)}`,
        dateOfBirth: '1986-06-06',
        district: 'DHAKA',
        address: 'Made-up address, Dhaka',
      })
      .expect(201);
    await as(t.super_admin)
      .post(`/participants/${reg.body.data.participant.id}/verify`)
      .expect(200);
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
      Role.Bank,
      Role.Auditor,
    ]) {
      t[r] = await demoToken(http, r);
      user[r] = await db
        .getRepository(User)
        .findOneByOrFail({ role: r, isDemo: true });
    }
    accounts2 = await registerAccounts();

    // A tomato project of the demo farmer, taken all the way to paid out.
    project = (
      await as(t.admin)
        .post('/projects', {
          title: `Finished tomatoes ${RUN}`,
          produceCode: 'TOMATO',
          districtCode: 'BOGURA',
          location: 'Shibganj',
          farmerId: user.farmer.id,
          durationType: 'short_term',
          durationMonths: 5,
          fundingTarget: '50000',
          slotPrice: '10000',
          estimatedReturnMinBps: 0,
          estimatedReturnMaxBps: 1500,
        })
        .expect(201)
    ).body.data.id;
    await as(t.admin).post(`/projects/${project}/publish`).expect(200);
    const r = await as(t.investor)
      .post(`/projects/${project}/reservations`, { slots: 5 })
      .expect(201);
    await as(t.accounts)
      .post(`/reservations/${r.body.data.id}/confirm`, {
        paymentReference: `T-RES-${RUN}`,
      })
      .expect(200);
    await as(t.admin).post(`/projects/${project}/activate`).expect(200);

    // 950 kg harvested, 900 kg sold at 40.00 = 36000.00.
    const now = await chain.app.get(ChainClock).now();
    await as(t.field_officer)
      .post('/field-records/sync', {
        records: [
          {
            id: randomUUID(),
            projectId: project,
            entryTypeCode: 'HARVEST',
            notes: 'Picked and crated',
            measurements: { quantity: 950 },
            latitude: '24.846512',
            longitude: '89.377621',
            accuracyMeters: 8,
            photoId: await upload(t.field_officer, 'harvest'),
            observedAt: new Date(now.getTime() - 60_000).toISOString(),
          },
        ],
      })
      .expect(200);
    const listing = (
      await as(t.field_officer)
        .post('/listings/produce', {
          projectId: project,
          quantity: 900,
          askingUnitPrice: '42',
        })
        .expect(201)
    ).body.data.id;
    const offer = (
      await as(t.buyer)
        .post(`/listings/${listing}/offers`, { quantity: 900, unitPrice: '40' })
        .expect(201)
    ).body.data.id;
    await as(t.admin).post(`/offers/${offer}/approve`).expect(200);
    await as(t.accounts)
      .post(`/offers/${offer}/payment`, { paymentReference: `T-SALE-${RUN}` })
      .expect(200);
    for (const token of [t.buyer, t.field_officer]) {
      await as(token)
        .post(`/offers/${offer}/delivery`, { quantity: 900 })
        .expect(200);
    }
    await as(t.accounts)
      .post(`/settlement/projects/${project}/costs`, {
        category: 'transport',
        amount: '1000',
        incurredOn: await day(),
        note: 'Crates to market',
      })
      .expect(201);
    await as(t.admin).post(`/projects/${project}/ready-for-sale`).expect(200);
    const round = (
      await as(t.accounts)
        .post(`/settlement/projects/${project}/rounds`, { final: true })
        .expect(201)
    ).body.data;
    await as(accounts2)
      .post(`/settlement/rounds/${round.id}/approve`)
      .expect(200);
    for (const [i, line] of round.lines.entries()) {
      await as(t.accounts)
        .post(`/settlement/rounds/${round.id}/payments`, {
          payeeId: line.payee.id,
          paymentReference: `T-PAY-${i}-${RUN}`,
        })
        .expect(200);
    }
  });

  afterAll(async () => {
    await chain?.close();
  });

  describe('banks', () => {
    it('are registered by an admin, fingerprinted on the ledger', async () => {
      const res = await as(t.admin)
        .post('/banks', {
          name: `Krishi Bank ${RUN}`,
          branchName: 'Bogura Branch',
          districtCode: 'BOGURA',
          address: 'Satmatha, Bogura',
        })
        .expect(201);
      bankA = res.body.data.id;
      expect(res.body.data).toMatchObject({
        status: 'registered',
        district: { code: 'BOGURA', name: 'Bogura' },
        officers: [],
      });
      expect(await consent().bankDetails(uuidToBytes32(bankA))).toBe(
        res.body.data.detailsHash,
      );
      const one = await as(t.admin).get(`/banks/${bankA}`).expect(200);
      expect(one.body.data).toEqual(res.body.data);
      await as(t.admin)
        .post('/banks', {
          name: `KRISHI BANK ${RUN}`,
          branchName: 'bogura branch',
          districtCode: 'BOGURA',
          address: 'Elsewhere',
        })
        .expect(409);
      bankB = (
        await as(t.admin)
          .post('/banks', {
            name: `City Agro ${RUN}`,
            branchName: 'Bogura Branch',
            districtCode: 'BOGURA',
            address: 'Jaleshwaritala, Bogura',
          })
          .expect(201)
      ).body.data.id;
      await as(t.field_officer).post('/banks', {}).expect(403);
    });

    it('get officers, who then see their bank', async () => {
      await as(t.bank).get('/bank/me').expect(200);
      await as(t.admin)
        .put(`/bank-officers/${user.buyer.id}`, { bankId: bankA })
        .expect(422);
      const res = await as(t.admin)
        .put(`/bank-officers/${user.bank.id}`, { bankId: bankA })
        .expect(200);
      expect(res.body.data.officers).toEqual([
        { id: user.bank.id, name: expect.any(String) },
      ]);
      const me = await as(t.bank).get('/bank/me').expect(200);
      expect(me.body.data.bank).toMatchObject({ id: bankA });
      expect(me.body.data.bank.officers).toBeUndefined();
      const list = await as(t.field_officer)
        .get('/banks?districtCode=BOGURA')
        .expect(200);
      expect(list.body.data.map((b: { id: string }) => b.id)).toEqual(
        expect.arrayContaining([bankA, bankB]),
      );
      await as(t.buyer).get('/banks').expect(403);
    });
  });

  describe('track record', () => {
    it("is built from the farmer's finished projects", async () => {
      // Nothing imported from WeGro's records for this farmer.
      const imported = await as(t.field_officer)
        .get(`${farmerPath()}/history`)
        .expect(200);
      expect(imported.body.data).toEqual([]);
      const res = await as(t.field_officer)
        .get(`${farmerPath()}/track-record/preview`)
        .expect(200);
      const { summary } = res.body.data;
      expect(summary.farmer).toMatchObject({
        id: user.farmer.id,
        district: { code: expect.any(String) },
      });
      const mine: Outcome = summary.projects.find(
        (p: Outcome) => p.id === project,
      );
      expect(mine).toMatchObject({
        durationMonths: 5,
        onTime: true,
        money: {
          fundingRaised: '50000.00',
          income: '36000.00',
          sales: '36000.00',
          insurance: '0.00',
          costs: '1000.00',
          inputs: '0.00',
          otherCosts: '1000.00',
          net: '35000.00',
          farmerReceived: '14000.00',
          investorReturnPercent: '28.00',
        },
        harvest: { harvested: '950', sold: '900', unit: 'kg' },
        risk: { claimsApproved: 0, claimsRejected: 0, events: [] },
      });
      // In the ledger's order, ascending.
      const ids = summary.projects.map((p: Outcome) => p.id);
      expect([...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))).toEqual(
        ids,
      );
      expect(summary.totals.projects).toBe(ids.length);
      await as(t.farmer)
        .get(`${farmerPath()}/track-record/preview`)
        .expect(200);
      await as(t.buyer).get(`${farmerPath()}/track-record/preview`).expect(403);
    });

    it("is published by the farmer's officer, its hash on the ledger", async () => {
      await as(t.admin).post(`${farmerPath()}/track-records`).expect(403);
      const res = await as(t.field_officer)
        .post(`${farmerPath()}/track-records`)
        .expect(201);
      version = res.body.data.version;
      expect(res.body.data).toMatchObject({
        verified: true,
        publishedBy: { id: user.field_officer.id },
      });
      const key = uuidToBytes32(user.farmer.id);
      expect((await consent().getTrackRecord(key, version)).summaryHash).toBe(
        res.body.data.summaryHash,
      );
      expect(await consent().getTrackRecordProjects(key, version)).toContain(
        uuidToBytes32(project),
      );
      const again = await as(t.field_officer)
        .post(`${farmerPath()}/track-records`)
        .expect(409);
      expect(again.body.code).toBe('UNCHANGED');
      const versions = await as(t.farmer)
        .get(`${farmerPath()}/track-records`)
        .expect(200);
      expect(versions.body.data[0]).toMatchObject({ version });
      await as(t.auditor)
        .get(`${farmerPath()}/track-records/${version}`)
        .expect(200);
    });
  });

  describe('bank permission', () => {
    it('is needed before a bank can look', async () => {
      const res = await as(t.bank)
        .post(`/bank/farmers/${user.farmer.id}/track-record/view`)
        .expect(403);
      expect(res.body.code).toBe('NO_ACTIVE_CONSENT');
    });

    it('needs the signed form, and lasts at most a year', async () => {
      const form = await upload(t.field_officer, 'consent-form');
      const grant = (body: object, token = t.field_officer) =>
        as(token).post(`${farmerPath()}/consents`, {
          bankId: bankA,
          evidencePhotoId: form,
          ...body,
        });
      const late = await grant({ expiresOn: await day(366) }).expect(422);
      expect(late.body.code).toBe('EXPIRY_TOO_LATE');
      await grant({ expiresOn: await day(-1) }).expect(422);
      await grant({
        expiresOn: await day(30),
        evidencePhotoId: await upload(t.buyer, 'not-yours'),
      }).expect(422);
      await grant({ expiresOn: await day(30) }, t.farmer).expect(403);

      const res = await grant({ expiresOn: await day(180) }).expect(201);
      firstGrant = res.body.data.id;
      expect(res.body.data).toMatchObject({
        bank: { id: bankA },
        status: 'active',
        current: true,
        expiresOn: await day(180),
        grantedBy: { id: user.field_officer.id },
        views: 0,
      });
      const onChain = await consent().getConsent(
        uuidToBytes32(user.farmer.id),
        uuidToBytes32(bankA),
      );
      expect(onChain.evidenceHash).toBe(res.body.data.evidenceHash);
    });

    it('covers only the bank it was given to', async () => {
      const form = await upload(t.field_officer, 'consent-form-b');
      await as(t.field_officer)
        .post(`${farmerPath()}/consents`, {
          bankId: bankB,
          evidencePhotoId: form,
          expiresOn: await day(90),
        })
        .expect(201);
      await as(t.admin)
        .put(`/bank-officers/${user.bank.id}`, { bankId: null })
        .expect(200);
      const loose = await as(t.bank)
        .post(`/bank/farmers/${user.farmer.id}/track-record/view`)
        .expect(403);
      expect(loose.body.code).toBe('NOT_ASSIGNED_TO_BANK');
      await as(t.admin)
        .put(`/bank-officers/${user.bank.id}`, { bankId: bankA })
        .expect(200);
    });

    it('lets the bank view the latest record, checked and logged on the ledger', async () => {
      const list = await as(t.bank).get('/bank/farmers').expect(200);
      expect(
        list.body.data.find(
          (f: { farmer: { id: string } }) => f.farmer.id === user.farmer.id,
        ),
      ).toMatchObject({ latestVersion: version, expiresOn: await day(180) });

      const res = await as(t.bank)
        .post(`/bank/farmers/${user.farmer.id}/track-record/view`)
        .expect(200);
      expect(res.body.data).toMatchObject({
        farmer: { id: user.farmer.id },
        version,
        verified: true,
      });
      expect(
        res.body.data.summary.projects.map((p: Outcome) => p.id),
      ).toContain(project);

      const log = await as(t.farmer)
        .get(`${farmerPath()}/consents/views`)
        .expect(200);
      expect(log.body.data[0]).toMatchObject({
        bank: { id: bankA },
        viewer: { id: user.bank.id },
        version,
      });
      const consents = await as(t.field_officer)
        .get(`${farmerPath()}/consents`)
        .expect(200);
      expect(
        consents.body.data.find((c: { id: string }) => c.id === firstGrant),
      ).toMatchObject({ views: 1 });
    });

    it('is renewed by a new grant, keeping the old one as history', async () => {
      const res = await as(t.field_officer)
        .post(`${farmerPath()}/consents`, {
          bankId: bankA,
          evidencePhotoId: await upload(t.field_officer, 'renewal-form'),
          expiresOn: await day(300),
        })
        .expect(201);
      expect(res.body.data).toMatchObject({ status: 'active', current: true });
      const all = await as(t.farmer)
        .get(`${farmerPath()}/consents`)
        .expect(200);
      expect(
        all.body.data.find((c: { id: string }) => c.id === firstGrant),
      ).toMatchObject({ status: 'replaced', current: false });
      await as(t.farmer)
        .get(`/consents/${firstGrant}/evidence-photo`)
        .expect(200);
      await as(t.bank)
        .get(`/consents/${firstGrant}/evidence-photo`)
        .expect(403);
    });

    it('ends at once when the farmer withdraws it', async () => {
      const res = await as(t.field_officer)
        .post(`${farmerPath()}/consents/${bankA}/revoke`)
        .expect(200);
      expect(res.body.data).toMatchObject({
        status: 'revoked',
        current: false,
      });
      await as(t.bank)
        .post(`/bank/farmers/${user.farmer.id}/track-record/view`)
        .expect(403);
      const again = await as(t.field_officer)
        .post(`${farmerPath()}/consents/${bankA}/revoke`)
        .expect(409);
      expect(again.body.code).toBe('NO_CONSENT_TO_WITHDRAW');
      const list = await as(t.bank).get('/bank/farmers').expect(200);
      expect(
        list.body.data.map((f: { farmer: { id: string } }) => f.farmer.id),
      ).not.toContain(user.farmer.id);
    });

    it('ends by itself after its last day', async () => {
      await as(t.field_officer)
        .post(`${farmerPath()}/consents`, {
          bankId: bankA,
          evidencePhotoId: await upload(t.field_officer, 'short-form'),
          expiresOn: await day(),
        })
        .expect(201);
      await as(t.bank)
        .post(`/bank/farmers/${user.farmer.id}/track-record/view`)
        .expect(200);
      await travel(DAY + 60);
      await as(t.bank)
        .post(`/bank/farmers/${user.farmer.id}/track-record/view`)
        .expect(403);
    });
  });

  describe('integrity', () => {
    it('agrees with the ledger on every record', async () => {
      expect(await ledgerDisagreements(chain)).toEqual([]);
    });

    it('rebuilds identical banks, records, consents and the view log from the ledger', async () => {
      const snapshot = async () => ({
        banks: await db.query('SELECT id, status FROM banks ORDER BY id'),
        officers: await db.query(
          'SELECT officer_id, bank_id FROM bank_officers ORDER BY officer_id',
        ),
        records: await db.query(
          'SELECT id, version, status, published_at FROM track_records ORDER BY id',
        ),
        consents: await db.query(
          'SELECT id, status, granted_at, revoked_at FROM bank_consents ORDER BY id',
        ),
        views: await db.query(
          'SELECT block_number, log_index, viewer_id, version FROM summary_views ORDER BY 1, 2',
        ),
      });
      const indexer = chain.app.get(EventIndexerService);
      await indexer.catchUp();
      const before = await snapshot();
      await indexer.reindex();
      await indexer.catchUp();
      expect(await snapshot()).toEqual(before);
    });

    it('backfills the stage dates of existing projects from the indexed events', async () => {
      await chain.app.get(EventIndexerService).catchUp();
      const dates = () =>
        db.query(
          'SELECT activated_at, finished_at FROM projects WHERE id = $1',
          [project],
        );
      const [before] = await dates();
      expect(before.activated_at).not.toBeNull();
      expect(before.finished_at).not.toBeNull();
      await db.query(
        'UPDATE projects SET activated_at = NULL, finished_at = NULL WHERE id = $1',
        [project],
      );
      await db.query(BACKFILL_STAGE_DATES);
      expect((await dates())[0]).toEqual(before);
    });

    it('refuses a recorded version without a number at the database level', async () => {
      await expect(
        db.query(
          `UPDATE track_records SET version = NULL WHERE farmer_id = $1 AND version = $2`,
          [user.farmer.id, version],
        ),
      ).rejects.toThrow(/ck_track_records_version/);
    });
  });
});
