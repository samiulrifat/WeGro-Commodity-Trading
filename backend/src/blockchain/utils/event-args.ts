import { type LogDescription, Result } from 'ethers';

/**
 * A decoded event's arguments as a plain object keyed by parameter name.
 * Built from the event's own ABI rather than ethers' Result.toObject, which
 * turns array parameters (e.g. bytes32[]) into objects with numeric keys.
 * Nested Results become arrays; bigints stay bigints.
 */
export function eventArgs(parsed: LogDescription): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  parsed.fragment.inputs.forEach((input, i) => {
    out[input.name || `arg${i}`] = plain(parsed.args[i]);
  });
  return out;
}

function plain(value: unknown): unknown {
  return value instanceof Result ? value.toArray().map(plain) : value;
}
