import { randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { configureApp } from '../../src/app.setup';
import { KEY_INDEX_SEQUENCE } from '../../src/blockchain/keys/key.service';
import { SnakeNamingStrategy } from '../../src/database/snake-naming.strategy';

/**
 * Boots the real AppModule against the local chain and a throwaway database
 * schema with all migrations applied. Needs the Hardhat node running with
 * the platform deployed, and the database from .env.
 */
export interface ChainApp {
  app: INestApplication<App>;
  schema: string;
  close(): Promise<void>;
}

export async function startChainApp(
  env: Record<string, string>,
): Promise<ChainApp> {
  const fileEnv = parseEnv(
    readFileSync(join(__dirname, '..', '..', '.env'), 'utf8'),
  );
  const schema = `test_${process.pid}_${randomInt(1e9)}`;
  const url = withSearchPath(fileEnv.DATABASE_URL!, schema);

  // Schema and migrations first, in a connection of their own.
  const setup = new DataSource({
    type: 'postgres',
    url,
    migrations: [join(__dirname, '../../src/database/migrations/*.ts')],
    namingStrategy: new SnakeNamingStrategy(),
  });
  await setup.initialize();
  await setup.query(`CREATE SCHEMA "${schema}"`);
  await setup.runMigrations();
  // The chain outlives this schema and keys are single-use on-chain: start
  // key indexes somewhere no earlier run has reached.
  await setup.query(
    `ALTER SEQUENCE "${KEY_INDEX_SEQUENCE}" RESTART WITH ${randomInt(1_000_000, 2 ** 31 - 100_000)}`,
  );
  await setup.destroy();

  Object.assign(process.env, {
    INDEXER_ENABLED: 'false',
    JOBS_ENABLED: 'false',
    THROTTLE_LIMIT: '100000',
    AUTH_THROTTLE_LIMIT: '100000',
    ...env,
    DATABASE_URL: url,
  });
  // Imported only now: ConfigModule reads the environment when AppModule loads.
  const { AppModule } = await import('../../src/app.module.js');
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>({
    logger: ['error'],
  });
  configureApp(app);
  await app.init();

  return {
    app,
    schema,
    async close() {
      await app.close();
      const teardown = new DataSource({ type: 'postgres', url });
      await teardown.initialize();
      await teardown.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await teardown.destroy();
    },
  };
}

/** Same database, but every unqualified name resolves in `schema`. */
function withSearchPath(databaseUrl: string, schema: string): string {
  // Appended as text: pg accepts URLs that the WHATWG URL parser rejects.
  const options = encodeURIComponent(`-c search_path=${schema}`);
  return `${databaseUrl}${databaseUrl.includes('?') ? '&' : '?'}options=${options}`;
}

/** DEMO_MODE builds its accounts in the background at startup: wait for all of them. */
export async function waitForDemoAccounts(
  chain: ChainApp,
  timeoutMs = 60_000,
): Promise<void> {
  const { User } =
    await import('../../src/modules/users/entities/user.entity.js');
  const { ParticipantStatus, Role } =
    await import('../../src/modules/users/roles.js');
  const users = chain.app.get(DataSource).getRepository(User);
  const expected = Object.values(Role).length;
  const deadline = Date.now() + timeoutMs;
  while (
    (await users.countBy({
      isDemo: true,
      status: ParticipantStatus.Verified,
    })) < expected
  ) {
    if (Date.now() > deadline)
      throw new Error('Demo accounts were not created in time');
    await new Promise((r) => setTimeout(r, 250));
  }
}

/** Access token for the demo account of a role. */
export async function demoToken(
  http: ReturnType<typeof import('supertest')>,
  role: string,
): Promise<string> {
  const res = await http
    .post('/api/auth/demo/login')
    .send({ role })
    .expect(200);
  return res.body.data.accessToken as string;
}
