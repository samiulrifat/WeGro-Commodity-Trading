import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

/**
 * The whole application without its HTTP server, for scripts that go through
 * the real services. The indexer, the scheduled jobs and the demo accounts
 * stay off unless the caller turns them on: a script does its own work and
 * leaves (a reset would otherwise race the demo setup for the super admin;
 * the backend makes the demo accounts when it next starts).
 */
export async function appContext(
  env: Record<string, string> = {},
): Promise<INestApplicationContext> {
  Object.assign(process.env, {
    INDEXER_ENABLED: 'false',
    JOBS_ENABLED: 'false',
    DEMO_MODE: 'false',
    ...env,
  });
  // Imported only now: ConfigModule reads the environment when AppModule loads.
  const { AppModule } = await import('../app.module.js');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  await app.init();
  return app;
}

export function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
