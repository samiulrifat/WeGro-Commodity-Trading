import type { ValueTransformer } from 'typeorm';

/** bigint columns as JS BigInt: money in poisha never passes through a float. */
export const bigintTransformer: ValueTransformer = {
  to: (value: bigint | null | undefined) =>
    value === null || value === undefined ? value : value.toString(),
  from: (value: string | null) => (value === null ? null : BigInt(value)),
};

/** bigint columns that always fit a JS number (ids, block numbers). */
export const numericBigintTransformer: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};
