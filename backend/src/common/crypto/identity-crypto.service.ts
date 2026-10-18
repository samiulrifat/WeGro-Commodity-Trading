import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../../config/env.validation';

/** Ciphertext format version; also names the key it was made with. */
const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HKDF_SALT = 'wegro-identity';

/** What a lookup index is for: the same value under two kinds never matches. */
export type BlindIndexKind = 'phone' | 'nid' | 'reset-code';

/**
 * Encryption of personal details at rest, and the keyed hashes that let us
 * look them up without decrypting.
 *
 * Every key is derived (HKDF-SHA256) from IDENTITY_MASTER_KEY with its own
 * label, so the encryption key, the index key, the fingerprint salt key and
 * the password pepper are independent: one leaking reveals nothing about the
 * others.
 *
 * Encryption is AES-256-GCM with a fresh random IV per value. The row id and
 * column name are bound in as associated data, so a ciphertext copied to
 * another row or column fails to decrypt instead of silently showing the
 * wrong person's data.
 */
@Injectable()
export class IdentityCryptoService {
  private readonly encryptionKey: Buffer;
  private readonly indexKey: Buffer;
  private readonly saltKey: Buffer;
  readonly passwordPepper: Buffer;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    const master = Buffer.from(
      config.get('IDENTITY_MASTER_KEY', { infer: true }),
      'hex',
    );
    const derive = (label: string) =>
      Buffer.from(hkdfSync('sha256', master, HKDF_SALT, label, 32));
    this.encryptionKey = derive('pii-encryption-v1');
    this.indexKey = derive('pii-blind-index-v1');
    this.saltKey = derive('details-fingerprint-salt-v1');
    this.passwordPepper = derive('password-pepper-v1');
  }

  /** `v1.<base64url(iv | ciphertext | tag)>` */
  encrypt(plaintext: string, context: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    cipher.setAAD(Buffer.from(context, 'utf8'));
    const body = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    return `${VERSION}.${Buffer.concat([iv, body, cipher.getAuthTag()]).toString('base64url')}`;
  }

  /** Throws if the value was altered, moved to another row or column, or made with another key. */
  decrypt(ciphertext: string, context: string): string {
    const dot = ciphertext.indexOf('.');
    if (dot < 0 || ciphertext.slice(0, dot) !== VERSION) {
      throw new Error('Unsupported ciphertext version');
    }
    const raw = Buffer.from(ciphertext.slice(dot + 1), 'base64url');
    if (raw.length < IV_BYTES + TAG_BYTES) {
      throw new Error('Ciphertext too short');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      raw.subarray(0, IV_BYTES),
    );
    decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(raw.subarray(raw.length - TAG_BYTES));
    return Buffer.concat([
      decipher.update(raw.subarray(IV_BYTES, raw.length - TAG_BYTES)),
      decipher.final(),
    ]).toString('utf8');
  }

  /**
   * Keyed hash of a normalised value, for exact-match lookups and unique
   * constraints (one account per phone, one person per NID). Without the key
   * the index cannot be reversed or brute-forced from a database copy.
   */
  blindIndex(kind: BlindIndexKind, normalised: string): string {
    return createHmac('sha256', this.indexKey)
      .update(`${kind}:${normalised}`)
      .digest('hex');
  }

  /**
   * Secret salt mixed into a person's on-chain details fingerprint. NIDs,
   * names and birth dates are guessable; without this salt anyone reading
   * the ledger could test guesses against the hash. Derived, not stored, so
   * a database copy alone does not reveal it either.
   */
  detailsSalt(userId: string): string {
    return createHmac('sha256', this.saltKey)
      .update(`details-salt:${userId}`)
      .digest('hex');
  }
}
