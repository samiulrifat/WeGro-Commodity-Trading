import type { ProjectDto } from '@/api/generated/projects';
import { latinDigits } from '@/lib/format';

/** Taka as the API sends it ("20000.00") to whole poisha, exactly. */
export function toPoisha(taka: string): bigint {
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(taka.trim());
  if (!m) return 0n;
  const [, sign, whole, frac = ''] = m;
  const v = BigInt(whole!) * 100n + BigInt(frac.padEnd(2, '0'));
  return sign ? -v : v;
}

/** Whole poisha back to taka text ("20000.00"), as the formatters take it. */
export function toTaka(poisha: bigint): string {
  const neg = poisha < 0n;
  const abs = neg ? -poisha : poisha;
  return `${neg ? '-' : ''}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}

/** A percentage as the API sends it ("8.00") to basis points. */
export const toBps = (percent: string): bigint => toPoisha(percent);

/** `amount` × `bps` / 10 000, rounded down to the poisha as the backend does. */
export const applyBps = (amount: bigint, bps: bigint) =>
  (amount * bps) / 10_000n;

/**
 * The high estimate spread over a year: 10.5% in 5 months is 25.2% a
 * year. One decimal, rounded down, so it never says more than the estimate.
 */
export function annualized(
  p: Pick<ProjectDto, 'estimatedReturn' | 'durationMonths'>,
): string {
  const bps = toBps(p.estimatedReturn.maxPercent);
  const tenths = (bps * 12n) / BigInt(p.durationMonths) / 10n;
  return `${tenths / 10n}.${tenths % 10n}`;
}

/** Payouts over the project: one at the end, or every interval. */
export function installments(
  p: Pick<ProjectDto, 'durationMonths' | 'payoutIntervalMonths'>,
): number {
  return p.payoutIntervalMonths > 0
    ? Math.ceil(p.durationMonths / p.payoutIntervalMonths)
    : 1;
}

export interface Simulation {
  invest: string;
  profitMin: string;
  profitMax: string;
  valueMin: string;
  valueMax: string;
}

/** What `units` slots cost, and the estimated profit and value at the end (low–high). */
export function simulate(
  p: Pick<ProjectDto, 'slotPrice' | 'estimatedReturn'>,
  units: number,
): Simulation {
  const invest = toPoisha(p.slotPrice) * BigInt(Math.max(0, units));
  const min = applyBps(invest, toBps(p.estimatedReturn.minPercent));
  const max = applyBps(invest, toBps(p.estimatedReturn.maxPercent));
  return {
    invest: toTaka(invest),
    profitMin: toTaka(min),
    profitMax: toTaka(max),
    valueMin: toTaka(invest + min),
    valueMax: toTaka(invest + max),
  };
}

/** A taka amount typed by a person (Bengali digits, commas allowed), or null. */
export function typedTaka(text: string): string | null {
  const t = latinDigits(text).replace(/[,\s৳]/g, '');
  return /^(0|[1-9]\d{0,13})(\.\d{1,2})?$/.test(t) ? t : null;
}

/** Percent from the API without a needless ".00": "8.00" → "8", "10.50" → "10.5". */
export const shortPercent = (percent: string) =>
  percent.includes('.')
    ? percent.replace(/0+$/, '').replace(/\.$/, '')
    : percent;

/** The units an investor may take now: the slots free. */
export const maxUnits = (p: Pick<ProjectDto, 'availableSlots'>) =>
  Math.max(0, p.availableSlots);
