import { keccak256, toUtf8Bytes } from 'ethers';

/**
 * Canonical JSON: object keys sorted, no whitespace, so the same data always
 * produces the same bytes. bigint -> decimal string, Date -> ISO string.
 * Values JSON cannot represent exactly (undefined in arrays, NaN, Infinity,
 * functions, symbols) are rejected rather than silently changed.
 */
export function canonicalJson(value: unknown): string {
  return serialise(value, '$');
}

function serialise(value: unknown, path: string): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'bigint':
      return JSON.stringify(value.toString());
    case 'number':
      if (!Number.isFinite(value)) {
        throw new Error(`${path}: ${value} cannot be fingerprinted`);
      }
      return JSON.stringify(value);
    case 'object': {
      if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) {
          throw new Error(`${path}: invalid date`);
        }
        return JSON.stringify(value.toISOString());
      }
      if (Array.isArray(value)) {
        const items = value.map((v, i) => {
          if (v === undefined) throw new Error(`${path}[${i}]: undefined`);
          return serialise(v, `${path}[${i}]`);
        });
        return `[${items.join(',')}]`;
      }
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return `{${entries
        .map(([k, v]) => `${JSON.stringify(k)}:${serialise(v, `${path}.${k}`)}`)
        .join(',')}}`;
    }
    default:
      throw new Error(`${path}: ${typeof value} cannot be fingerprinted`);
  }
}

/**
 * The digital fingerprint that goes on the ledger: keccak256 of the canonical
 * JSON, tagged with a domain so records of different kinds can never share a
 * hash. Recomputing it from the stored record is how Verify works.
 */
export function fingerprint(domain: string, value: unknown): string {
  if (!/^[a-z][a-z0-9_.-]{0,63}$/.test(domain)) {
    throw new Error(`Invalid fingerprint domain "${domain}"`);
  }
  return keccak256(toUtf8Bytes(`wegro:${domain}:${canonicalJson(value)}`));
}
