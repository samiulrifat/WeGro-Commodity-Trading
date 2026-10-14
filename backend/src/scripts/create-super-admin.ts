/**
 * Creates the super admin: the platform operator, who signs with key index 0
 * (the contracts' DEFAULT_ADMIN_ROLE) and registers staff.
 *
 *   npm run user:super-admin -- --name "Tania Rahman" --phone 01711000000
 *
 * The password is typed twice without being shown, or, for automation, read
 * from SUPER_ADMIN_PASSWORD. It is never accepted as an argument (arguments
 * end up in shell history and process lists).
 *
 * There is only ever one super admin. A demo one (DEMO_MODE) is replaced.
 */
import { parseArgs } from 'node:util';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { CryptoModule } from '../common/crypto/crypto.module';
import { validateEnv } from '../config/env.validation';
import { DatabaseModule } from '../database/database.module';
import {
  normalisePhone,
  normaliseText,
} from '../modules/participants/id-check/id-check';
import { UsersModule } from '../modules/users/users.module';
import { ensureSuperAdmin, readPassword } from './super-admin';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DatabaseModule,
    CryptoModule,
    UsersModule,
  ],
})
class ScriptModule {}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { name: { type: 'string' }, phone: { type: 'string' } },
  });
  const fullName = normaliseText(values.name ?? '');
  const phone = normalisePhone(values.phone ?? '');
  if (fullName.length < 2 || fullName.length > 100) {
    fail('--name is required (2 to 100 characters)');
  }
  if (!phone) fail('--phone must be a Bangladeshi mobile number');

  const password = await readPassword().catch((error: unknown) =>
    fail(error instanceof Error ? error.message : String(error)),
  );

  const app = await NestFactory.createApplicationContext(ScriptModule, {
    logger: ['error', 'warn'],
  });
  try {
    const { id, account } = await ensureSuperAdmin(app, {
      fullName,
      phone: phone!,
      password,
    }).catch((error: unknown) =>
      fail(error instanceof Error ? error.message : String(error)),
    );
    console.log(`Super admin ready (id ${id}, key ${account}).`);
  } finally {
    await app.close();
  }
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
