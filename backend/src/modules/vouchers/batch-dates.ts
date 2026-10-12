import { bdDayEnd, bdDayStart, isPastDay } from '../../common/time/bd-dates';

export { bdDate } from '../../common/time/bd-dates';

/** Ledger producedAt: start of the production day. */
export const producedAtSeconds = (producedOn: string): number =>
  bdDayStart(producedOn);

/** Ledger expiresAt: end of the expiry day (usable through it), or 0 for no expiry. */
export const expiresAtSeconds = (expiresOn: string | null): number =>
  expiresOn === null ? 0 : bdDayEnd(expiresOn);

/** True once the chain's clock has passed the end of the expiry day. */
export const isExpired = (expiresOn: string | null, chainNow: Date): boolean =>
  isPastDay(expiresOn, chainNow);
