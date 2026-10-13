/** Crop insurance end to end, against the local chain and a throwaway schema. */
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

describe('Insurance (node + database)', () => {
  let chain: ChainApp;
  let http: ReturnType<typeof request>;
  let db: DataSource;
  const t: Record<string, string> = {};
  const user: Record<string, User> = {};
  let otherInsurer: string;
  let insured: string;
  let uninsured: string;
  const event: Record<string, string> = {};
  let floodClaim: string;
  let cycloneClaim: string;

  const as = (token: string) => ({
    get: (path: string) =>
      http.get(`/api${path}`).auth(token, { type: 'bearer' }),
    post: (path: string, body: object = {}) =>
      http.post(`/api${path}`).auth(token, { type: 'bearer' }).send(body),
    put: (path: string, body: object) =>
      http.put(`/api${path}`).auth(token, { type: 'bearer' }).send(body),
  });
  const registry = () =>
    chain.app.get(ContractsRegistry).get('InsuranceRegistry');

  async function day(offset = 0): Promise<string> {
    const now = await chain.app.get(ChainClock).now();
    return bdDate(new Date(now.getTime() + offset * 86_400_000));
  }

  async function upload(token: string, label: string): Promise<string> {
    const res = await http
      .post('/api/photos')
      .auth(token, { type: 'bearer' })
      .attach('file', jpeg(`${label}-${RUN}`), `${label}.jpg`)
      .expect(201);
    return res.body.data.id;
  }

  async function activeProject(name: string, insuredFlag: boolean) {
    const id = (
      await as(t.admin)
        .post('/projects', {
          title: `${name} ${RUN}`,
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
          insured: insuredFlag,
        })
        .expect(201)
    ).body.data.id;
    await as(t.admin).post(`/projects/${id}/publish`).expect(200);
    const r = await as(t.investor)
      .post(`/projects/${id}/reservations`, { slots: 5 })
      .expect(201);
    await as(t.accounts)
      .post(`/reservations/${r.body.data.id}/confirm`, {
        paymentReference: `I-${name}-${RUN}`,
      })
      .expect(200);
    await as(t.admin).post(`/projects/${id}/activate`).expect(200);
    return id as string;
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
    await as(t.admin)
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
      Role.Admin,
      Role.Accounts,
      Role.Investor,
      Role.Farmer,
      Role.FieldOfficer,
      Role.Insurer,
      Role.Buyer,
      Role.Auditor,
    ]) {
      t[r] = await demoToken(http, r);
      user[r] = await db
        .getRepository(User)
        .findOneByOrFail({ role: r, isDemo: true });
    }
    otherInsurer = await registerInsurer();
    insured = await activeProject('Insured maize', true);
    uninsured = await activeProject('Uninsured maize', false);
  });

  afterAll(async () => {
    await chain?.close();
  });

  describe('weather events', () => {
    it('are recorded by an admin or insurer, fingerprinted on the ledger', async () => {
      const res = await as(t.insurer)
        .post('/insurance/weather-events', {
          districtCode: 'BOGURA',
          eventTypeCode: 'FLOOD',
          occurredOn: await day(-2),
          severity: 'severe',
          notes: 'River above danger level for four days',
        })
        .expect(201);
      event.flood = res.body.data.id;
      expect(res.body.data).toMatchObject({
        district: { code: 'BOGURA', name: 'Bogura' },
        eventType: { code: 'FLOOD', name: 'Flood', nameBn: 'বন্যা' },
        severity: 'severe',
        status: 'recorded',
        recordedBy: { id: user.insurer.id },
      });
      const onChain = await registry().getWeatherEvent(
        uuidToBytes32(event.flood),
      );
      const [row] = await db.query(
        'SELECT details_hash FROM weather_events WHERE id = $1',
        [event.flood],
      );
      expect(onChain.detailsHash).toBe(row.details_hash);

      for (const [key, districtCode, eventTypeCode] of [
        ['drought', 'BOGURA', 'DROUGHT'],
        ['dhakaFlood', 'DHAKA', 'FLOOD'],
        ['cyclone', 'BOGURA', 'CYCLONE'],
      ]) {
        event[key] = (
          await as(t.admin)
            .post('/insurance/weather-events', {
              districtCode,
              eventTypeCode,
              occurredOn: await day(-1),
              severity: 'moderate',
            })
            .expect(201)
        ).body.data.id;
      }
    });

    it('refuse future days, unknown types and other roles', async () => {
      const base = {
        districtCode: 'BOGURA',
        eventTypeCode: 'FLOOD',
        occurredOn: await day(),
        severity: 'low',
      };
      await as(t.insurer)
        .post('/insurance/weather-events', {
          ...base,
          occurredOn: await day(2),
        })
        .expect(422);
      await as(t.insurer)
        .post('/insurance/weather-events', {
          ...base,
          eventTypeCode: 'METEOR',
        })
        .expect(422);
      await as(t.insurer)
        .post('/insurance/weather-events', { ...base, severity: 'apocalyptic' })
        .expect(400);
      await as(t.field_officer)
        .post('/insurance/weather-events', base)
        .expect(403);
    });

    it('are listed by district for everyone involved', async () => {
      const res = await as(t.farmer)
        .get('/insurance/weather-events?districtCode=BOGURA&limit=100')
        .expect(200);
      const ids = res.body.data.map((e: { id: string }) => e.id);
      expect(ids).toEqual(
        expect.arrayContaining([event.flood, event.drought, event.cyclone]),
      );
      expect(ids).not.toContain(event.dhakaFlood);
      await as(t.buyer).get('/insurance/weather-events').expect(403);
    });
  });

  describe('cover', () => {
    it('is set only on insured projects with the crop in the field', async () => {
      const res = await as(t.insurer)
        .put(`/insurance/projects/${uninsured}/coverage`, {
          maxAmount: '30000',
          coveredEventTypes: ['FLOOD'],
        })
        .expect(409);
      expect(res.body.code).toBe('NOT_INSURED');
    });

    it('cannot be claimed against before an insurer covers the project', async () => {
      const res = await as(t.field_officer)
        .post(`/insurance/projects/${insured}/claims`, {
          eventId: event.flood,
          damagePercent: 40,
          notes: 'Flooded',
        })
        .expect(409);
      expect(res.body.code).toBe('NO_COVERAGE');
    });

    it('makes the first insurer the project insurer', async () => {
      const res = await as(t.insurer)
        .put(`/insurance/projects/${insured}/coverage`, {
          maxAmount: '30000',
          coveredEventTypes: ['FLOOD', 'CYCLONE'],
          notes: 'Crop loss from flood or cyclone',
        })
        .expect(200);
      expect(res.body.data).toMatchObject({
        projectId: insured,
        insurer: { id: user.insurer.id },
        current: {
          maxAmount: '30000.00',
          coveredEventTypes: [{ code: 'CYCLONE' }, { code: 'FLOOD' }],
          status: 'recorded',
        },
        approvedTotal: '0.00',
        remaining: '30000.00',
        openClaims: 0,
        history: [],
      });
      await as(otherInsurer)
        .put(`/insurance/projects/${insured}/coverage`, {
          maxAmount: '90000',
          coveredEventTypes: ['FLOOD'],
        })
        .expect(403);
      await as(t.insurer)
        .put(`/insurance/projects/${insured}/coverage`, {
          maxAmount: '30000',
          coveredEventTypes: ['METEOR'],
        })
        .expect(422);
    });

    it('keeps each change as a new version, chained on the ledger', async () => {
      const res = await as(t.insurer)
        .put(`/insurance/projects/${insured}/coverage`, {
          maxAmount: '40000',
          coveredEventTypes: ['CYCLONE', 'FLOOD'],
          notes: 'Crop loss from flood or cyclone',
        })
        .expect(200);
      expect(res.body.data.current.maxAmount).toBe('40000.00');
      expect(res.body.data.history).toHaveLength(1);
      expect(res.body.data.history[0].maxAmount).toBe('30000.00');
      const onChain = await registry().getCoverage(uuidToBytes32(insured));
      expect(onChain.termsHash).toBe(res.body.data.current.termsHash);
      expect(onChain.maxAmount).toBe(4_000_000n);
      await as(t.insurer)
        .put(`/insurance/projects/${insured}/coverage`, {
          maxAmount: '40000',
          coveredEventTypes: ['FLOOD', 'CYCLONE'],
          notes: 'Crop loss from flood or cyclone',
        })
        .expect(409);
    });

    it('is visible to the parties of the project only', async () => {
      await as(t.farmer)
        .get(`/insurance/projects/${insured}/coverage`)
        .expect(200);
      await as(t.field_officer)
        .get(`/insurance/projects/${insured}/coverage`)
        .expect(200);
      await as(otherInsurer)
        .get(`/insurance/projects/${insured}/coverage`)
        .expect(404);
      await as(t.buyer)
        .get(`/insurance/projects/${insured}/coverage`)
        .expect(403);
      const list = await as(otherInsurer)
        .get('/insurance/projects?districtCode=BOGURA&limit=100')
        .expect(200);
      const mine = list.body.data.find(
        (p: { project: { id: string } }) => p.project.id === insured,
      );
      expect(mine).toMatchObject({
        insurer: { id: user.insurer.id },
        maxAmount: '40000.00',
      });
      expect(
        list.body.data.map((p: { project: { id: string } }) => p.project.id),
      ).not.toContain(uninsured);
    });
  });

  describe('claims', () => {
    it("are opened by the farmer's officer citing a covered event in the district", async () => {
      const photos = [
        await upload(t.field_officer, 'flooded-1'),
        await upload(t.field_officer, 'flooded-2'),
      ];
      const res = await as(t.field_officer)
        .post(`/insurance/projects/${insured}/claims`, {
          eventId: event.flood,
          damagePercent: '40.5',
          notes: 'Half the field under water for four days',
          photoIds: photos,
        })
        .expect(201);
      floodClaim = res.body.data.id;
      expect(res.body.data).toMatchObject({
        project: { id: insured },
        event: { id: event.flood, eventType: { code: 'FLOOD' } },
        damagePercent: '40.5',
        photos: [
          `/api/insurance/claims/${floodClaim}/photos/0`,
          `/api/insurance/claims/${floodClaim}/photos/1`,
        ],
        openedBy: { id: user.field_officer.id },
        status: 'triggered',
        assessment: null,
        approvedAmount: null,
      });
      const onChain = await registry().getClaim(uuidToBytes32(floodClaim));
      expect(onChain.claimHash).toBe(res.body.data.claimHash);
      expect(onChain.openedBy).toBe(uuidToBytes32(user.field_officer.id));
    });

    it('refuse a second claim, other districts, uncovered events and borrowed photos', async () => {
      const claim = (eventId: string, extra: object = {}) =>
        as(t.field_officer).post(`/insurance/projects/${insured}/claims`, {
          eventId,
          damagePercent: 10,
          notes: 'Damage',
          ...extra,
        });
      expect((await claim(event.flood).expect(409)).body.code).toBe(
        'ALREADY_CLAIMED',
      );
      expect((await claim(event.dhakaFlood).expect(422)).body.code).toBe(
        'REGION_MISMATCH',
      );
      expect((await claim(event.drought).expect(422)).body.code).toBe(
        'EVENT_NOT_COVERED',
      );
      const insurersPhoto = await upload(t.insurer, 'not-yours');
      await claim(event.cyclone, { photoIds: [insurersPhoto] }).expect(422);
      await claim(event.cyclone, { damagePercent: '0' }).expect(422);
      await claim(event.cyclone, { damagePercent: '100.5' }).expect(400);
      await as(t.farmer)
        .post(`/insurance/projects/${insured}/claims`, {
          eventId: event.cyclone,
          damagePercent: 10,
          notes: 'x',
        })
        .expect(403);
    });

    it('can be opened by an admin too', async () => {
      const res = await as(t.admin)
        .post(`/insurance/projects/${insured}/claims`, {
          eventId: event.cyclone,
          damagePercent: 15,
          notes: 'Lodged plants after the cyclone',
        })
        .expect(201);
      cycloneClaim = res.body.data.id;
      expect(res.body.data).toMatchObject({
        damagePercent: '15.0',
        status: 'triggered',
        openedBy: { id: user.admin.id },
      });
    });

    it("are reviewed only by the project's insurer", async () => {
      const early = await as(t.insurer)
        .post(`/insurance/claims/${floodClaim}/approve`, {
          amount: '1000',
          notes: 'Too early',
        })
        .expect(409);
      expect(early.body.code).toBe('REVIEW_NOT_STARTED');
      await as(otherInsurer)
        .post(`/insurance/claims/${floodClaim}/review`)
        .expect(403);
      const res = await as(t.insurer)
        .post(`/insurance/claims/${floodClaim}/review`)
        .expect(200);
      expect(res.body.data.status).toBe('under_review');
    });

    it('are approved within the remaining cover, with an assessment', async () => {
      const over = await as(t.insurer)
        .post(`/insurance/claims/${floodClaim}/approve`, {
          amount: '40000.01',
          notes: 'Too much',
        })
        .expect(409);
      expect(over.body).toMatchObject({
        code: 'EXCEEDS_COVERAGE',
        details: { remaining: '40000.00' },
      });
      const photo = await upload(t.insurer, 'site-visit');
      const res = await as(t.insurer)
        .post(`/insurance/claims/${floodClaim}/approve`, {
          amount: '25000',
          damagePercent: '35',
          notes: 'Confirmed on site: 35% of the crop lost',
          photoId: photo,
        })
        .expect(200);
      expect(res.body.data).toMatchObject({
        status: 'approved',
        approvedAmount: '25000.00',
        assessment: {
          damagePercent: '35.0',
          notes: 'Confirmed on site: 35% of the crop lost',
          photoUrl: `/api/insurance/claims/${floodClaim}/assessment/photo`,
        },
      });
      const onChain = await registry().getClaim(uuidToBytes32(floodClaim));
      expect(onChain.assessmentHash).toBe(res.body.data.assessmentHash);
      expect(onChain.approvedAmount).toBe(2_500_000n);

      const cover = await as(t.farmer)
        .get(`/insurance/projects/${insured}/coverage`)
        .expect(200);
      expect(cover.body.data).toMatchObject({
        approvedTotal: '25000.00',
        remaining: '15000.00',
        openClaims: 1,
      });
      const below = await as(t.insurer)
        .put(`/insurance/projects/${insured}/coverage`, {
          maxAmount: '20000',
          coveredEventTypes: ['FLOOD', 'CYCLONE'],
        })
        .expect(409);
      expect(below.body.code).toBe('COVERAGE_BELOW_APPROVED');
    });

    it('can be rejected without a review, with an assessment', async () => {
      const res = await as(t.insurer)
        .post(`/insurance/claims/${cycloneClaim}/reject`, {
          damagePercent: 2,
          notes: 'Plants recovered; no loss',
        })
        .expect(200);
      expect(res.body.data).toMatchObject({
        status: 'rejected',
        approvedAmount: null,
        assessment: { damagePercent: '2.0', photoUrl: null },
      });
      await as(t.insurer)
        .post(`/insurance/claims/${cycloneClaim}/reject`, { notes: 'Again' })
        .expect(409);
      const cover = await as(t.insurer)
        .get(`/insurance/projects/${insured}/coverage`)
        .expect(200);
      expect(cover.body.data.openClaims).toBe(0);
    });

    it('serve their photos to the parties', async () => {
      const first = await as(t.farmer)
        .get(`/insurance/claims/${floodClaim}/photos/0`)
        .expect(200);
      expect(first.headers['content-type']).toBe('image/jpeg');
      await as(t.farmer)
        .get(`/insurance/claims/${floodClaim}/photos/2`)
        .expect(404);
      await as(t.auditor)
        .get(`/insurance/claims/${floodClaim}/assessment/photo`)
        .expect(200);
      await as(otherInsurer)
        .get(`/insurance/claims/${floodClaim}/photos/0`)
        .expect(404);
    });

    it('are listed by who may see them', async () => {
      const ids = async (token: string) =>
        (
          await as(token)
            .get(`/insurance/claims?projectId=${insured}`)
            .expect(200)
        ).body.data.map((c: { id: string }) => c.id);
      for (const token of [t.farmer, t.field_officer, t.insurer, t.auditor]) {
        expect(await ids(token)).toEqual(
          expect.arrayContaining([floodClaim, cycloneClaim]),
        );
      }
      expect(await ids(otherInsurer)).toEqual([]);
      const approved = await as(t.insurer)
        .get(`/insurance/claims?projectId=${insured}&status=approved`)
        .expect(200);
      expect(approved.body.data.map((c: { id: string }) => c.id)).toEqual([
        floodClaim,
      ]);
      await as(t.buyer).get('/insurance/claims').expect(403);
    });
  });

  describe('integrity', () => {
    it('agrees with the ledger on every record', async () => {
      expect(await ledgerDisagreements(chain)).toEqual([]);
    });

    it('rebuilds identical cover, events and claims from the ledger', async () => {
      const snapshot = async () => ({
        terms: await db.query(
          'SELECT id, status, chain_event_block, chain_event_log FROM coverage_terms ORDER BY id',
        ),
        events: await db.query(
          'SELECT id, status FROM weather_events ORDER BY id',
        ),
        claims: await db.query(
          'SELECT id, status, approved_amount, opened_at, decided_at FROM insurance_claims ORDER BY id',
        ),
      });
      const indexer = chain.app.get(EventIndexerService);
      await indexer.catchUp();
      const before = await snapshot();
      await indexer.reindex();
      await indexer.catchUp();
      expect(await snapshot()).toEqual(before);
    });

    it('refuses an approved amount on a claim that is not approved', async () => {
      await expect(
        db.query(
          'UPDATE insurance_claims SET approved_amount = 1 WHERE id = $1',
          [cycloneClaim],
        ),
      ).rejects.toThrow(/ck_insurance_claims_amount/);
    });
  });
});
