import { createHmac } from 'node:crypto';

/** Same bank reference however it was typed: trimmed, single-spaced, upper-case. */
export function normalisePaymentRef(ref: string): string {
  const value = ref.trim().replace(/\s+/g, ' ').toUpperCase();
  if (value.length === 0 || value.length > 128) {
    throw new Error('A payment reference must be 1-128 characters');
  }
  return value;
}

/**
 * The payment reference as it goes on the ledger: HMAC-SHA256 with the
 * backend's secret, as bytes32. Bank references are short and guessable, so a
 * plain hash could be reversed by trying them all; this cannot without the
 * secret. The same reference always gives the same hash, so the contracts'
 * duplicate checks still work.
 */
export function hashPaymentRef(ref: string, secret: string): string {
  return `0x${createHmac('sha256', secret)
    .update(`payment-ref:${normalisePaymentRef(ref)}`)
    .digest('hex')}`;
}
