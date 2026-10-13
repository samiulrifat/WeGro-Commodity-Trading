/** Field records end to end: photos, offline sync, privacy and Verify, against the local chain. */
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ChainClock } from '../src/blockchain/chain-clock';
import { EventIndexerService } from '../src/blockchain/indexer/event-indexer.service';
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

/** A structurally valid JPEG whose Exif block holds a GPS position. */
function jpeg(exif: string, pixels: string): Buffer {
  const seg = (marker: number, payload: string) => {
    const body = Buffer.from(payload, 'latin1');
    const head = Buffer.from([0xff, marker, 0, 0]);
    head.writeUInt16BE(body.length + 2, 2);
    return Buffer.concat([head, body]);
  };
  const scan = Buffer.concat([
    Buffer.from([0xff, 0xda, 0x00, 0x04, 0x01, 0x02]),
    Buffer.from(pixels, 'latin1'),
    Buffer.from([0xff, 0xd9]),
  ]);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    seg(0xe0, 'JFIF\0'),
    seg(0xe1, `Exif\0\0${exif}`),
    scan,
  ]);
}

describe('Field records (node + database)', () => {
  let chain: ChainApp;
  let http: ReturnType<typeof request>;
  let db: DataSource;
  let uploads: string;
  const t: Record<string, string> = {};
  let farmerId: string;
  let projectId: string;
  let photoId: string;
  let otherOfficer: string;

  const as = (token: string) => ({
    get: (path: string) =>
      http.get(`/api${path}`).auth(token, { type: 'bearer' }),
    post: (path: string, body: object = {}) =>
      http.post(`/api${path}`).auth(token, { type: 'bearer' }).send(body),
  });
  const upload = (token: string, data: Buffer, name = 'leaf.jpg') =>
    http
      .post('/api/photos')
      .auth(token, { type: 'bearer' })
      .attach('file', data, name);
  const sync = (token: string, records: object[]) =>
    as(token).post('/field-records/sync', { records });

  let observed: string;
  const draft = (over: object = {}) => ({
    id: randomUUID(),
    projectId,
    entryTypeCode: 'GROWTH_CHECK',
    notes: 'Leaves healthy after rain',
    measurements: { plant_height: 42, crop_cover: '80' },
    latitude: '24.846512',
    longitude: 89.377621,
    accuracyMeters: 6,
    photoId,
    observedAt: observed,
    ...over,
  });

  beforeAll(async () => {
    uploads = mkdtempSync(join(tmpdir(), 'wegro-photos-'));
    chain = await startChainApp({ DEMO_MODE: 'true', UPLOAD_DIR: uploads });
    http = request(chain.app.getHttpServer());
    db = chain.app.get(DataSource);
    await waitForDemoAccounts(chain);
    for (const r of [
      Role.SuperAdmin,
      Role.Admin,
      Role.Investor,
      Role.Accounts,
      Role.FieldOfficer,
      Role.Auditor,
      Role.Farmer,
    ]) {
      t[r] = await demoToken(http, r);
    }
    farmerId = (
      await db
        .getRepository(User)
        .findOneByOrFail({ role: Role.Farmer, isDemo: true })
    ).id;
    const now = await chain.app.get(ChainClock).now();
    observed = new Date(now.getTime() - 3_600_000).toISOString();

    // A funded project: farm updates are accepted from Funded on.
    projectId = (
      await as(t.admin)
        .post('/projects', {
          title: 'Maize field log',
          produceCode: 'MAIZE',
          districtCode: 'BOGURA',
          location: 'Shibganj',
          farmerId,
          durationType: 'short_term',
          durationMonths: 5,
          fundingTarget: '100000',
          slotPrice: '10000',
          estimatedReturnMinBps: 500,
          estimatedReturnMaxBps: 1000,
        })
        .expect(201)
    ).body.data.id;
    await as(t.admin).post(`/projects/${projectId}/publish`).expect(200);
    const r = await as(t.investor)
      .post(`/projects/${projectId}/reservations`, { slots: 10 })
      .expect(201);
    await as(t.accounts)
      .post(`/reservations/${r.body.data.id}/confirm`, {
        paymentReference: `F-${RUN}`,
      })
      .expect(200);

    // A second field officer, not this farmer's.
    const phone = `0192${String(randomInt(1e6, 1e7))}`;
    const reg = await as(t.super_admin)
      .post('/participants', {
        role: 'field_officer',
        fullName: 'Other Officer',
        phone,
        nid: `${randomInt(2, 9)}${randomInt(1e8, 1e9)}`,
        dateOfBirth: '1990-03-03',
        district: 'RANGPUR',
        address: 'Made-up office address, Rangpur',
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
    otherOfficer = (
      await as(login.body.data.accessToken)
        .post('/auth/change-password', {
          currentPassword: temp,
          newPassword: `${phone}-pw-ok`,
        })
        .expect(200)
    ).body.data.accessToken;
  });

  afterAll(async () => {
    await chain?.close();
    rmSync(uploads, { recursive: true, force: true });
  });

  describe('photos', () => {
    it('strips metadata, stores by content and gives the same id for the same picture', async () => {
      const original = jpeg('GPS 24.8465N 89.3776E Pixel-7', `pixels-${RUN}`);
      const res = await upload(t.field_officer, original).expect(201);
      photoId = res.body.data.id;
      expect(res.body.data).toMatchObject({ mimeType: 'image/jpeg' });
      expect(res.body.data.photoHash).toMatch(/^0x[0-9a-f]{64}$/);
      expect(res.body.data.sizeBytes).toBeLessThan(original.length);

      const sha = res.body.data.photoHash.slice(2);
      const dir = join(uploads, 'photos', sha.slice(0, 2));
      const stored = readFileSync(join(dir, readdirSync(dir)[0]));
      expect(stored.toString('latin1')).not.toContain('GPS');
      expect(stored.toString('latin1')).toContain(`pixels-${RUN}`);

      // Same picture, different hidden metadata: one stored photo.
      const again = await upload(
        t.field_officer,
        jpeg('GPS elsewhere', `pixels-${RUN}`),
      ).expect(201);
      expect(again.body.data.id).toBe(photoId);
    });

    it('accepts only real images from field officers', async () => {
      await upload(
        t.field_officer,
        Buffer.from('<svg onload=alert(1)>'),
        'x.jpg',
      ).expect(415);
      await upload(
        t.field_officer,
        Buffer.from([0xff, 0xd8, 0xff, 0x00]),
        'x.jpg',
      ).expect(422);
      await upload(t.investor, jpeg('x', 'y')).expect(403);
      await http
        .post('/api/photos')
        .auth(t.field_officer, { type: 'bearer' })
        .expect(400);
      await upload(
        t.field_officer,
        Buffer.alloc(10 * 1024 * 1024 + 1, 1),
      ).expect(413);
    });
  });

  describe('sync', () => {
    let first: ReturnType<typeof draft>;

    it('records a farm update with photo, readings and location, in canonical form', async () => {
      first = draft();
      const res = await sync(t.field_officer, [first]).expect(200);
      const [result] = res.body.data;
      expect(result).toMatchObject({ id: first.id, outcome: 'recorded' });
      expect(result.record).toMatchObject({
        status: 'recorded',
        entryTypeCode: 'GROWTH_CHECK',
        location: {
          latitude: '24.846512',
          longitude: '89.377621',
          accuracyMeters: 6,
          exact: true,
        },
        photo: { id: photoId },
      });
      expect(result.record.measurements).toEqual([
        expect.objectContaining({
          key: 'plant_height',
          value: '42',
          unit: 'cm',
        }),
        expect.objectContaining({ key: 'crop_cover', value: '80', unit: '%' }),
      ]);
      expect(result.record.txHash).toMatch(/^0x/);
    });

    it('never duplicates a resent draft, and refuses an id reused for different content', async () => {
      const again = await sync(t.field_officer, [first]).expect(200);
      expect(again.body.data[0]).toMatchObject({ outcome: 'already_recorded' });
      const changed = await sync(t.field_officer, [
        { ...first, notes: 'Something else' },
      ]).expect(200);
      expect(changed.body.data[0]).toMatchObject({
        outcome: 'rejected',
        code: 'ENTRY_ID_REUSED',
      });
      const [{ count }] = await db.query(
        'SELECT count(*)::int AS count FROM field_records WHERE id = $1',
        [first.id],
      );
      expect(count).toBe(1);
    });

    it('handles a whole offline batch: corrections after their originals, bad drafts alone', async () => {
      const original = draft({
        entryTypeCode: 'IRRIGATION',
        measurements: { duration: '2.5' },
        photoId: undefined,
      });
      const correction = draft({
        entryTypeCode: 'IRRIGATION',
        measurements: { duration: '3' },
        photoId: undefined,
        correctsEntryId: original.id,
        notes: 'It was 3 hours, not 2.5',
      });
      const bad = draft({
        measurements: { plant_height: 5000, crop_cover: 50 },
        latitude: undefined,
        longitude: undefined,
      });
      const dupe = draft();
      // Correction sent before its original, on purpose.
      const res = await sync(t.field_officer, [
        correction,
        bad,
        original,
        dupe,
        dupe,
      ]).expect(200);
      const outcomes = res.body.data.map(
        (r: { outcome: string; code?: string }) => r.code ?? r.outcome,
      );
      expect(outcomes).toEqual([
        'recorded',
        'INVALID_RECORD',
        'recorded',
        'recorded',
        'DUPLICATE_IN_BATCH',
      ]);
      expect(res.body.data[1].message).toMatch(
        /plant_height: above the maximum 1000.*needs the location/,
      );
      expect(res.body.data[0].record).toMatchObject({
        correctsEntryId: original.id,
      });
      expect(res.body.data[0].record.measurements[0].value).toBe('3.0');

      const shown = await as(t.field_officer)
        .get(`/field-records/${original.id}`)
        .expect(200);
      expect(shown.body.data.correctedBy).toEqual([correction.id]);
    });

    it('enforces the officer, the photo owner and the chain clock', async () => {
      const notMine = await sync(otherOfficer, [draft()]).expect(200);
      expect(notMine.body.data[0].code).toBe('NOT_FARMERS_OFFICER');

      const now = await chain.app.get(ChainClock).now();
      const future = await sync(t.field_officer, [
        draft({
          observedAt: new Date(now.getTime() + 3_600_000).toISOString(),
        }),
      ]).expect(200);
      expect(future.body.data[0].message).toMatch(/phone's clock/);

      const foreignPhoto = (
        await upload(otherOfficer, jpeg('x', `other-${RUN}`)).expect(201)
      ).body.data.id;
      const stolen = await sync(t.field_officer, [
        draft({ photoId: foreignPhoto }),
      ]).expect(200);
      expect(stolen.body.data[0].message).toMatch(/a photo you uploaded/);

      const outside = await sync(t.field_officer, [
        draft({ latitude: 51.5, longitude: -0.12 }),
      ]).expect(200);
      expect(outside.body.data[0].message).toMatch(/outside Bangladesh/);

      await sync(t.admin, [draft()]).expect(403);
    });

    it('accepts updates only while the project is between funding and sale', async () => {
      const open = (
        await as(t.admin)
          .post('/projects', {
            title: 'Not funded yet',
            produceCode: 'MAIZE',
            districtCode: 'BOGURA',
            location: 'Shibganj',
            farmerId,
            durationType: 'short_term',
            durationMonths: 5,
            fundingTarget: '10000',
            slotPrice: '10000',
            estimatedReturnMinBps: 0,
            estimatedReturnMaxBps: 0,
          })
          .expect(201)
      ).body.data.id;
      await as(t.admin).post(`/projects/${open}/publish`).expect(200);
      const res = await sync(t.field_officer, [
        draft({ projectId: open }),
      ]).expect(200);
      expect(res.body.data[0].code).toBe('WRONG_STAGE');
    });
  });

  describe('reading', () => {
    it('shows investors the area, not the exact field, and the photo', async () => {
      const res = await as(t.investor)
        .get(`/projects/${projectId}/field-records`)
        .expect(200);
      const growth = res.body.data.find(
        (r: { entryTypeCode: string }) => r.entryTypeCode === 'GROWTH_CHECK',
      );
      expect(growth.location).toEqual({
        latitude: '24.85',
        longitude: '89.38',
        accuracyMeters: null,
        exact: false,
      });
      const farmerView = await as(t.farmer)
        .get(`/field-records/${growth.id}`)
        .expect(200);
      expect(farmerView.body.data.location.exact).toBe(true);

      const photo = await as(t.investor)
        .get(`/field-records/${growth.id}/photo`)
        .buffer(true)
        .parse((r, done) => {
          const parts: Buffer[] = [];
          r.on('data', (c: Buffer) => parts.push(c));
          r.on('end', () => done(null, Buffer.concat(parts)));
        })
        .expect(200);
      expect(photo.headers['content-type']).toBe('image/jpeg');
      expect((photo.body as Buffer).toString('latin1')).toContain(
        `pixels-${RUN}`,
      );
    });

    it('verifies data and photo against the ledger, and catches tampering', async () => {
      const id = (
        await as(t.auditor)
          .get(
            `/projects/${projectId}/field-records?entryTypeCode=GROWTH_CHECK`,
          )
          .expect(200)
      ).body.data.at(-1).id;
      const ok = await as(t.auditor)
        .get(`/field-records/${id}/verify`)
        .expect(200);
      expect(ok.body.data).toMatchObject({ matches: true, mismatches: [] });
      await as(t.investor).get(`/field-records/${id}/verify`).expect(403);

      await db.query(
        `UPDATE field_records SET measurements = '{"plant_height":"43","crop_cover":"80"}' WHERE id = $1`,
        [id],
      );
      expect(
        (await as(t.auditor).get(`/field-records/${id}/verify`).expect(200))
          .body.data.mismatches,
      ).toEqual(['data']);
      await db.query(
        `UPDATE field_records SET measurements = '{"plant_height":"42","crop_cover":"80"}' WHERE id = $1`,
        [id],
      );

      const [{ storage_path }] = await db.query(
        'SELECT storage_path FROM photos WHERE id = $1',
        [photoId],
      );
      const file = join(uploads, storage_path);
      const original = readFileSync(file);
      writeFileSync(file, Buffer.concat([original, Buffer.from('x')]));
      expect(
        (await as(t.auditor).get(`/field-records/${id}/verify`).expect(200))
          .body.data.mismatches,
      ).toEqual(['photo']);
      writeFileSync(file, original);
      expect(
        (await as(t.auditor).get(`/field-records/${id}/verify`).expect(200))
          .body.data.matches,
      ).toBe(true);
    });

    it('puts farm updates on the project timeline', async () => {
      await chain.app.get(EventIndexerService).catchUp();
      const res = await as(t.investor)
        .get(`/projects/${projectId}/timeline`)
        .expect(200);
      const records = res.body.data.filter(
        (e: { kind: string }) => e.kind === 'field_record',
      );
      expect(records.length).toBeGreaterThanOrEqual(4);
      expect(records[0]).toMatchObject({ entryType: 'GROWTH_CHECK' });
    });

    it('rebuilds the same records from the ledger', async () => {
      const snapshot = () =>
        db.query(
          'SELECT id, status, tx_hash, recorded_at FROM field_records ORDER BY id',
        );
      const indexer = chain.app.get(EventIndexerService);
      const before = await snapshot();
      await indexer.reindex();
      await indexer.catchUp();
      expect(await snapshot()).toEqual(before);
    });
  });

  describe('ledger agreement', () => {
    it('agrees with the ledger on every record', async () => {
      expect(await ledgerDisagreements(chain)).toEqual([]);
    });
  });
});
