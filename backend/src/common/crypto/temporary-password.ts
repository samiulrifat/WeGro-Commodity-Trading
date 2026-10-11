import { randomInt } from 'node:crypto';

/** No 0/O, 1/l/I: easy to read aloud and copy by hand. 55 symbols. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/**
 * A one-time password like `Kp7w-Xq3m-Rt9z`: 12 random symbols (about 69
 * bits) from a CSPRNG, with no modulo bias (randomInt is uniform).
 */
export function generateTemporaryPassword(): string {
  const chars = Array.from(
    { length: 12 },
    () => ALPHABET[randomInt(ALPHABET.length)],
  );
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8).join('')}`;
}
