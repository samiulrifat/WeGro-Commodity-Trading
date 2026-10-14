import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { deriveAccountRoot } from '../blockchain/keys/key.service';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PasswordHasher,
} from '../common/crypto/password-hasher.service';
import type { EnvironmentVariables } from '../config/env.validation';
import { PersonalDetails } from '../modules/users/entities/personal-details.entity';
import { ChainState, User } from '../modules/users/entities/user.entity';
import { PersonalDetailsCodec } from '../modules/users/personal-details.codec';
import { ParticipantStatus, Role } from '../modules/users/roles';

/**
 * Creates the super admin (key index 0), or replaces a demo one. Refuses if
 * a real one exists. Used by user:super-admin and data:reset.
 */
export async function ensureSuperAdmin(
  app: INestApplicationContext,
  input: { fullName: string; phone: string; password: string },
): Promise<{ id: string; account: string }> {
  const { fullName, phone, password } = input;
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
      throw new Error('A super admin already exists');
    }
    const fields = {
      role: Role.SuperAdmin,
      status: ParticipantStatus.Verified,
      chainState: ChainState.Operator,
      phoneIndex: codec.phoneIndex(phone),
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
        codec.sealOperator(existing.id, fullName, phone),
      );
      return existing.id;
    }
    const user = await m.save(m.create(User, fields));
    await m.insert(
      PersonalDetails,
      codec.sealOperator(user.id, fullName, phone),
    );
    return user.id;
  });
  return { id, account };
}

/**
 * The super admin's password: typed twice without echo, or SUPER_ADMIN_PASSWORD
 * for automation. Never an argument (shell history, process lists).
 */
export async function readPassword(): Promise<string> {
  const fromEnv = process.env.SUPER_ADMIN_PASSWORD;
  const password = fromEnv ?? (await readHidden('Password: '));
  if (!fromEnv && password !== (await readHidden('Repeat password: '))) {
    throw new Error('Passwords do not match');
  }
  const length = password.normalize('NFKC').length;
  if (length < PASSWORD_MIN_LENGTH || length > PASSWORD_MAX_LENGTH) {
    throw new Error(
      `Password must be ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters`,
    );
  }
  return password;
}

/** Reads a line from the terminal without echoing it. */
function readHidden(label: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    throw new Error('Run in a terminal, or set SUPER_ADMIN_PASSWORD');
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
