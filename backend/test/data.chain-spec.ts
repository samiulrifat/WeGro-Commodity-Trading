/** Importer and sample-data seeder end to end, against the local chain and a throwaway schema. */
import { randomBytes, randomInt } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { Importer } from '../src/data/import/importer';
import { Seeder } from '../src/data/seed/seeder';
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
            phone(),
            nid(),
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
      const [history] = await db.query(
        'SELECT title, income::text FROM legacy_projects',
      );
      expect(history).toEqual({ title: '2024 season', income: '8000000' });

      const again = await importer().apply();
      expect(again.outcomes.every((o) => o.result === 'skipped')).toBe(true);
      expect(again.credentials).toEqual([]);
    });
  });

  describe('sample data', () => {
    it('builds every story through the real services, all agreeing with the ledger', async () => {
      const seeder = new Seeder(chain.app, { scale: 1, log: () => undefined });
      const summary = await seeder.run();
      expect(summary.skipped).toEqual([]);
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
