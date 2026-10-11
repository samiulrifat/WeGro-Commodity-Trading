import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { IdentityCryptoService } from './identity-crypto.service';

const argon2Async = promisify(argon2);

/** OWASP's recommended Argon2id setting: 19 MiB, 2 passes, 1 lane. */
const PARAMS = { memory: 19456, passes: 2, parallelism: 1 } as const;
const SALT_BYTES = 16;
const HASH_BYTES = 32;
/** Pepper version written into each hash, so the pepper can be rotated later. */
const PEPPER_VERSION = 1;

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

const PHC =
  /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+),k=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

/**
 * Password hashing with Argon2id (memory-hard, so GPU cracking is costly),
 * built into Node. A server-side pepper is mixed in as the Argon2 secret: a
 * stolen database alone is not enough to start guessing.
 *
 * Passwords are Unicode-normalised (NFKC) first, so the same password typed
 * on different keyboards (e.g. Bengali input methods) always matches.
 *
 * Stored as a PHC string:
 *   $argon2id$v=19$m=19456,t=2,p=1,k=1$<salt>$<hash>
 */
@Injectable()
export class PasswordHasher implements OnModuleInit {
  /** Hash of a random password: login compares against it when the user does not exist. */
  private dummyHash = '';

  constructor(private readonly crypto: IdentityCryptoService) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.hash(randomBytes(24).toString('base64'));
  }

  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const tag = await this.derive(password, salt, PARAMS);
    return `$argon2id$v=19$m=${PARAMS.memory},t=${PARAMS.passes},p=${PARAMS.parallelism},k=${PEPPER_VERSION}$${salt.toString('base64')}$${tag.toString('base64')}`.replace(
      /=+(?=\$|$)/g,
      '',
    );
  }

  /** Constant-time comparison. A malformed stored hash never matches. */
  async verify(password: string, encoded: string): Promise<boolean> {
    const m = PHC.exec(encoded);
    if (!m || Number(m[4]) !== PEPPER_VERSION) return false;
    const params = {
      memory: Number(m[1]),
      passes: Number(m[2]),
      parallelism: Number(m[3]),
    };
    const salt = Buffer.from(m[5], 'base64');
    const expected = Buffer.from(m[6], 'base64');
    if (expected.length !== HASH_BYTES) return false;
    const actual = await this.derive(password, salt, params);
    return timingSafeEqual(actual, expected);
  }

  /**
   * Spends the same time as a real check, for logins to unknown accounts, so
   * response time does not reveal which phone numbers are registered.
   */
  async verifyDummy(password: string): Promise<false> {
    await this.verify(password, this.dummyHash);
    return false;
  }

  /** True when the hash was made with older settings and should be redone at next login. */
  needsRehash(encoded: string): boolean {
    const m = PHC.exec(encoded);
    return (
      !m ||
      Number(m[1]) !== PARAMS.memory ||
      Number(m[2]) !== PARAMS.passes ||
      Number(m[3]) !== PARAMS.parallelism ||
      Number(m[4]) !== PEPPER_VERSION
    );
  }

  private derive(
    password: string,
    salt: Buffer,
    params: { memory: number; passes: number; parallelism: number },
  ): Promise<Buffer> {
    const normalised = password.normalize('NFKC');
    if (
      normalised.length === 0 ||
      normalised.length > PASSWORD_MAX_LENGTH * 4
    ) {
      // Bounded input: hashing cost must not be driven by the caller.
      return Promise.resolve(randomBytes(HASH_BYTES));
    }
    return argon2Async('argon2id', {
      message: Buffer.from(normalised, 'utf8'),
      nonce: salt,
      secret: this.crypto.passwordPepper,
      tagLength: HASH_BYTES,
      ...params,
    });
  }
}
