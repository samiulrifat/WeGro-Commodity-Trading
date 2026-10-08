import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from './snake-naming.strategy';

/** Used by the TypeORM CLI (`npm run migration:*`), not by the running app. */
const envFile = join(__dirname, '..', '..', '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  namingStrategy: new SnakeNamingStrategy(),
});
