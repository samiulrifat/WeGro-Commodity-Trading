import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, parse, resolve } from 'node:path';
import { DataSource } from 'typeorm';
import { KEY_INDEX_SEQUENCE } from '../blockchain/keys/key.service';
import { SnakeNamingStrategy } from '../database/snake-naming.strategy';
import { appContext } from '../scripts/app-context';
import { writeCredentials } from './credentials-file';
import { assertLocal } from '../scripts/local-only';
import { ensureSuperAdmin } from '../scripts/super-admin';
import { Importer } from './import/importer';
import { Seeder } from './seed/seeder';

export interface ResetOptions {
  superAdmin: { fullName: string; phone: string; password: string };
  /** Sample data at this scale; null for none. */
  seedScale: number | null;
  /** A folder of WeGro CSVs to import; null for none. */
  importFolder: string | null;
  contractsDir: string;
  /** Where the sample people's sign-in details are written. */
  credentialsDir: string;
  /** Keep the deployed contracts (e.g. just deployed). */
  skipDeploy: boolean;
  log: (message: string) => void;
}

/**
 * Resets a local setup and loads it again; every failure throws. Uses the
 * database, node and photo folder the environment names.
 *
 *   1. checks this is local (Hardhat node, NODE_ENV not production)
 *   2. redeploys the contracts (fresh ledger addresses)
 *   3. drops and recreates the database schema, runs every migration
 *   4. empties the photo folder
 *   5. creates the super admin
 *   6. imports a folder of WeGro CSVs and/or loads sample data
 */
export async function resetLocal(opts: ResetOptions): Promise<void> {
  const { log } = opts;
  await assertLocal();
  const uploads = resolve(process.env.UPLOAD_DIR ?? './uploads');
  if (uploads === parse(uploads).root || uploads === homedir()) {
    throw new Error(`Refusing to empty ${uploads}`);
  }

  // 2. Fresh contracts.
  if (!opts.skipDeploy) {
    log('Redeploying the contracts...');
    const deploy = spawnSync(
      'npx',
      [
        'hardhat',
        'ignition',
        'deploy',
        'ignition/modules/Platform.ts',
        '--network',
        'localhost',
        '--reset',
      ],
      { cwd: resolve(opts.contractsDir), input: 'y\n', encoding: 'utf8' },
    );
    if (deploy.status !== 0) {
      throw new Error(
        `Deployment failed:\n${(deploy.stdout + deploy.stderr).slice(-2000)}`,
      );
    }
  }

  // 3. A clean schema: the one the connection uses (public unless the URL says otherwise).
  log('Rebuilding the database...');
  const db = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    migrations: [join(__dirname, '..', 'database', 'migrations', '*.{js,ts}')],
    namingStrategy: new SnakeNamingStrategy(),
  });
  await db.initialize();
  try {
    const [{ schema }] = await db.query<Array<{ schema: string | null }>>(
      'SELECT current_schema() AS schema',
    );
    if (!schema) throw new Error('The connection has no schema to reset');
    // Keys are single-use on a ledger: when it is kept, carry on numbering
    // them where the old data stopped.
    const [last] = opts.skipDeploy
      ? await db.query<Array<{ value: string | null }>>(
          'SELECT last_value::text AS value FROM pg_sequences WHERE schemaname = $1 AND sequencename = $2',
          [schema, KEY_INDEX_SEQUENCE],
        )
      : [];
    await db.query(`DROP SCHEMA "${schema}" CASCADE`);
    await db.query(`CREATE SCHEMA "${schema}"`);
    await db.runMigrations();
    if (last?.value) {
      await db.query(
        `ALTER SEQUENCE "${KEY_INDEX_SEQUENCE}" RESTART WITH ${BigInt(last.value) + 1n}`,
      );
    }
  } finally {
    await db.destroy();
  }

  // 4. Photos belong to the old data.
  if (existsSync(uploads)) {
    for (const entry of readdirSync(uploads))
      rmSync(join(uploads, entry), { recursive: true, force: true });
  }

  // 5 and 6. Through the app.
  const app = await appContext();
  try {
    const { id } = await ensureSuperAdmin(app, opts.superAdmin);
    log(`Super admin ready (${id}).`);
    if (opts.importFolder) {
      const folder = opts.importFolder;
      const importer = new Importer(app, { folder });
      const problems = await importer.validate();
      if (problems.length) {
        throw new Error(
          `${problems.length} import problem(s), e.g. ${problems[0].file}:${problems[0].line} ${problems[0].message}; check with npm run data:import -- ${folder}`,
        );
      }
      const { outcomes, credentials } = await importer.apply();
      if (credentials.length) {
        const file = writeCredentials(folder, 'credentials', credentials);
        log(`Imported; temporary passwords in ${file}`);
      }
      const failed = outcomes.filter((o) => o.result === 'failed');
      if (failed.length) {
        throw new Error(
          `${failed.length} row(s) failed to import, e.g. ${failed[0].id}: ${failed[0].message}`,
        );
      }
    }
    if (opts.seedScale) {
      const summary = await new Seeder(app, {
        scale: opts.seedScale,
        log,
      }).run();
      const file = writeCredentials(
        opts.credentialsDir,
        'sample-credentials',
        summary.credentials,
      );
      log(
        `Sample data loaded: ${summary.people} people, ${summary.projects} projects. Sign-in details: ${file}`,
      );
    }
  } finally {
    await app.close();
  }
  log('Reset complete.');
}
