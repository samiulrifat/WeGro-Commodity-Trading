import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The reset's own decisions, with the deploy, the database and the app
 * replaced: the real thing runs end to end in data-reset.chain-spec.ts.
 */
const spawnSync = jest.fn(() => ({ status: 0, stdout: '', stderr: '' }));
jest.mock('node:child_process', () => ({ spawnSync }));

const queries: string[] = [];
let schema: string | null = 'public';
let lastKey: string | null = null;
jest.mock('typeorm', () => ({
  ...jest.requireActual<object>('typeorm'),
  DataSource: jest.fn(() => ({
    initialize: jest.fn(() => Promise.resolve()),
    destroy: jest.fn(() => Promise.resolve()),
    runMigrations: jest.fn(() => Promise.resolve([])),
    query: jest.fn((sql: string) => {
      queries.push(sql);
      if (sql.includes('current_schema()'))
        return Promise.resolve([{ schema }]);
      if (sql.includes('pg_sequences'))
        return Promise.resolve([{ value: lastKey }]);
      return Promise.resolve([]);
    }),
  })),
}));

const close = jest.fn(() => Promise.resolve());
const bringClockToNow = jest.fn(() => Promise.resolve());
jest.mock('../scripts/app-context', () => ({
  appContext: jest.fn(() => Promise.resolve({ close })),
}));
jest.mock('../scripts/local-only', () => ({
  assertLocal: jest.fn(() => Promise.resolve()),
  bringClockToNow,
}));
jest.mock('../scripts/super-admin', () => ({
  ensureSuperAdmin: jest.fn(() => Promise.resolve({ id: 'sa-1' })),
}));
const importer = { validate: jest.fn(), apply: jest.fn() };
jest.mock('./import/importer', () => ({ Importer: jest.fn(() => importer) }));
const seederRun = jest.fn();
jest.mock('./seed/seeder', () => ({
  Seeder: jest.fn(() => ({ run: seederRun })),
}));

import { resetLocal, type ResetOptions } from './reset';

describe('resetLocal', () => {
  let dir: string;
  let uploads: string;
  const logs: string[] = [];
  const env = { ...process.env };
  const options = (over: Partial<ResetOptions> = {}): ResetOptions => ({
    superAdmin: {
      fullName: 'Tania Rahman',
      phone: '+8801711000000',
      password: 'correct horse battery',
    },
    seedScale: null,
    importFolder: null,
    contractsDir: dir,
    credentialsDir: dir,
    skipDeploy: true,
    log: (m) => void logs.push(m),
    ...over,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    queries.length = 0;
    logs.length = 0;
    schema = 'public';
    lastKey = null;
    dir = mkdtempSync(join(tmpdir(), 'wegro-reset-'));
    uploads = join(dir, 'uploads');
    process.env.UPLOAD_DIR = uploads;
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    process.env = { ...env };
  });

  it('redeploys, rebuilds the schema, empties the photos and makes the super admin', async () => {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(join(uploads, 'photos'), { recursive: true });
    writeFileSync(join(uploads, 'photos', 'old.jpg'), 'x');
    await resetLocal(options({ skipDeploy: false }));
    expect(spawnSync).toHaveBeenCalledWith(
      'npx',
      expect.arrayContaining(['ignition', 'deploy', '--reset']),
      expect.objectContaining({ input: 'y\n' }),
    );
    expect(queries).toEqual(
      expect.arrayContaining([
        'DROP SCHEMA "public" CASCADE',
        'CREATE SCHEMA "public"',
      ]),
    );
    expect(readdirSync(uploads)).toEqual([]);
    // No sample data: everything is entered as of today.
    expect(bringClockToNow).toHaveBeenCalledTimes(1);
    expect(logs).toEqual([
      'Redeploying the contracts...',
      'Rebuilding the database...',
      'Super admin ready (sa-1).',
      'Reset complete.',
    ]);
    expect(close).toHaveBeenCalled();
  });

  it('stops when the deployment fails, showing its output', async () => {
    spawnSync.mockReturnValueOnce({
      status: 1,
      stdout: 'HH108: ',
      stderr: 'Cannot connect to the network',
    });
    await expect(resetLocal(options({ skipDeploy: false }))).rejects.toThrow(
      'Deployment failed:\nHH108: Cannot connect to the network',
    );
  });

  it('never empties a root or home folder', async () => {
    process.env.UPLOAD_DIR = '/';
    await expect(resetLocal(options())).rejects.toThrow('Refusing to empty /');
  });

  it('carries key numbering on when the contracts are kept', async () => {
    lastKey = '41';
    await resetLocal(options());
    expect(queries).toContain(
      'ALTER SEQUENCE "signer_key_index_seq" RESTART WITH 42',
    );
  });

  it('refuses a connection without a schema', async () => {
    schema = null;
    await expect(resetLocal(options())).rejects.toThrow(
      'The connection has no schema to reset',
    );
  });

  it('imports a folder, handing out passwords, and stops on any problem or failed row', async () => {
    importer.validate.mockResolvedValueOnce([
      { file: 'people.csv', line: 3, id: 'P2', message: 'phone is missing' },
    ]);
    await expect(resetLocal(options({ importFolder: dir }))).rejects.toThrow(
      '1 import problem(s), e.g. people.csv:3 phone is missing',
    );
    importer.validate.mockResolvedValueOnce([]);
    importer.apply.mockResolvedValueOnce({
      outcomes: [{ id: 'P1', result: 'failed', message: 'ledger refused' }],
      credentials: [
        { role: 'farmer', name: 'Rahim', phone: '01711000001', password: 'x' },
      ],
    });
    await expect(resetLocal(options({ importFolder: dir }))).rejects.toThrow(
      '1 row(s) failed to import, e.g. P1: ledger refused',
    );
    expect(
      logs.some((l) => l.startsWith('Imported; temporary passwords in')),
    ).toBe(true);
    expect(close).toHaveBeenCalledTimes(2);
  });

  it('loads sample data and says where the sign-in details are', async () => {
    seederRun.mockResolvedValueOnce({
      people: 46,
      projects: 9,
      credentials: [],
    });
    await resetLocal(options({ seedScale: 1 }));
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^Sample data loaded: 46 people, 9 projects\. Sign-in details: /,
        ),
      ]),
    );
    // Sample data runs from the chain's start; only then is it brought to now.
    expect(bringClockToNow).toHaveBeenCalledTimes(1);
    expect(bringClockToNow.mock.invocationCallOrder[0]).toBeGreaterThan(
      seederRun.mock.invocationCallOrder[0]!,
    );
  });
});
