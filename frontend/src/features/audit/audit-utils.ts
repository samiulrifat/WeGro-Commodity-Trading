import type { AuditActivityApiArg } from '@/api/generated/audit';

/** Kinds of record with a ledger history (each can be checked too), as the API names them. */
export type HistoryType = NonNullable<AuditActivityApiArg['type']>;

export const HISTORY_TYPES = [
  'project',
  'participant',
  'reservation',
  'voucher',
  'voucher-sale',
  'batch',
  'field-record',
  'warehouse-site',
  'receipt',
  'listing',
  'offer',
  'buyer-request',
  'weather-event',
  'claim',
  'round',
  'cost',
  'bank',
  'track-record',
] as const satisfies readonly HistoryType[];

const KNOWN = new Set<string>(HISTORY_TYPES);
export const isHistoryType = (v: unknown): v is HistoryType =>
  typeof v === 'string' && KNOWN.has(v);

/** How a write request ended, as the request log has it. */
export const OUTCOMES = ['ok', 'failed', 'aborted'] as const;
export type Outcome = (typeof OUTCOMES)[number];

/** Who may check records against the ledger (as the API allows). */
export const VERIFIERS = new Set(['super_admin', 'admin', 'auditor']);
/** Who may start a sweep of every record. */
export const SWEEPERS = new Set(['super_admin', 'auditor']);

/** A record's own page, where there is one. */
export function recordPage(type: string, id: string): string | null {
  switch (type) {
    case 'participant':
      return `/people/${id}`;
    case 'project':
      return `/projects/${id}`;
    case 'voucher':
      return `/vouchers/${id}`;
    case 'batch':
      return `/vouchers/batches/${id}`;
    case 'voucher-sale':
      return '/vouchers/sales';
    case 'warehouse-site':
      return '/warehouse/sites';
    case 'receipt':
      return `/warehouse/receipts/${id}`;
    case 'listing':
      return `/marketplace/listings/${id}`;
    case 'offer':
      return `/marketplace/deals/${id}`;
    case 'buyer-request':
      return '/marketplace/requests';
    case 'weather-event':
      return '/insurance/weather-events';
    case 'claim':
      return `/insurance/claims/${id}`;
    case 'round':
      return `/payouts/rounds/${id}`;
    case 'cost':
      return '/payouts/costs';
    case 'bank':
      return '/track-records/banks';
    case 'track-record':
      return `/track-records/farmers/${id}`;
    default:
      return null;
  }
}

/** A record's number or id as people read it: #12, or the start of a long id. */
export function shortId(type: string, id: string): string {
  if (/^\d+$/.test(id)) return `#${id}`;
  if (type === 'receipt') return `${id.slice(0, 10)}…`;
  return id.slice(0, 8);
}

/** "SlotsReserved" -> "Slots reserved": for a name the app has no words for. */
export const humanize = (name: string) =>
  name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
