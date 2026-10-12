/**
 * Batch dates are calendar days in Bangladesh (UTC+6, no DST); the ledger
 * stores instants. A batch produced on day P counts from the start of P; a
 * batch that expires on day E is usable through the whole of E, so it stops
 * at the start of E + 1.
 */
const BD_OFFSET_S = 6 * 3600;
const DAY_S = 86_400;

function startOfDay(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 1000 - BD_OFFSET_S;
}

/** Ledger producedAt: start of the production day. */
export const producedAtSeconds = (producedOn: string): number =>
  startOfDay(producedOn);

/** Ledger expiresAt: start of the day after expiry, or 0 for no expiry. */
export const expiresAtSeconds = (expiresOn: string | null): number =>
  expiresOn === null ? 0 : startOfDay(expiresOn) + DAY_S;

/** Today's date in Bangladesh for an instant (e.g. the chain's now). */
export function bdDate(at: Date): string {
  return new Date(at.getTime() + BD_OFFSET_S * 1000).toISOString().slice(0, 10);
}

/** True once the chain's clock has passed the end of the expiry day. */
export function isExpired(expiresOn: string | null, chainNow: Date): boolean {
  return (
    expiresOn !== null &&
    chainNow.getTime() / 1000 >= expiresAtSeconds(expiresOn)
  );
}
