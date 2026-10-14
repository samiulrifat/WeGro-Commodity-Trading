/**
 * Resets a local setup and loads it again.
 *
 *   npm run data:reset -- --yes --name "Tania Rahman" --phone 01711000000 [--seed [large]] [--import <folder>]
 *
 *   1. checks this is local (Hardhat node, NODE_ENV not production)
 *   2. redeploys the contracts (fresh ledger addresses)
 *   3. drops and recreates the database schema, runs every migration
 *   4. empties the photo folder
 *   5. creates the super admin (password typed, or SUPER_ADMIN_PASSWORD)
 *   6. imports a folder of WeGro CSVs (--import) and/or loads sample data (--seed)
 *
 * Name and phone may also come from SUPER_ADMIN_NAME / SUPER_ADMIN_PHONE.
 * --skip-deploy keeps the deployed contracts (key numbering then carries on).
 * When the contracts' code changed, run npm run contracts:sync and rebuild first.
 */
import { parseArgs } from 'node:util';
import { resetLocal } from '../data/reset';
import { SEED_SIZES as SIZES } from '../data/seed/seeder';
import {
  normalisePhone,
  normaliseText,
} from '../modules/participants/id-check/id-check';
import { fail } from './app-context';
import { loadEnv } from './local-only';
import { readPassword } from './super-admin';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      yes: { type: 'boolean', default: false },
      name: { type: 'string' },
      phone: { type: 'string' },
      seed: { type: 'string' },
      import: { type: 'string' },
      'contracts-dir': { type: 'string', default: '../contracts' },
      'skip-deploy': { type: 'boolean', default: false },
    },
  });
  loadEnv();
  if (!values.yes) {
    fail(
      'This erases the local database and redeploys the contracts. Run again with --yes.',
    );
  }
  const scale =
    values.seed === undefined
      ? null
      : SIZES[(values.seed || 'showcase') as keyof typeof SIZES];
  if (values.seed !== undefined && !scale)
    fail('--seed takes showcase (default) or large');
  const fullName = normaliseText(
    values.name ?? process.env.SUPER_ADMIN_NAME ?? '',
  );
  const phone = normalisePhone(
    values.phone ?? process.env.SUPER_ADMIN_PHONE ?? '',
  );
  if (fullName.length < 2 || !phone) {
    fail(
      'Give the super admin with --name and --phone (or SUPER_ADMIN_NAME / SUPER_ADMIN_PHONE)',
    );
  }
  const password = await readPassword().catch((e: Error) => fail(e.message));
  await resetLocal({
    superAdmin: { fullName, phone: phone!, password },
    seedScale: scale,
    importFolder: values.import ?? null,
    contractsDir: values['contracts-dir'],
    credentialsDir: process.cwd(),
    skipDeploy: values['skip-deploy'],
    log: (m) => console.log(m),
  }).catch((e: unknown) => fail(e instanceof Error ? e.message : String(e)));
}

void main();
