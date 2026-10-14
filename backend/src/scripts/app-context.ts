import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

/**
 * The whole application without its HTTP server, for scripts that go through
 * the real services. The indexer and the scheduled jobs stay off unless the
 * caller turns them on: a script does its own work and leaves.
 */
export async function appContext(
  env: Record<string, string> = {},
): Promise<INestApplicationContext> {
  Object.assign(process.env, {
    INDEXER_ENABLED: 'false',
    JOBS_ENABLED: 'false',
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
