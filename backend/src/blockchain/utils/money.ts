/**
 * Taka <-> poisha. The ledger stores whole poisha (Tk 1.25 = 125n) and the
 * database stores taka as decimal strings. Floats are never used: they cannot
 * hold 0.1 exactly.
 */

const TAKA = /^(0|[1-9]\d*)(\.\d{1,2})?$/;

/** "1234.5" -> 123450n. Up to 2 decimals, no sign, no separators. */
export function takaToPoisha(taka: string): bigint {
  const value = taka.trim();
  if (!TAKA.test(value)) {
    throw new Error(
      `Invalid taka amount "${taka}": use digits with up to 2 decimals`,
    );
  }
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

/** 123450n -> "1234.50" */
export function poishaToTaka(poisha: bigint): string {
  if (poisha < 0n) throw new Error('Amounts are never negative');
  const whole = poisha / 100n;
  const fraction = (poisha % 100n).toString().padStart(2, '0');
  return `${whole}.${fraction}`;
}
