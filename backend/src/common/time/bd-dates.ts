/**
 * Calendar days in Bangladesh (UTC+6, no DST) against ledger instants. A day
 * starts at midnight in Dhaka; something valid "until day E" is valid through
 * the whole of E, so it ends at the start of E + 1.
 */
const BD_OFFSET_S = 6 * 3600;
const DAY_S = 86_400;

/** Ledger seconds at the start of a day (YYYY-MM-DD). */
export function bdDayStart(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 1000 - BD_OFFSET_S;
}

/** Ledger seconds at the end of a day: the start of the next one. */
export const bdDayEnd = (date: string): number => bdDayStart(date) + DAY_S;

/** The calendar day in Bangladesh for an instant (e.g. the chain's now). */
export function bdDate(at: Date): string {
  return new Date(at.getTime() + BD_OFFSET_S * 1000).toISOString().slice(0, 10);
}

/** The last day an instant-based deadline still covers. */
export const bdLastDay = (endSeconds: number): string =>
  bdDate(new Date((endSeconds - 1) * 1000));

/** True once `now` has passed the end of day `date`; never for null. */
export function isPastDay(date: string | null, now: Date): boolean {
  return date !== null && now.getTime() / 1000 >= bdDayEnd(date);
}

/** A calendar date plus whole months, clamped to the month's last day (Jan 31 + 1 = Feb 28). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}
