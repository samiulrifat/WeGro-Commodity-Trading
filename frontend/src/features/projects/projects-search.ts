import { type District, DISTRICTS } from '@/api/generated/codes';
import type { ProjectDto } from '@/api/generated/projects';

export const STAGES = [
  'draft',
  'open_for_funding',
  'funded',
  'active',
  'ready_for_sale',
  'paid_out',
  'closed',
  'cancelled',
] as const satisfies ReadonlyArray<ProjectDto['stage']>;

export type Tab = 'all' | 'long_term' | 'short_term' | 'saved';
const TABS = new Set<string>(['long_term', 'short_term', 'saved']);
const STAGE_SET = new Set<string>(STAGES);
const DISTRICT_SET = new Set<string>(DISTRICTS);
const CODE = /^[A-Z0-9_-]{1,31}$/;

/** The list's tab, search and filters, kept in the address. */
export interface ProjectsSearch {
  page?: number;
  tab?: Exclude<Tab, 'all'>;
  q?: string;
  stage?: ProjectDto['stage'];
  produce?: string;
  district?: District;
}

export function parseProjectsSearch(
  raw: Record<string, unknown>,
): ProjectsSearch {
  const out: ProjectsSearch = {};
  const page = Number(raw.page);
  if (Number.isInteger(page) && page > 1) out.page = page;
  if (typeof raw.tab === 'string' && TABS.has(raw.tab)) {
    out.tab = raw.tab as ProjectsSearch['tab'];
  }
  if (typeof raw.q === 'string' && raw.q.trim() && raw.q.length <= 100) {
    out.q = raw.q.trim();
  }
  if (typeof raw.stage === 'string' && STAGE_SET.has(raw.stage)) {
    out.stage = raw.stage as ProjectDto['stage'];
  }
  if (typeof raw.produce === 'string' && CODE.test(raw.produce)) {
    out.produce = raw.produce;
  }
  if (typeof raw.district === 'string' && DISTRICT_SET.has(raw.district)) {
    out.district = raw.district as District;
  }
  return out;
}

export type PaymentsTab = 'pending' | 'accepted' | 'rejected' | 'bookings';
export const PAYMENT_TABS: readonly PaymentsTab[] = [
  'pending',
  'accepted',
  'rejected',
  'bookings',
];

/** Accounts' payments page: the tab, the search and the page. */
export interface PaymentsSearch {
  tab?: Exclude<PaymentsTab, 'pending'>;
  q?: string;
  page?: number;
}

export function parsePaymentsSearch(
  raw: Record<string, unknown>,
): PaymentsSearch {
  const out: PaymentsSearch = {};
  if (
    raw.tab === 'accepted' ||
    raw.tab === 'rejected' ||
    raw.tab === 'bookings'
  ) {
    out.tab = raw.tab;
  }
  if (typeof raw.q === 'string' && raw.q.trim() && raw.q.length <= 100) {
    out.q = raw.q.trim();
  }
  const page = Number(raw.page);
  if (Number.isInteger(page) && page > 1) out.page = page;
  return out;
}

/** The refunds page: whose (search) and the page of booking refunds. */
export interface RefundsSearch {
  q?: string;
  page?: number;
}

export function parseRefundsSearch(
  raw: Record<string, unknown>,
): RefundsSearch {
  const out: RefundsSearch = {};
  if (typeof raw.q === 'string' && raw.q.trim() && raw.q.length <= 100) {
    out.q = raw.q.trim();
  }
  const page = Number(raw.page);
  if (Number.isInteger(page) && page > 1) out.page = page;
  return out;
}
