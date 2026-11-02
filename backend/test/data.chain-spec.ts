/** Importer and sample-data seeder end to end, against the local chain and a throwaway schema. */
import { randomBytes, randomInt } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Importer } from '../src/data/import/importer';
import { Seeder } from '../src/data/seed/seeder';
import { ParticipantsService } from '../src/modules/participants/participants.service';
import { ProjectsService } from '../src/modules/projects/projects.service';
import { ensureSuperAdmin } from '../src/scripts/super-admin';
import {
  type ChainApp,
  ledgerDisagreements,
  startChainApp,
} from './support/chain-app';

const RUN = randomBytes(3).toString('hex').toUpperCase();
const nid = () =>
  `${randomInt(1, 10)}${String(randomInt(0, 1e9)).padStart(9, '0')}`;
const phone = () => `0191${String(randomInt(0, 1e7)).padStart(7, '0')}`;

describe('Data tools (node + database)', () => {
  let chain: ChainApp;
  let db: DataSource;
  let folder: string;

  const write = (files: Record<string, string>) => {
    for (const [name, text] of Object.entries(files)) {
      writeFileSync(join(folder, name), text);
    }
  };
  const importer = () => new Importer(chain.app, { folder });

  beforeAll(async () => {
    chain = await startChainApp({});
    db = chain.app.get(DataSource);
    await ensureSuperAdmin(chain.app, {
      fullName: 'Test Super Admin',
      phone: phone(),
      password: 'correct-horse-battery',
    });
    folder = mkdtempSync(join(tmpdir(), 'wegro-import-'));
  });

  afterAll(async () => {
    rmSync(folder, { recursive: true, force: true });
    await chain?.close();
  });

  describe('import', () => {
    // The imported investor's: later rows that repeat them are refused.
    const taken = { phone: phone(), nid: nid() };
    const people = (rows: string[][]) =>
      [
        'id,role,full_name,phone,nid,date_of_birth,district,address,field_officer_id,acknowledge_flags',
        // Quoted throughout: addresses carry commas.
        ...rows.map((r) => r.map((c) => `"${c}"`).join(',')),
      ].join('\n');

    it('reports every problem, with file and line, and writes nothing', async () => {
      const dupNid = nid();
      write({
        'people.csv': people([
          [
            'P1',
            'admin',
            'Imported Admin',
            phone(),
            nid(),
            '1980-01-01',
            'DHAKA',
            'Road 1, Dhaka',
            '',
            '',
          ],
          [
            'P2',
            'farmer',
            'Bad Phone',
            '12345',
            dupNid,
            '1985-02-02',
            'BOGURA',
            'Village 2, Bogura',
            'NOBODY',
            '',
          ],
          [
            'P3',
            'investor',
            'Twin',
            phone(),
            dupNid,
            '1990-03-03',
            'DHAKA',
            'Road 3, Dhaka',
            '',
            '',
          ],
          [
            'P1',
            'investor',
            'Again',
            phone(),
            nid(),
            '1990-03-03',
            'DHAKA',
            'Road 4, Dhaka',
            '',
            '',
          ],
        ]),
        'projects.csv': 'id,title\nX1,Missing columns',
        'stray.csv': 'a\n1',
      });
      const problems = await importer().validate();
      const text = problems.map((p) => `${p.file}:${p.line} ${p.message}`);
      expect(text).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^people\.csv:3 ID check PHONE_FORMAT/),
          expect.stringMatching(
            /^people\.csv:3 field_officer_id "NOBODY" is not in people\.csv/,
          ),
          expect.stringMatching(/^people\.csv:4 same NID as person P2/),
          expect.stringMatching(/^people\.csv:5 id also on line 2/),
          expect.stringMatching(
            /^projects\.csv:1 missing column\(s\): produce_code/,
          ),
          expect.stringMatching(/^stray\.csv:0 unknown file/),
        ]),
      );
      expect(
        await db.query('SELECT 1 FROM users WHERE role = $1', ['admin']),
      ).toEqual([]);
      await expect(importer().apply()).rejects.toThrow(/problem\(s\) found/);
    });

    it('names the rest of what can be wrong, file by file', async () => {
      const broken = mkdtempSync(join(tmpdir(), 'wegro-import-broken-'));
      // Each row written as cells joined by "|", quoted into CSV.
      const csv = (...rows: string[]) =>
        rows
          .map((r) =>
            r
              .split('|')
              .map((c) => `"${c}"`)
              .join(','),
          )
          .join('\n');
      const person = (cells: string) => {
        const [id, role, name, district, officer] = cells.split('|');
        return [
          id,
          role,
          name,
          phone(),
          nid(),
          '1985-02-02',
          district,
          `Road 9, ${district}`,
          officer ?? '',
          '',
        ];
      };
      const files: Record<string, string> = {
        'people.csv': people([
          person('Q1|investor|Rokeya Begum|DHAKA'),
          person('Q2|farmer|Karim Mia|BOGURA'),
          person('Q3|super_admin|Second Boss|DHAKA'),
          person('Q4|investor|Shirin Akter|DHAKA|Q2'),
        ]),
        // Unreadable: a quote that never closes.
        'units.csv':
          'code,name,name_bn,kind,symbol,symbol_bn\n"BASKET,Basket\n',
        'field-record-types.csv':
          'code,name,name_bn,measurements\nSOIL,Soil,মাটি,{not json}\n',
        'produce-types.csv':
          'code,name,name_bn,category,unit_code\nMANGO,Mango,আম,perishable,BASKET\n',
        'input-types.csv':
          'code,name,name_bn,kind,unit_code,produce_code\nSEED_X,X seed,বীজ,seed,KG,NOTACROP\n',
        'weather-event-types.csv':
          'code,name,name_bn,colour\nHAIL,,শিলাবৃষ্টি,white\n',
        'projects.csv': csv(
          'id|title|produce_code|district|location|farmer_id|duration_type|duration_months|funding_target|slot_price|estimated_return_min_bps|estimated_return_max_bps|stage',
          'X1|Wrong farmer|NOTACROP|BOGURA|Shibganj|Q1|short_term|5|20000|30000|0|1000|',
          'X2|Still a draft|MAIZE|BOGURA|Shibganj|Q2|short_term|5|20000|10000|0|1000|draft',
          'X3|Active, half paid|MAIZE|BOGURA|Shibganj|Q2|short_term|5|20000|10000|0|1000|active',
          'X4|Overbooked|MAIZE|BOGURA|Shibganj|Q2|short_term|5|10000|10000|0|1000|',
        ),
        'investments.csv': csv(
          'id|project_id|investor_id|slots|payment_reference',
          'I1|X9|Q2|1|REF-1',
          'I2|X2|Q1|1|REF-2',
          'I3|X3|Q1|1|REF-3',
          'I4|X4|Q1|2|REF-4',
          'I5|X4|Q1|1|ref-4',
        ),
        'history.csv': csv(
          'id|farmer_id|title|produce_code|district|started_on|finished_on|funding_raised|income|costs|farmer_received',
          'H1|Q2|Backwards|MAIZE|BOGURA|2024-05-01|2024-01-01|1000|1200|100|400',
          'H2|Q2|Not yet|MAIZE|BOGURA|2024-01-01|2099-01-01|1000|1200|100|400',
          'H3|Q2|Unknown crop|NOTACROP|BOGURA|2024-01-01|2024-05-01|1000|1200|100|400',
        ),
      };
      for (const [name, text] of Object.entries(files)) {
        writeFileSync(join(broken, name), text);
      }
      const problems = (
        await new Importer(chain.app, { folder: broken }).validate()
      ).map((p) => `${p.file}:${p.line} ${p.message}`);
      rmSync(broken, { recursive: true, force: true });
      expect(problems).toEqual(
        expect.arrayContaining([
          'field-record-types.csv:2 measurements is not valid JSON',
          'produce-types.csv:2 unit_code "BASKET" is not in the catalog or units.csv',
          'units.csv:2 a quoted cell never ends',
          'input-types.csv:2 produce_code "NOTACROP" is not in the catalog or produce-types.csv',
          'weather-event-types.csv:1 unknown column(s): colour',
          expect.stringMatching(/^weather-event-types\.csv:2 empty: name/),
          'people.csv:4 the super admin is created by the reset or user:super-admin, not imported',
          'people.csv:5 only farmers have a field officer',
          expect.stringMatching(
            /^projects\.csv:2 farmer_id "Q1" is a investor, not a farmer/,
          ),
          'projects.csv:2 produce_code "NOTACROP" is not in the catalog',
          expect.stringMatching(
            /^investments\.csv:2 project_id "X9" is not in projects\.csv/,
          ),
          'investments.csv:3 project X2 stays a draft: it cannot take investments',
          'projects.csv:4 stage active needs all 2 slots invested; investments.csv has 1',
          'investments.csv:0 project X4: 3 slots invested, but it has 1',
          'projects.csv:2 Funding target must be a whole number of slots',
          'investments.csv:6 payment_reference also used by investment I4',
          'investments.csv:2 investor_id "Q2" is a farmer, not a investor',
          'history.csv:2 finished_on is before started_on',
          'history.csv:3 finished_on is in the future',
          'history.csv:4 produce_code "NOTACROP" is not in the catalog',
          'people.csv:0 no admin to verify people and create projects: add one to people.csv or pass --admin-phone',
          'people.csv:0 no Accounts person to confirm investments: add one to people.csv or pass --accounts-phone',
        ]),
      );
      // Catalog codes are the entries' own and valid: never reported missing.
      expect(problems.filter((p) => /code must be/.test(p))).toEqual([]);
      // The slot price above the target breaks the project's terms too.
      expect(
        problems.filter((p) => p.startsWith('projects.csv:2')).length,
      ).toBeGreaterThan(2);

      const nowhere = await new Importer(chain.app, {
        folder: join(broken, 'gone'),
      }).validate();
      expect(nowhere).toEqual([
        expect.objectContaining({ line: 0, message: 'folder not found' }),
      ]);
    });

    it('brings people, projects, investments and history in, then resumes without repeating', async () => {
      rmSync(join(folder, 'stray.csv'));
      write({
        'people.csv': people([
          [
            'P1',
            'admin',
            'Imported Admin',
            phone(),
            nid(),
            '1980-01-01',
            'DHAKA',
            'Road 1, Dhaka',
            '',
            '',
          ],
          [
            'P2',
            'accounts',
            'Imported Accounts',
            phone(),
            nid(),
            '1981-01-01',
            'DHAKA',
            'Road 2, Dhaka',
            '',
            '',
          ],
          [
            'P3',
            'field_officer',
            'Imported Officer',
            phone(),
            nid(),
            '1982-01-01',
            'BOGURA',
            'Road 3, Bogura',
            '',
            '',
          ],
          [
            'P4',
            'farmer',
            'Imported Farmer',
            phone(),
            nid(),
            '1975-04-04',
            'BOGURA',
            'Village 4, Bogura',
            'P3',
            '',
          ],
          [
            'P5',
            'investor',
            'Imported Investor',
            taken.phone,
            taken.nid,
            '1988-05-05',
            'DHAKA',
            'Road 5, Dhaka',
            '',
            '',
          ],
        ]),
        'projects.csv': [
          'id,title,produce_code,district,location,farmer_id,duration_type,duration_months,funding_target,slot_price,estimated_return_min_bps,estimated_return_max_bps,stage',
          `J1,Imported maize ${RUN},MAIZE,BOGURA,Shibganj,P4,short_term,5,30000,10000,500,1500,active`,
          `J2,Imported wheat ${RUN},WHEAT,BOGURA,Shibganj,P4,short_term,5,30000,10000,500,1500,open_for_funding`,
        ].join('\n'),
        'investments.csv': [
          'id,project_id,investor_id,slots,payment_reference',
          `I1,J1,P5,3,IMP-1-${RUN}`,
          `I2,J2,P5,1,IMP-2-${RUN}`,
        ].join('\n'),
        'history.csv': [
          'id,farmer_id,title,produce_code,district,started_on,finished_on,funding_raised,income,costs,farmer_received,harvested,sold',
          'H1,P4,2024 season,PADDY,BOGURA,2024-01-10,2024-06-20,50000,80000,20000,24000,2500,2400',
        ].join('\n'),
        // The catalog too: a unit, and a crop sold in it.
        'units.csv':
          'code,name,name_bn,kind,symbol,symbol_bn\nMAUND,Maund,মণ,mass,maund,মণ\n',
        'produce-types.csv':
          'code,name,name_bn,category,unit_code\nJUTE,Jute,পাট,storable_crop,MAUND\n',
      });
      expect(await importer().validate()).toEqual([]);
      const { outcomes, credentials } = await importer().apply();
      expect(outcomes.filter((o) => o.result !== 'imported')).toEqual([]);
      expect(credentials.map((c) => c.id)).toEqual([
        'P1',
        'P2',
        'P3',
        'P4',
        'P5',
      ]);

      const [farmer] = await db.query(
        `SELECT u.id, u.status, u.field_officer_id, o.internal_id AS officer
           FROM import_records r JOIN users u ON u.id::text = r.internal_id
           JOIN import_records o ON o.kind = 'person' AND o.external_id = 'P3'
          WHERE r.kind = 'person' AND r.external_id = 'P4'`,
      );
      expect(farmer).toMatchObject({
        status: 'verified',
        field_officer_id: farmer.officer,
      });
      const stages = await db.query(
        `SELECT p.stage, p.issued_slots FROM import_records r JOIN projects p ON p.id::text = r.internal_id
          WHERE r.kind = 'project' ORDER BY r.external_id`,
      );
      expect(stages).toEqual([
        { stage: 'active', issued_slots: 3 },
        { stage: 'open_for_funding', issued_slots: 1 },
      ]);
      const [jute] = await db.query(
        `SELECT p.code, p.unit_code, u.symbol_bn FROM produce_types p
           JOIN units u ON u.code = p.unit_code WHERE p.code = 'JUTE'`,
      );
      expect(jute).toEqual({
        code: 'JUTE',
        unit_code: 'MAUND',
        symbol_bn: 'মণ',
      });
      const [history] = await db.query(
        'SELECT title, income::text FROM legacy_projects',
      );
      expect(history).toEqual({ title: '2024 season', income: '8000000' });

      const again = await importer().apply();
      expect(again.outcomes.every((o) => o.result === 'skipped')).toBe(true);
      expect(again.credentials).toEqual([]);
    });

    it('refuses what clashes with earlier imports, and records rows that fail', async () => {
      const clash = mkdtempSync(join(tmpdir(), 'wegro-import-clash-'));
      const put = (files: Record<string, string>) => {
        rmSync(clash, { recursive: true, force: true });
        mkdirSync(clash);
        for (const [name, text] of Object.entries(files)) {
          writeFileSync(join(clash, name), text);
        }
      };
      const clashing = () => new Importer(chain.app, { folder: clash });
      const measure = (key: string) =>
        `"[{""key"":""${key}"",""label"":""Pests"",""labelBn"":""পোকা"",""decimals"":0,""required"":false}]"`;
      put({
        'people.csv': people([
          [
            'R1',
            'investor',
            'Same Details',
            taken.phone,
            taken.nid,
            '1988-05-05',
            'DHAKA',
            'Road 6, Dhaka',
            '',
            '',
          ],
          [
            'R2',
            'investor',
            'Old Card',
            phone(),
            // 13 digits from no known district: flagged, not refused.
            `99${String(randomInt(0, 1e9)).padStart(11, '0')}`,
            '1979-03-03',
            'DHAKA',
            'Road 7, Dhaka',
            '',
            '',
          ],
          [
            'R3',
            'admin',
            'Second Admin',
            phone(),
            nid(),
            '1983-03-03',
            'DHAKA',
            'Road 8, Dhaka',
            '',
            '',
          ],
        ]),
        'projects.csv': [
          'id,title,produce_code,district,location,farmer_id,duration_type,duration_months,funding_target,slot_price,estimated_return_min_bps,estimated_return_max_bps,stage',
          'Z1,Bad money,MAIZE,BOGURA,Shibganj,P4,short_term,5,lots,10000,500,1500,',
        ].join('\n'),
        'investments.csv': [
          'id,project_id,investor_id,slots,payment_reference',
          `K1,J2,P5,1,IMP-1-${RUN}`,
        ].join('\n'),
        'field-record-types.csv': [
          'code,name,name_bn,requires_photo,requires_location,measurements',
          `SCOUT,Scouting,পর্যবেক্ষণ,false,false,${measure('Bad Key')}`,
        ].join('\n'),
      });
      // As if the super admin were gone: staff could not be registered.
      const lookup = jest
        .spyOn(
          Importer.prototype as unknown as {
            superAdmin: () => Promise<null>;
          },
          'superAdmin',
        )
        .mockResolvedValue(null);
      const problems = (await clashing().validate()).map(
        (p) => `${p.file}:${p.line} ${p.message}`,
      );
      lookup.mockRestore();
      expect(problems).toEqual(
        expect.arrayContaining([
          'people.csv:2 phone is already registered',
          'people.csv:2 NID is already registered',
          'people.csv:3 ID check flagged NID_DISTRICT: review, then set acknowledge_flags to true',
          'people.csv:0 staff are registered by the super admin, who does not exist yet: run npm run user:super-admin first',
          'investments.csv:2 payment_reference was already used for another payment',
          expect.stringMatching(
            /^field-record-types\.csv:2 measurements: 0: key must be lower-case/,
          ),
          expect.stringMatching(/^projects\.csv:2 .*funding/i),
        ]),
      );

      // Clean files: catalog entries in, a repeat skipped, a clash failed,
      // and an activation the ledger refuses recorded against its project.
      put({
        'units.csv':
          'code,name,name_bn,kind,symbol,symbol_bn\nKG,Kilogram,কিলোগ্রাম,mass,kg,কেজি\n',
        'input-types.csv': `code,name,name_bn,kind,unit_code,produce_code\nSEED_JUTE,Jute Seed ${RUN},পাটের বীজ ${RUN},seed,KG,JUTE\n`,
        'field-record-types.csv': [
          'code,name,name_bn,requires_photo,requires_location,measurements',
          `SCOUT,Scouting ${RUN},পর্যবেক্ষণ ${RUN},false,true,${measure('pests')}`,
        ].join('\n'),
        'weather-event-types.csv': [
          'code,name,name_bn,description',
          `TIDE,Tidal Surge ${RUN},জোয়ার ${RUN},Sea water over the fields`,
          'SURGE,Flood,জলোচ্ছ্বাস,',
        ].join('\n'),
        'projects.csv': [
          'id,title,produce_code,district,location,farmer_id,duration_type,duration_months,funding_target,slot_price,estimated_return_min_bps,estimated_return_max_bps,stage',
          `J3,Imported jute ${RUN},JUTE,BOGURA,Shibganj,P4,short_term,5,10000,10000,500,1500,active`,
        ].join('\n'),
        'investments.csv': [
          'id,project_id,investor_id,slots,payment_reference',
          `I3,J3,P5,1,IMP-3-${RUN}`,
        ].join('\n'),
      });
      const projects = chain.app.get(ProjectsService);
      const real = projects.advance.bind(projects);
      const advance = jest
        .spyOn(projects, 'advance')
        .mockImplementation((actor, id, action) =>
          action === 'activate'
            ? Promise.reject(
                new ConflictException({
                  message: 'Field officer has not signed off',
                  code: 'TEST_REFUSED',
                }),
              )
            : real(actor, id, action),
        );
      let result: Awaited<ReturnType<Importer['apply']>>;
      try {
        result = await clashing().apply();
      } finally {
        advance.mockRestore();
        rmSync(clash, { recursive: true, force: true });
      }
      const byId = new Map(result.outcomes.map((o) => [o.id, o]));
      expect(byId.get('KG')).toMatchObject({
        result: 'skipped',
        message: 'already in the catalog',
      });
      for (const id of ['SEED_JUTE', 'SCOUT', 'TIDE', 'I3'])
        expect(byId.get(id)).toMatchObject({ result: 'imported' });
      expect(byId.get('SURGE')).toMatchObject({
        result: 'failed',
        message: expect.stringMatching(/^CATALOG_NAME_EXISTS: /),
      });
      expect(result.outcomes).toContainEqual(
        expect.objectContaining({
          id: 'J3',
          result: 'failed',
          message: 'activation: TEST_REFUSED: Field officer has not signed off',
        }),
      );
      const [scout] = await db.query(
        `SELECT requires_location, measurements->0->>'key' AS key FROM field_record_types WHERE code = 'SCOUT'`,
      );
      expect(scout).toEqual({ requires_location: true, key: 'pests' });
    });

    it('acts only as the staff the phone options name', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'wegro-import-named-'));
      const adminPhone = phone();
      writeFileSync(
        join(dir, 'people.csv'),
        people([
          [
            'S1',
            'admin',
            'Named Admin',
            adminPhone,
            nid(),
            '1984-04-04',
            'DHAKA',
            'Road 10, Dhaka',
            '',
            '',
          ],
          [
            'S2',
            'investor',
            'Waiting Investor',
            phone(),
            nid(),
            '1990-09-09',
            'DHAKA',
            'Road 11, Dhaka',
            '',
            '',
          ],
        ]),
      );
      const named = (adminPhone?: string) =>
        new Importer(chain.app, { folder: dir, adminPhone });
      try {
        // Another admin in the file, or no phone number at all: refused.
        for (const given of [phone(), 'not-a-phone'])
          expect(await named(given).validate()).toEqual([
            expect.objectContaining({
              line: 0,
              message: `--admin-phone ${given} is not a verified admin here or in people.csv`,
            }),
          ]);
        expect(await named(adminPhone).validate()).toEqual([]);

        // The named admin's own row fails: who they would register fails too.
        const register = jest
          .spyOn(chain.app.get(ParticipantsService), 'register')
          .mockRejectedValueOnce(new Error('ledger refused'));
        const { outcomes } = await named(adminPhone).apply();
        register.mockRestore();
        expect(outcomes).toEqual([
          expect.objectContaining({
            id: 'S1',
            result: 'failed',
            message: 'ledger refused',
          }),
          expect.objectContaining({
            id: 'S2',
            result: 'failed',
            message: `No verified admin with phone ${adminPhone}`,
          }),
        ]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('sample data', () => {
    it('builds every story through the real services, all agreeing with the ledger', async () => {
      const seeder = new Seeder(chain.app, { scale: 1, log: () => undefined });
      const summary = await seeder.run();
      // Everyone can sign in: one one-time password per sample person.
      expect(summary.credentials).toHaveLength(summary.people);
      expect(
        summary.credentials.every((c) =>
          /^\w{4}-\w{4}-\w{4}$/.test(c.temporaryPassword),
        ),
      ).toBe(true);
      expect(summary.stories).toMatchObject({
        'inputs-and-claim': 1,
        'stored-and-paid-out': 1,
        'buy-back': 1,
        'staged-payout': 1,
        cancelled: 1,
        'fresh-deals': 1,
        open: 1,
      });
      const stages = Object.fromEntries(
        (
          await db.query(
            `SELECT p.stage, COUNT(*)::int AS n FROM import_records r
               JOIN projects p ON p.id::text = r.internal_id
              WHERE r.kind = 'project' AND r.external_id LIKE 'S-%' GROUP BY 1`,
          )
        ).map((r: { stage: string; n: number }) => [r.stage, r.n]),
      );
      expect(stages).toEqual({
        draft: 1,
        open_for_funding: 1,
        funded: 1,
        active: 4,
        paid_out: 1,
        cancelled: 1,
      });
      const count = async (sql: string) => Number((await db.query(sql))[0].n);
      expect(
        await count(
          `SELECT COUNT(*) AS n FROM settlement_rounds WHERE status = 'paid'`,
        ),
      ).toBe(2);
      expect(
        await count(
          `SELECT COUNT(*) AS n FROM insurance_claims WHERE status = 'approved'`,
        ),
      ).toBe(1);
      expect(
        await count(
          `SELECT COUNT(*) AS n FROM offers WHERE status = 'pending'`,
        ),
      ).toBe(1);
      expect(
        await count(
          `SELECT COUNT(*) AS n FROM offers WHERE status = 'approved'`,
        ),
      ).toBe(1);
      expect(await count(`SELECT COUNT(*) AS n FROM summary_views`)).toBe(1);
      expect(await count(`SELECT COUNT(*) AS n FROM legacy_projects`)).toBe(9);

      expect(await ledgerDisagreements(chain)).toEqual([]);
      await expect(seeder.run()).rejects.toThrow(/already loaded/);
    }, 300_000);
  });
});
