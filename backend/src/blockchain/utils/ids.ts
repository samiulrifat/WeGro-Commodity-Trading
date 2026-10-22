import {
  decodeBytes32String,
  encodeBytes32String,
  id,
  isHexString,
} from 'ethers';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BYTES32 = /^0x[0-9a-f]{64}$/i;
/** Codes stored readably on-chain: upper-case letters, digits, '_' and '-'. */
const CODE = /^[A-Z0-9_-]{1,31}$/;

export const ZERO_BYTES32 = `0x${'0'.repeat(64)}`;

/**
 * A database uuid (128 bits) as a contract bytes32: left-padded with zeros.
 * Reversible with `bytes32ToUuid`, so on-chain ids map back to rows without a
 * lookup table.
 */
export function uuidToBytes32(uuid: string): string {
  if (!UUID.test(uuid)) throw new Error(`Not a uuid: ${uuid}`);
  return `0x${'0'.repeat(32)}${uuid.replace(/-/g, '').toLowerCase()}`;
}

export function bytes32ToUuid(value: string): string {
  if (!BYTES32.test(value) || !/^0x0{32}/.test(value)) {
    throw new Error(`Not a uuid-shaped bytes32: ${value}`);
  }
  const h = value.slice(34).toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** A short readable code ("MAIZE", "BOGURA", "GROWTH_CHECK") as bytes32. */
export function codeToBytes32(code: string): string {
  if (!CODE.test(code)) {
    throw new Error(
      `Invalid code "${code}": 1-31 characters of A-Z, 0-9, '_' or '-'`,
    );
  }
  return encodeBytes32String(code);
}

export function bytes32ToCode(value: string): string {
  return decodeBytes32String(value);
}

export function isBytes32(value: unknown): value is string {
  return typeof value === 'string' && isHexString(value, 32);
}

/**
 * How the ledger names the super admin in "who prepared / approved"
 * records: Roles.SUPER_ADMIN_ID, keccak256("SUPER_ADMIN"). The super admin
 * holds every office power but is not a registered participant.
 */
export const SUPER_ADMIN_ID = id('SUPER_ADMIN');
