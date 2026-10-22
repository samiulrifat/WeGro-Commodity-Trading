import type { ReceiptDto } from '@/api/generated/warehouse';
import { latinDigits, todayBd } from '@/lib/format';

export type ReceiptStatus = ReceiptDto['status'];

/** A re-check is due from this many days before the last valid day. */
export const EXPIRING_DAYS = 14;

/** Receipts whose goods are still at the site. */
export const HELD: readonly ReceiptStatus[] = [
  'issued',
  'pending_handover',
  'listed',
  'sold',
];

/** The number printed on a receipt: its ledger id's first eight characters. */
export const receiptNumber = (id: string) =>
  `WR-${id.slice(2, 10).toUpperCase()}`;

/** A day (YYYY-MM-DD) `days` after today in Bangladesh. */
export function dayAfter(days: number, today = todayBd()): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whether the goods are still held and the last valid day is within two weeks. */
export function expiringSoon(
  r: Pick<ReceiptDto, 'status' | 'expiresOn' | 'expired'>,
  today = todayBd(),
): boolean {
  return (
    !r.expired &&
    HELD.includes(r.status) &&
    r.expiresOn <= dayAfter(EXPIRING_DAYS, today)
  );
}

/** Whole days from today to the last valid day (0 on the day itself). */
export function daysLeft(expiresOn: string, today = todayBd()): number {
  return Math.round(
    (Date.parse(`${expiresOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      86_400_000,
  );
}

export type ReceiptTab =
  | 'all'
  | 'issued'
  | 'expiring'
  | 'pending_handover'
  | 'listed'
  | 'sold'
  | 'collected'
  | 'sold_out';
const TABS = new Set<string>([
  'issued',
  'expiring',
  'pending_handover',
  'listed',
  'sold',
  'collected',
  'sold_out',
]);

export interface ReceiptListSearch {
  tab?: Exclude<ReceiptTab, 'all'>;
  q?: string;
  page?: number;
}

export interface SiteListSearch {
  q?: string;
  state?: 'open' | 'closed';
}

const text = (raw: unknown) =>
  typeof raw === 'string' && raw.trim() && raw.length <= 100
    ? raw.trim()
    : undefined;

export function parseReceiptSearch(
  raw: Record<string, unknown>,
): ReceiptListSearch {
  const out: ReceiptListSearch = {};
  if (typeof raw.tab === 'string' && TABS.has(raw.tab))
    out.tab = raw.tab as ReceiptListSearch['tab'];
  const q = text(raw.q);
  if (q) out.q = q;
  const page = Number(raw.page);
  if (Number.isInteger(page) && page > 1) out.page = page;
  return out;
}

export function parseSiteSearch(raw: Record<string, unknown>): SiteListSearch {
  const out: SiteListSearch = {};
  const q = text(raw.q);
  if (q) out.q = q;
  if (raw.state === 'open' || raw.state === 'closed') out.state = raw.state;
  return out;
}

/** A ledger receipt id as the address takes it: 0x and 64 hex characters. */
export const isReceiptId = (id: string) => /^0x[0-9a-f]{64}$/i.test(id);

/** Whole numbers typed in either script; null when empty, NaN when not a number. */
export function wholeNumber(text: string): number | null {
  const t = latinDigits(text).replace(/[,\s]/g, '');
  if (t === '') return null;
  return /^\d+$/.test(t) ? Number(t) : Number.NaN;
}

/** Moisture as the server keeps it: 0 to 100, one decimal place; null when empty. */
export function moisture(text: string): string | null | undefined {
  const t = latinDigits(text).trim();
  if (t === '') return null;
  return /^\d{1,3}(\.\d)?$/.test(t) && Number(t) <= 100 ? t : undefined;
}
