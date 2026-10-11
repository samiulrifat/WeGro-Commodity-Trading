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
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { deriveAccountRoot } from '../blockchain/keys/key.service';
import { CryptoModule } from '../common/crypto/crypto.module';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PasswordHasher,
} from '../common/crypto/password-hasher.service';
import {
  type EnvironmentVariables,
  validateEnv,
} from '../config/env.validation';
import { DatabaseModule } from '../database/database.module';
import {
  normalisePhone,
  normaliseText,
} from '../modules/participants/id-check/id-check';
import { PersonalDetails } from '../modules/users/entities/personal-details.entity';
import { ChainState, User } from '../modules/users/entities/user.entity';
import { PersonalDetailsCodec } from '../modules/users/personal-details.codec';
import { ParticipantStatus, Role } from '../modules/users/roles';
import { UsersModule } from '../modules/users/users.module';

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

  const password = await readPassword();

  const app = await NestFactory.createApplicationContext(ScriptModule, {
    logger: ['error', 'warn'],
  });
  try {
    const config = app.get(ConfigService<EnvironmentVariables, true>);
    const codec = app.get(PersonalDetailsCodec);
    const hasher = app.get(PasswordHasher);
    const dataSource = app.get(DataSource);
    const account = deriveAccountRoot(
      config.get('KEY_MASTER_MNEMONIC', { infer: true }),
    ).deriveChild(0).address;
    const passwordHash = await hasher.hash(password);

    const id = await dataSource.transaction(async (m) => {
      const existing = await m.findOne(User, {
        where: { role: Role.SuperAdmin },
      });
      if (existing && !existing.isDemo) {
        fail('A super admin already exists');
      }
      const fields = {
        role: Role.SuperAdmin,
        status: ParticipantStatus.Verified,
        chainState: ChainState.Operator,
        phoneIndex: codec.phoneIndex(phone!),
        passwordHash,
        mustChangePassword: false,
        keyIndex: 0,
        account,
        isDemo: false,
      };
      if (existing) {
        await m.update(User, { id: existing.id }, fields);
        await m.increment(User, { id: existing.id }, 'tokenVersion', 1);
        await m.update(
          PersonalDetails,
          { userId: existing.id },
          codec.sealOperator(existing.id, fullName, phone!),
        );
        return existing.id;
      }
      const user = await m.save(m.create(User, fields));
      await m.insert(
        PersonalDetails,
        codec.sealOperator(user.id, fullName, phone!),
      );
      return user.id;
    });
    console.log(`Super admin ready (id ${id}, key ${account}).`);
  } finally {
    await app.close();
  }
}

async function readPassword(): Promise<string> {
  const fromEnv = process.env.SUPER_ADMIN_PASSWORD;
  const password = fromEnv ?? (await readHidden('Password: '));
  if (!fromEnv && password !== (await readHidden('Repeat password: '))) {
    fail('Passwords do not match');
  }
  const length = password.normalize('NFKC').length;
  if (length < PASSWORD_MIN_LENGTH || length > PASSWORD_MAX_LENGTH) {
    fail(
      `Password must be ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters`,
    );
  }
  return password;
}

/** Reads a line from the terminal without echoing it. */
function readHidden(label: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    fail('Run in a terminal, or set SUPER_ADMIN_PASSWORD');
  }
  process.stdout.write(label);
  stdin.setRawMode(true);
  stdin.setEncoding('utf8');
  stdin.resume();
  return new Promise((resolve) => {
    let value = '';
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.off('data', onData);
          stdin.setRawMode(false);
          stdin.pause();
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          process.stdout.write('\n');
          process.exit(130);
        }
        value =
          ch === '\u007f' || ch === '\b' ? value.slice(0, -1) : value + ch;
      }
    };
    stdin.on('data', onData);
  });
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
