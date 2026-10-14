/**
 * The reset, against a throwaway schema and photo folder (never the
 * developer's own), keeping the deployed contracts.
 */
import { randomInt } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { DataSource } from 'typeorm';
import { KEY_INDEX_SEQUENCE } from '../src/blockchain/keys/key.service';
import { type ResetOptions, resetLocal } from '../src/data/reset';
import { SnakeNamingStrategy } from '../src/database/snake-naming.strategy';

const phone = () => `0191${String(randomInt(0, 1e7)).padStart(7, '0')}`;
const nid = () =>
  `${randomInt(1, 10)}${String(randomInt(0, 1e9)).padStart(9, '0')}`;

describe('Local reset (node + database)', () => {
  const fileEnv = parseEnv(readFileSync(join(__dirname, '..', '.env'), 'utf8'));
  const schema = `test_reset_${process.pid}_${randomInt(1e9)}`;
  const url = `${fileEnv.DATABASE_URL}${fileEnv.DATABASE_URL!.includes('?') ? '&' : '?'}options=${encodeURIComponent(`-c search_path=${schema}`)}`;
  const work = mkdtempSync(join(tmpdir(), 'wegro-reset-'));
  const uploads = join(work, 'uploads');
  const folder = join(work, 'import');
  const saved = { ...process.env };
  let db: DataSource;
  let keyIndex: number;

  const options = (over: Partial<ResetOptions> = {}): ResetOptions => ({
    superAdmin: {
      fullName: 'Reset Super Admin',
      phone: phone(),
      password: 'correct-horse-battery',
    },
    seedScale: null,
    importFolder: folder,
    contractsDir: join(__dirname, '..', '..', 'contracts'),
    credentialsDir: work,
    skipDeploy: true,
    log: () => undefined,
    ...over,
  });

  beforeAll(async () => {
    Object.assign(process.env, {
      DATABASE_URL: url,
      UPLOAD_DIR: uploads,
      THROTTLE_LIMIT: '100000',
    });
    db = new DataSource({
      type: 'postgres',
      url,
      migrations: [join(__dirname, '../src/database/migrations/*.ts')],
      namingStrategy: new SnakeNamingStrategy(),
    });
    await db.initialize();
    await db.query(`CREATE SCHEMA "${schema}"`);
    await db.runMigrations();
    // The old data: a used key range, a stray record and a photo.
    keyIndex = randomInt(1_000_000, 2 ** 31 - 100_000);
    await db.query(
      `SELECT setval('"${KEY_INDEX_SEQUENCE}"', ${keyIndex}, true)`,
    );
    await db.query(
      `INSERT INTO import_records (kind, external_id, internal_id) VALUES ('stale', 'X', 'Y')`,
    );
    mkdirSync(join(uploads, 'photos'), { recursive: true });
    writeFileSync(join(uploads, 'photos', 'old.jpg'), 'x');
    mkdirSync(folder);
    writeFileSync(
      join(folder, 'people.csv'),
      [
        'id,role,full_name,phone,nid,date_of_birth,district,address',
        `R1,admin,Reset Admin,${phone()},${nid()},1980-01-01,DHAKA,Road 1 Dhaka`,
        `R2,accounts,Reset Accounts,${phone()},${nid()},1981-01-01,DHAKA,Road 2 Dhaka`,
        `R3,investor,Reset Investor,${phone()},${nid()},1990-01-01,DHAKA,Road 3 Dhaka`,
      ].join('\n'),
    );
  });

  afterAll(async () => {
    process.env = saved;
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.destroy();
    rmSync(work, { recursive: true, force: true });
  });

  it('refuses outside a local setup, before touching anything', async () => {
    process.env.NODE_ENV = 'production';
    await expect(resetLocal(options())).rejects.toThrow(/production/);
    process.env.NODE_ENV = saved.NODE_ENV ?? 'test';
    process.env.UPLOAD_DIR = homedir();
    await expect(resetLocal(options())).rejects.toThrow(/Refusing to empty/);
    process.env.UPLOAD_DIR = uploads;
    expect(await db.query(`SELECT kind FROM import_records`)).toEqual([
      { kind: 'stale' },
    ]);
    expect(existsSync(join(uploads, 'photos', 'old.jpg'))).toBe(true);
  });

  it('rebuilds the schema, empties photos, creates the super admin and imports', async () => {
    // The guard: this test must only ever reset its own schema.
    expect(process.env.DATABASE_URL).toContain(encodeURIComponent(schema));
    await resetLocal(options());

    expect(readdirSync(uploads)).toEqual([]);
    const people: Array<{ role: string; key_index: number }> = await db.query(
      `SELECT role, key_index FROM users ORDER BY key_index`,
    );
    expect(people.map((p) => p.role)).toEqual([
      'super_admin',
      'admin',
      'accounts',
      'investor',
    ]);
    // The ledger was kept, so keys carry on past the old ones.
    expect(people[0].key_index).toBe(0);
    expect(people.slice(1).every((p) => p.key_index > keyIndex)).toBe(true);
    expect(
      await db.query(`SELECT kind FROM import_records ORDER BY external_id`),
    ).toEqual([{ kind: 'person' }, { kind: 'person' }, { kind: 'person' }]);
    const [credentials] = readdirSync(folder).filter((f) =>
      f.startsWith('credentials-'),
    );
    expect(statSync(join(folder, credentials)).mode & 0o777).toBe(0o600);
    expect(readFileSync(join(folder, credentials), 'utf8')).toContain(
      'Reset Investor',
    );
  }, 120_000);
});
