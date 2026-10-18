/** Catalog against the real database: defaults, caching, permissions and every rule. */
import request from 'supertest';
import { DataSource } from 'typeorm';
import { CatalogService } from '../src/modules/catalog/catalog.service';
import { Role } from '../src/modules/users/roles';
import {
  type ChainApp,
  demoToken,
  startChainApp,
  waitForDemoAccounts,
} from './support/chain-app';

describe('Catalog (database)', () => {
  let chain: ChainApp;
  let http: ReturnType<typeof request>;
  let ops: string;
  let admin: string;
  let investor: string;

  beforeAll(async () => {
    chain = await startChainApp({ DEMO_MODE: 'true' });
    http = request(chain.app.getHttpServer());
    await waitForDemoAccounts(chain);
    [ops, admin, investor] = await Promise.all([
      demoToken(http, Role.OPERATIONS),
      demoToken(http, Role.ADMIN),
      demoToken(http, Role.INVESTOR),
    ]);
  });

  afterAll(async () => {
    await chain?.close();
  });

  const get = (token: string, query = '') =>
    http.get(`/api/catalog${query}`).auth(token, { type: 'bearer' });
  const post = (token: string, path: string, body: object) =>
    http
      .post(`/api/catalog/${path}`)
      .auth(token, { type: 'bearer' })
      .send(body);
  const patch = (token: string, path: string, body: object) =>
    http
      .patch(`/api/catalog/${path}`)
      .auth(token, { type: 'bearer' })
      .send(body);

  describe('reading', () => {
    it('serves the seeded defaults, sorted, with districts', async () => {
      const res = await get(investor).expect(200);
      const c = res.body.data;
      expect(c.units.map((u: { code: string }) => u.code)).toEqual([
        'KG',
        'GRAM',
        'LITRE',
        'ML',
        'PIECE',
      ]);
      expect(c.produceTypes).toHaveLength(17);
      expect(c.produceTypes[1]).toMatchObject({
        code: 'MAIZE',
        nameBn: 'ভুট্টা',
        category: 'storable_crop',
        unitCode: 'KG',
      });
      expect(
        c.inputTypes.find((i: { code: string }) => i.code === 'SEED_TOMATO'),
      ).toMatchObject({
        unitCode: 'GRAM',
        produceCode: 'TOMATO',
      });
      expect(
        c.fieldRecordTypes.find(
          (t: { code: string }) => t.code === 'GROWTH_CHECK',
        ).measurements,
      ).toHaveLength(2);
      expect(
        c.weatherEventTypes.map((w: { code: string }) => w.code),
      ).toContain('CYCLONE');
      expect(c.districts).toHaveLength(64);
    });

    it('answers 304 to an unchanged catalog, and a new ETag after a change', async () => {
      const first = await get(investor).expect(200);
      const etag = first.headers.etag;
      expect(etag).toBe(`"${first.body.data.version}"`);
      const again = await get(investor).set('If-None-Match', etag).expect(304);
      expect(again.text).toBe('');

      await post(ops, 'weather-event-types', {
        code: 'LANDSLIDE',
        name: 'Landslide',
        nameBn: 'ভূমিধস',
      }).expect(201);
      const changed = await get(investor)
        .set('If-None-Match', etag)
        .expect(200);
      expect(changed.headers.etag).not.toBe(etag);
    });

    it('derives the version from content, so a reload gives the same ETag', async () => {
      const before = (await get(investor).expect(200)).headers.etag;
      await chain.app.get(CatalogService).reload();
      expect((await get(investor).expect(200)).headers.etag).toBe(before);
    });

    it('needs sign-in', async () => {
      await http.get('/api/catalog').expect(401);
    });
  });

  describe('writing', () => {
    it('lets Operations and Admin edit, and nobody else', async () => {
      const body = {
        code: 'BUNDLE',
        name: 'Bundle',
        nameBn: 'আঁটি',
        kind: 'count',
        symbol: 'bdl',
      };
      await post(investor, 'units', body).expect(403);
      await post(ops, 'units', body).expect(201);
      await patch(admin, 'units/BUNDLE', { sortOrder: 9 }).expect(200);
    });

    it('creates a produce type that refers to an active unit', async () => {
      const res = await post(admin, 'produce-types', {
        code: 'SWEET_POTATO',
        name: 'Sweet potato',
        nameBn: 'মিষ্টি আলু',
        category: 'storable_crop',
        unitCode: 'KG',
        typicalDurationMonths: 4,
      }).expect(201);
      expect(res.body.data).toMatchObject({
        code: 'SWEET_POTATO',
        active: true,
        sortOrder: 0,
      });
      await post(admin, 'produce-types', {
        code: 'GHOST',
        name: 'Ghost',
        nameBn: 'ভূত',
        category: 'spice',
        unitCode: 'TONNE',
      }).expect(422);
    });

    it('refuses repeated codes, and names that differ only in case', async () => {
      const base = {
        name: 'Okra',
        nameBn: 'ঢেঁড়স',
        category: 'perishable',
        unitCode: 'KG',
      };
      await post(admin, 'produce-types', { ...base, code: 'OKRA' }).expect(201);
      const sameCode = await post(admin, 'produce-types', {
        ...base,
        code: 'OKRA',
        name: 'Lady finger',
      }).expect(409);
      expect(sameCode.body.message).toMatch(/code OKRA already exists/);
      const sameName = await post(admin, 'produce-types', {
        ...base,
        code: 'OKRA2',
        name: '  OKRA ',
      }).expect(409);
      expect(sameName.body.message).toBe(
        'An entry with this name already exists',
      );
    });

    it('keeps codes, categories and units fixed', async () => {
      await patch(admin, 'produce-types/MAIZE', {
        category: 'perishable',
      }).expect(400);
      await patch(admin, 'produce-types/MAIZE', { unitCode: 'GRAM' }).expect(
        400,
      );
      await patch(admin, 'produce-types/MAIZE', { code: 'CORN' }).expect(400);
      const ok = await patch(admin, 'produce-types/MAIZE', {
        nameBn: 'ভুট্টা (হাইব্রিড)',
        description: null,
      }).expect(200);
      expect(ok.body.data).toMatchObject({
        code: 'MAIZE',
        category: 'storable_crop',
        description: null,
      });
    });

    it('validates codes and answers 404 for unknown or malformed ones', async () => {
      await post(admin, 'units', {
        code: 'kg2',
        name: 'x',
        nameBn: 'x',
        kind: 'mass',
        symbol: 'x',
      }).expect(400);
      await post(admin, 'units', {
        code: 'A'.repeat(32),
        name: 'x',
        nameBn: 'x',
        kind: 'mass',
        symbol: 'x',
      }).expect(400);
      await patch(admin, 'units/NOPE', { name: 'x' }).expect(404);
      await patch(admin, 'units/bad code', { name: 'x' }).expect(404);
    });

    it('will not retire a unit that active entries still use', async () => {
      const res = await patch(admin, 'units/GRAM', { active: false }).expect(
        409,
      );
      expect(res.body.message).toMatch(/SEED_MUSTARD/);
      await patch(admin, 'units/PIECE', { active: false }).expect(200);
      await post(admin, 'input-types', {
        code: 'NET_BAG',
        name: 'Net bag',
        nameBn: 'জালের ব্যাগ',
        kind: 'other',
        unitCode: 'PIECE',
      }).expect(422);
    });

    it('checks measurement definitions', async () => {
      const base = {
        code: 'SOIL_TEST',
        name: 'Soil test',
        nameBn: 'মাটি পরীক্ষা',
      };
      const ph = {
        key: 'ph',
        label: 'pH',
        labelBn: 'পিএইচ',
        min: 0,
        max: 14,
        decimals: 1,
        required: true,
      };
      await post(admin, 'field-record-types', {
        ...base,
        measurements: [ph, ph],
      }).expect(422);
      await post(admin, 'field-record-types', {
        ...base,
        measurements: [{ ...ph, min: 15 }],
      }).expect(422);
      await post(admin, 'field-record-types', {
        ...base,
        measurements: [{ ...ph, max: 14.25 }],
      }).expect(422);
      await post(admin, 'field-record-types', {
        ...base,
        measurements: [{ ...ph, key: 'Bad Key' }],
      }).expect(400);
      const ok = await post(admin, 'field-record-types', {
        ...base,
        measurements: [ph],
      }).expect(201);
      expect(ok.body.data).toMatchObject({
        requiresPhoto: false,
        requiresLocation: true,
      });
      expect(ok.body.data.measurements[0]).toEqual({ ...ph, unit: null });
    });

    it('never shows in the cache what the database refused', async () => {
      const before = (await get(admin, '?includeInactive=true').expect(200))
        .body.data.version;
      await post(admin, 'produce-types', {
        code: 'DUPNAME',
        name: 'maize',
        nameBn: 'x',
        category: 'spice',
        unitCode: 'KG',
      }).expect(409);
      expect(
        (await get(admin, '?includeInactive=true').expect(200)).body.data
          .version,
      ).toBe(before);
    });

    it('enforces codes and categories in the database itself', async () => {
      const db = chain.app.get(DataSource);
      await expect(
        db.query(
          `INSERT INTO produce_types (code, name, name_bn, category, unit_code) VALUES ('bad', 'Bad', 'x', 'spice', 'KG')`,
        ),
      ).rejects.toThrow(/ck_produce_types_code/);
      await expect(
        db.query(
          `INSERT INTO produce_types (code, name, name_bn, category, unit_code) VALUES ('GOOD', 'Good', 'x', 'livestock', 'KG')`,
        ),
      ).rejects.toThrow(/ck_produce_types_category/);
    });

    it('edits inputs, farm-record types and weather events', async () => {
      const input = await post(admin, 'input-types', {
        code: 'NEEM_OIL',
        name: 'Neem oil',
        nameBn: 'নিম তেল',
        kind: 'pesticide',
        unitCode: 'LITRE',
      }).expect(201);
      expect(input.body.data).toMatchObject({ code: 'NEEM_OIL', active: true });
      await patch(admin, 'input-types/NEEM_OIL', {
        description: 'Organic',
      }).expect(200);
      const record = await patch(admin, 'field-record-types/LAND_PREPARATION', {
        requiresPhoto: true,
      }).expect(200);
      expect(record.body.data.requiresPhoto).toBe(true);
      const weather = await patch(admin, 'weather-event-types/COLD_WAVE', {
        description: 'Below 10 °C for three days',
      }).expect(200);
      expect(weather.body.data.description).toBe('Below 10 °C for three days');
    });

    it('shows deactivated entries only on request', async () => {
      await patch(admin, 'produce-types/OKRA', { active: false }).expect(200);
      const active = (await get(investor).expect(200)).body.data.produceTypes;
      const all = (await get(investor, '?includeInactive=true').expect(200))
        .body.data.produceTypes;
      expect(active.some((p: { code: string }) => p.code === 'OKRA')).toBe(
        false,
      );
      expect(all.find((p: { code: string }) => p.code === 'OKRA').active).toBe(
        false,
      );
    });
  });
});
