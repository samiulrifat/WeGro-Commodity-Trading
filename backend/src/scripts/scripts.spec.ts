import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The command-line tools: their arguments, refusals and what they print.
 * The work itself (reset, seeding, import) runs against Postgres and the
 * chain in the chain suite; here it is replaced, so only the scripts run.
 */
type Logs = { log: (m: string) => void };
const resetLocal = jest.fn((_opts: Logs) => Promise.resolve());
jest.mock('../data/reset', () => ({ resetLocal }));

// Given the seeder's options, so a test can have it print progress.
const seederRun = jest.fn();
jest.mock('../data/seed/seeder', () => ({
  ...jest.requireActual<object>('../data/seed/seeder'),
  Seeder: jest.fn((_app: unknown, opts: Logs) => ({
    run: () => seederRun(opts),
  })),
}));

const importer = { validate: jest.fn(), apply: jest.fn() };
jest.mock('../data/import/importer', () => ({
  Importer: jest.fn(() => importer),
}));

const close = jest.fn(() => Promise.resolve());
jest.mock('./app-context', () => ({
  ...jest.requireActual<object>('./app-context'),
  appContext: jest.fn(() => Promise.resolve({ close })),
}));

const assertLocal = jest.fn(() => Promise.resolve());
jest.mock('./local-only', () => ({ loadEnv: jest.fn(), assertLocal }));

const ensureSuperAdmin = jest.fn(() =>
  Promise.resolve({ id: 'sa-1', account: '0xabc' }),
);
jest.mock('./super-admin', () => ({
  ...jest.requireActual<object>('./super-admin'),
  ensureSuperAdmin,
}));
jest.mock('@nestjs/core', () => ({
  ...jest.requireActual<object>('@nestjs/core'),
  NestFactory: {
    createApplicationContext: jest.fn(() => Promise.resolve({ close })),
  },
}));

class Exit extends Error {
  constructor(readonly code: number | undefined) {
    super(`exit ${code}`);
  }
}

/** Runs a script's command as `npm run` would, and returns how it ended and what it said. */
async function run(script: string, argv: string[] = []) {
  const errors: string[] = [];
  const logs: string[] = [];
  jest
    .spyOn(console, 'error')
    .mockImplementation((m: unknown) => void errors.push(String(m)));
  jest
    .spyOn(console, 'log')
    .mockImplementation((m: unknown) => void logs.push(String(m)));
  jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Exit(code);
  }) as never);
  process.exitCode = undefined;
  const { main } = (await import(`./${script}`)) as {
    main: (argv: string[]) => Promise<void>;
  };
  let exit: number | undefined;
  try {
    await main(argv);
  } catch (e) {
    if (!(e instanceof Exit)) throw e;
    exit = e.code;
  }
  return {
    exit: exit ?? (process.exitCode as number | undefined),
    errors,
    logs,
  };
}

describe('command-line tools', () => {
  const env = { ...process.env };
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SUPER_ADMIN_PASSWORD = 'correct horse battery';
  });
  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...env };
    process.exitCode = undefined;
  });

  describe('data:reset', () => {
    it('erases nothing without --yes', async () => {
      const r = await run('data-reset', ['--name', 'Tania Rahman']);
      expect(r.exit).toBe(1);
      expect(r.errors[0]).toMatch(/Run again with --yes/);
      expect(resetLocal).not.toHaveBeenCalled();
    });

    it('needs the super admin, and a known sample size', async () => {
      expect((await run('data-reset', ['--yes'])).errors[0]).toMatch(
        /Give the super admin/,
      );
      expect(
        (
          await run('data-reset', [
            '--yes',
            '--name',
            'Tania Rahman',
            '--phone',
            '01711000000',
            '--seed',
            'huge',
          ])
        ).errors[0],
      ).toBe('--seed takes showcase (default) or large');
    });

    it('resets with the showcase when --seed has no size', async () => {
      const r = await run('data-reset', [
        '--yes',
        '--name',
        'Tania Rahman',
        '--phone',
        '01711000000',
        '--seed',
        '--skip-deploy',
      ]);
      expect(r.exit).toBeUndefined();
      expect(resetLocal).toHaveBeenCalledWith(
        expect.objectContaining({
          superAdmin: {
            fullName: 'Tania Rahman',
            phone: '+8801711000000',
            password: 'correct horse battery',
          },
          seedScale: 1, // the showcase
          skipDeploy: true,
          importFolder: null,
        }),
      );
    });

    it('refuses a password that is too short, and prints the progress', async () => {
      process.env.SUPER_ADMIN_PASSWORD = 'short';
      const args = [
        '--yes',
        '--name',
        'Tania Rahman',
        '--phone',
        '01711000000',
      ];
      expect((await run('data-reset', args)).errors[0]).toMatch(
        /^Password must be \d+ to \d+ characters$/,
      );
      process.env.SUPER_ADMIN_PASSWORD = 'correct horse battery';
      resetLocal.mockImplementationOnce((opts) => {
        opts.log('Reset complete.');
        return Promise.resolve();
      });
      expect((await run('data-reset', args)).logs).toEqual(['Reset complete.']);
    });

    it('says why the reset failed', async () => {
      resetLocal.mockRejectedValueOnce(new Error('node down'));
      const r = await run('data-reset', [
        '--yes',
        '--name',
        'Tania Rahman',
        '--phone',
        '01711000000',
      ]);
      expect(r).toMatchObject({ exit: 1, errors: ['node down'] });
    });
  });

  describe('data:seed', () => {
    let dir: string;
    const cwd = process.cwd();
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'wegro-seed-'));
      process.chdir(dir);
    });
    afterEach(() => {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    });

    it('refuses an unknown size and a setup that is not local', async () => {
      expect((await run('data-seed', ['--size', 'huge'])).errors[0]).toBe(
        '--size must be showcase or large',
      );
      assertLocal.mockRejectedValueOnce(new Error('Refused: production'));
      expect((await run('data-seed')).errors[0]).toBe('Refused: production');
    });

    it('loads the sample, writes the sign-in details and summarises', async () => {
      seederRun.mockImplementationOnce((opts: Logs) => {
        opts.log('Story open: S-PROJECT-002');
        return Promise.resolve({
          people: 46,
          projects: 9,
          credentials: [
            {
              role: 'farmer',
              name: 'Rahim',
              phone: '01711000001',
              password: 'x',
            },
          ],
          stories: { open: 'S-PROJECT-002' },
        });
      });
      const r = await run('data-seed');
      expect(r.logs[0]).toBe('Story open: S-PROJECT-002');
      expect(r.logs[1]).toBe('Sample data loaded: 46 people, 9 projects.');
      expect(r.logs).toEqual(expect.arrayContaining(['  open: S-PROJECT-002']));
      expect(
        readdirSync(dir).some((f) => f.startsWith('sample-credentials')),
      ).toBe(true);
      expect(close).toHaveBeenCalled();
    });

    it('says why seeding failed, and still closes the app', async () => {
      seederRun.mockRejectedValueOnce(new Error('already seeded'));
      const r = await run('data-seed');
      expect(r).toMatchObject({ exit: 1, errors: ['already seeded'] });
      expect(close).toHaveBeenCalled();
    });
  });

  describe('data:import', () => {
    let dir: string;
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'wegro-import-'));
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it('needs a folder', async () => {
      expect((await run('data-import')).errors[0]).toMatch(/^Usage:/);
    });

    it('lists the problems, writes the report and imports nothing', async () => {
      importer.validate.mockResolvedValueOnce(
        Array.from({ length: 31 }, (_, i) => ({
          file: 'people.csv',
          line: i + 2,
          id: `P-${i}`,
          message: 'phone is missing',
        })),
      );
      const r = await run('data-import', [dir, '--apply']);
      expect(r.exit).toBe(1);
      expect(r.errors[0]).toBe('people.csv:2 [P-0]  phone is missing');
      expect(r.errors).toContain('... and 1 more');
      expect(importer.apply).not.toHaveBeenCalled();
      expect(readdirSync(dir).some((f) => f.startsWith('import-report'))).toBe(
        true,
      );
    });

    it('checks only, unless told to apply', async () => {
      importer.validate.mockResolvedValueOnce([]);
      const r = await run('data-import', [dir]);
      expect(r.logs).toEqual([
        'No problems found. Run again with --apply to import.',
      ]);
      expect(importer.apply).not.toHaveBeenCalled();
    });

    it('imports, hands over the passwords, and fails the run if any row failed', async () => {
      importer.validate.mockResolvedValueOnce([]);
      importer.apply.mockResolvedValueOnce({
        outcomes: [
          {
            file: 'people.csv',
            line: 2,
            id: 'P-1',
            result: 'imported',
            message: '',
          },
          {
            file: 'people.csv',
            line: 3,
            id: 'P-2',
            result: 'failed',
            message: 'ledger refused',
          },
        ],
        credentials: [
          {
            role: 'farmer',
            name: 'Rahim',
            phone: '01711000001',
            password: 'x',
          },
        ],
      });
      const r = await run('data-import', [dir, '--apply']);
      expect(r.exit).toBe(1);
      expect(r.logs[0]).toMatch(/^Temporary passwords: /);
      expect(r.logs[1]).toMatch(/^Imported 1, skipped 0, failed 1\./);
      expect(r.errors).toEqual(['people.csv:3 [P-2]  ledger refused']);
      expect(
        existsSync(
          join(
            dir,
            readdirSync(dir).find((f) => f.startsWith('credentials'))!,
          ),
        ),
      ).toBe(true);
    });
  });

  describe('user:super-admin', () => {
    it('needs a name and a Bangladeshi mobile number', async () => {
      expect(
        (await run('create-super-admin', ['--phone', '01711000000'])).errors[0],
      ).toBe('--name is required (2 to 100 characters)');
      expect(
        (
          await run('create-super-admin', [
            '--name',
            'Tania Rahman',
            '--phone',
            '12',
          ])
        ).errors[0],
      ).toBe('--phone must be a Bangladeshi mobile number');
    });

    it('creates the super admin and says which key it has', async () => {
      const r = await run('create-super-admin', [
        '--name',
        'Tania Rahman',
        '--phone',
        '01711000000',
      ]);
      expect(r.logs).toEqual(['Super admin ready (id sa-1, key 0xabc).']);
      expect(close).toHaveBeenCalled();
    });

    it('says why it could not, for a weak password or a super admin already there', async () => {
      process.env.SUPER_ADMIN_PASSWORD = 'short';
      expect(
        (
          await run('create-super-admin', [
            '--name',
            'Tania Rahman',
            '--phone',
            '01711000000',
          ])
        ).errors[0],
      ).toMatch(/^Password must be/);
      process.env.SUPER_ADMIN_PASSWORD = 'correct horse battery';
      ensureSuperAdmin.mockRejectedValueOnce(
        new Error('A super admin already exists'),
      );
      expect(
        (
          await run('create-super-admin', [
            '--name',
            'Tania Rahman',
            '--phone',
            '01711000000',
          ])
        ).errors[0],
      ).toBe('A super admin already exists');
    });
  });
});
