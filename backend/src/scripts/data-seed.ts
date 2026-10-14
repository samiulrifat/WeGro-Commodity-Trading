/**
 * Loads the sample world into a local setup, through the real services.
 *
 *   npm run data:seed                    the showcase (every flow at least once)
 *   npm run data:seed -- --size large    about five times as much
 *
 * Local only (the Hardhat node, NODE_ENV not production). Runs once per
 * database: reset first to load it again (npm run data:reset).
 */
import { parseArgs } from 'node:util';
import { writeCredentials } from '../data/credentials-file';
import { SEED_SIZES as SIZES, Seeder } from '../data/seed/seeder';
import { appContext, fail } from './app-context';
import { assertLocal, loadEnv } from './local-only';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { size: { type: 'string', default: 'showcase' } },
  });
  const scale = SIZES[values.size as keyof typeof SIZES];
  if (!scale) fail('--size must be showcase or large');
  loadEnv();
  await assertLocal().catch((e: Error) => fail(e.message));
  const app = await appContext();
  try {
    const summary = await new Seeder(app, {
      scale,
      log: (m) => console.log(m),
    }).run();
    const file = writeCredentials(
      process.cwd(),
      'sample-credentials',
      summary.credentials,
    );
    console.log(
      `Sample data loaded: ${summary.people} people, ${summary.projects} projects.`,
    );
    console.log(`Sign-in details (one-time passwords): ${file}`);
    for (const [story, n] of Object.entries(summary.stories))
      console.log(`  ${story}: ${n}`);
    if (summary.skipped.length)
      console.log(`  not done here: ${summary.skipped.join(', ')}`);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  } finally {
    await app.close();
  }
}

void main();
