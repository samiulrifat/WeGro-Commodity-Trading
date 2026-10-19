import { type District, DISTRICTS } from '@/api/generated/codes';
import type { ParticipantsListApiArg } from '@/api/generated/participants';

/** The list's filters, kept in the address so they survive back and forward. */
export interface PeopleSearch {
  page?: number;
  role?: ParticipantsListApiArg['role'];
  status?: ParticipantsListApiArg['status'];
  district?: District;
  /** A mobile number, an NID or words of a name (the server decides which). */
  q?: string;
}

const ROLES = new Set<string>([
  'farmer',
  'investor',
  'buyer',
  'supplier',
  'bank',
  'warehouse',
  'insurer',
  'admin',
  'accounts',
  'operations',
  'field_officer',
  'auditor',
]);
const STATUSES = new Set<string>(['pending', 'verified', 'rejected']);
const DISTRICT_SET = new Set<string>(DISTRICTS);

/** Only what the list understands is kept from the address. */
export function parsePeopleSearch(raw: Record<string, unknown>): PeopleSearch {
  const out: PeopleSearch = {};
  const page = Number(raw.page);
  if (Number.isInteger(page) && page > 1) out.page = page;
  if (typeof raw.role === 'string' && ROLES.has(raw.role)) {
    out.role = raw.role as PeopleSearch['role'];
  }
  if (typeof raw.status === 'string' && STATUSES.has(raw.status)) {
    out.status = raw.status as PeopleSearch['status'];
  }
  if (typeof raw.district === 'string' && DISTRICT_SET.has(raw.district)) {
    out.district = raw.district as District;
  }
  if (typeof raw.q === 'string' && raw.q.trim() && raw.q.length <= 100) {
    out.q = raw.q.trim();
  }
  return out;
}
