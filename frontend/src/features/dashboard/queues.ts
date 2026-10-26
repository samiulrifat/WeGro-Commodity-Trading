import type { QueueDto, QueueItemDto } from '@/api/generated/dashboard';

/** Every queue the dashboard may list, in the backend's order. */
export const QUEUE_KEYS = [
  'participants.pending',
  'bank-accounts.pending',
  'reservations.pending',
  'vouchers.proposed',
  'voucher-sales.pending',
  'vouchers.inactive',
  'offers.pending',
  'deals.awaiting-payment',
  'deliveries.discrepancy',
  'handovers.pending',
  'rounds.awaiting-approval',
  'rounds.unpaid',
  'projects.ready-for-settlement',
  'claims.open',
  'claims.payment-due',
] as const;

export type QueueKey = (typeof QUEUE_KEYS)[number];

const KNOWN = new Set<string>(QUEUE_KEYS);

/** A queue the app knows how to word and link (a newer backend may add more). */
export const isKnownQueue = (q: QueueDto): q is QueueDto & { key: QueueKey } =>
  KNOWN.has(q.key);

/** A page to open: a path and, for a list, the tab to start on. */
export interface Target {
  to: string;
  search?: { tab: string };
}

/** Where each queue's whole list is worked. */
export const QUEUE_LIST: Record<QueueKey, Target> = {
  'participants.pending': { to: '/people/pending' },
  'bank-accounts.pending': { to: '/people/bank-details' },
  'reservations.pending': { to: '/projects/payments' },
  'vouchers.proposed': { to: '/vouchers/pending' },
  'voucher-sales.pending': { to: '/vouchers/sales' },
  'vouchers.inactive': { to: '/vouchers', search: { tab: 'inactive' } },
  'offers.pending': { to: '/marketplace/deals', search: { tab: 'pending' } },
  'deals.awaiting-payment': {
    to: '/marketplace/deals',
    search: { tab: 'approved' },
  },
  'deliveries.discrepancy': {
    to: '/marketplace/deliveries',
    search: { tab: 'mismatch' },
  },
  'handovers.pending': { to: '/warehouse/handovers' },
  'rounds.awaiting-approval': { to: '/payouts', search: { tab: 'prepared' } },
  'rounds.unpaid': { to: '/payouts', search: { tab: 'approved' } },
  'projects.ready-for-settlement': {
    to: '/payouts/projects',
    search: { tab: 'ready_for_sale' },
  },
  'claims.open': { to: '/insurance/claims' },
  'claims.payment-due': {
    to: '/insurance/claims',
    search: { tab: 'payment_due' },
  },
};

/** The page of one waiting item, where it is acted on. */
export function itemPath(key: QueueKey, item: QueueItemDto): string | null {
  const project = item.project ? `/projects/${item.project.id}` : null;
  switch (key) {
    case 'participants.pending':
    case 'bank-accounts.pending':
      return item.person ? `/people/${item.person.id}` : null;
    case 'reservations.pending':
    case 'voucher-sales.pending':
      return project;
    case 'vouchers.proposed':
    case 'vouchers.inactive':
      return `/vouchers/${item.id}`;
    case 'offers.pending':
    case 'deals.awaiting-payment':
    case 'deliveries.discrepancy':
      return `/marketplace/deals/${item.id}`;
    case 'handovers.pending':
      return `/warehouse/receipts/${item.id}`;
    case 'rounds.awaiting-approval':
    case 'rounds.unpaid':
      return `/payouts/rounds/${item.id}`;
    case 'projects.ready-for-settlement':
      return `/payouts/projects/${item.id}`;
    case 'claims.open':
    case 'claims.payment-due':
      return `/insurance/claims/${item.id}`;
  }
}

/** Queues whose item time is a deadline (due at), not when it began waiting. */
export const DEADLINE_QUEUES = new Set<QueueKey>([
  'deals.awaiting-payment',
  'vouchers.inactive',
]);
