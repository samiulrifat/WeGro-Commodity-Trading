import type { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../../config/env.validation';
import { IdentityCryptoService } from './identity-crypto.service';
import { PasswordHasher } from './password-hasher.service';
import { generateTemporaryPassword } from './temporary-password';

const configWith = (key: string) =>
  ({ get: () => key }) as unknown as ConfigService<EnvironmentVariables, true>;

const crypto = new IdentityCryptoService(configWith('ab'.repeat(32)));
const otherKey = new IdentityCryptoService(configWith('cd'.repeat(32)));

describe('IdentityCryptoService', () => {
  const ctx = 'personal_details.nidEnc:7d3f…';

  it('round-trips text, including Bengali', () => {
    for (const text of ['19901012345678901', 'মোঃ রহিম উদ্দিন', '']) {
      expect(crypto.decrypt(crypto.encrypt(text, ctx), ctx)).toBe(text);
    }
  });

  it('uses a fresh IV: the same value never encrypts the same way twice', () => {
    expect(crypto.encrypt('same', ctx)).not.toBe(crypto.encrypt('same', ctx));
  });

  it('refuses a ciphertext moved to another row or column', () => {
    const sealed = crypto.encrypt('19901012345678901', ctx);
    expect(() =>
      crypto.decrypt(sealed, 'personal_details.nidEnc:other-user'),
    ).toThrow();
    expect(() =>
      crypto.decrypt(sealed, 'personal_details.phoneEnc:7d3f…'),
    ).toThrow();
  });

  it('refuses tampered, truncated, foreign or unversioned ciphertexts', () => {
    const sealed = crypto.encrypt('secret', ctx);
    const body = Buffer.from(sealed.slice(3), 'base64url');
    body[body.length - 20] ^= 1;
    expect(() =>
      crypto.decrypt(`v1.${body.toString('base64url')}`, ctx),
    ).toThrow();
    expect(() => crypto.decrypt('v1.AAAA', ctx)).toThrow();
    expect(() => otherKey.decrypt(sealed, ctx)).toThrow();
    expect(() => crypto.decrypt(sealed.slice(3), ctx)).toThrow('version');
    expect(() => crypto.decrypt(`v2${sealed.slice(2)}`, ctx)).toThrow(
      'version',
    );
  });

  it('makes deterministic, keyed, domain-separated lookup indexes', () => {
    const a = crypto.blindIndex('phone', '+8801712345678');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(crypto.blindIndex('phone', '+8801712345678')).toBe(a);
    expect(crypto.blindIndex('nid', '+8801712345678')).not.toBe(a);
    expect(otherKey.blindIndex('phone', '+8801712345678')).not.toBe(a);
  });

  it('derives independent keys: salt, index and pepper all differ', () => {
    const salt = crypto.detailsSalt('user-1');
    expect(salt).not.toBe(crypto.detailsSalt('user-2'));
    expect(salt).not.toBe(otherKey.detailsSalt('user-1'));
    expect(crypto.passwordPepper.toString('hex')).not.toBe(salt);
    expect(crypto.passwordPepper).toHaveLength(32);
  });
});

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher(crypto);
  const otherPepper = new PasswordHasher(otherKey);
  let hash: string;

  beforeAll(async () => {
    await hasher.onModuleInit();
    hash = await hasher.hash('correct horse battery');
  });

  it('writes an Argon2id PHC string with its settings and pepper version', () => {
    expect(hash).toMatch(
      /^\$argon2id\$v=19\$m=19456,t=2,p=1,k=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/,
    );
    expect(hasher.needsRehash(hash)).toBe(false);
  });

  it('accepts the right password and rejects others', async () => {
    await expect(hasher.verify('correct horse battery', hash)).resolves.toBe(
      true,
    );
    await expect(hasher.verify('correct horse batterY', hash)).resolves.toBe(
      false,
    );
    await expect(hasher.verify('', hash)).resolves.toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hasher.hash('correct horse battery')).not.toBe(hash);
  });

  it('needs the pepper: the hash alone is not enough', async () => {
    await expect(
      otherPepper.verify('correct horse battery', hash),
    ).resolves.toBe(false);
  });

  it('matches the same password typed in different Unicode forms', async () => {
    const composed = await hasher.hash('পাসওয়ার্ড-café');
    await expect(hasher.verify('পাসওয়ার্ড-café', composed)).resolves.toBe(
      true,
    );
  });

  it('never matches malformed hashes and asks to redo old settings', async () => {
    await expect(hasher.verify('x', 'not-a-hash')).resolves.toBe(false);
    await expect(
      hasher.verify('correct horse battery', hash.replace('k=1', 'k=2')),
    ).resolves.toBe(false);
    expect(hasher.needsRehash(hash.replace('t=2', 't=1'))).toBe(true);
    expect(hasher.needsRehash('$2b$10$bcrypt-style')).toBe(true);
  });

  it('spends time on unknown accounts and always fails them', async () => {
    await expect(hasher.verifyDummy('anything')).resolves.toBe(false);
  });
});

describe('generateTemporaryPassword', () => {
  it('makes 12 unambiguous random symbols in three groups', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = generateTemporaryPassword();
      expect(p).toMatch(
        /^[A-HJ-NP-Za-km-z2-9]{4}-[A-HJ-NP-Za-km-z2-9]{4}-[A-HJ-NP-Za-km-z2-9]{4}$/,
      );
      expect(p).not.toMatch(/[01OIl]/);
      seen.add(p);
    }
    expect(seen.size).toBe(200);
  });
});
