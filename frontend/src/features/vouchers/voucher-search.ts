import { toPoisha, toTaka } from '@/features/projects/project-math';
import { todayBd } from '@/lib/format';
import type {
  BatchDto,
  VoucherDto,
  VoucherSaleDto,
} from '@/api/generated/vouchers';

export type VoucherTab =
  'all' | 'active' | 'inactive' | 'rejected' | 'cancelled';
const VOUCHER_TABS = new Set<string>([
  'active',
  'inactive',
  'rejected',
  'cancelled',
]);
export type SaleTab = 'pending' | 'confirmed' | 'cancelled' | 'expired' | 'all';
const SALE_TABS = new Set<string>(['confirmed', 'cancelled', 'expired', 'all']);

/** A list's tab, search and page, kept in the address. */
export interface VoucherListSearch {
  tab?: Exclude<VoucherTab, 'all'>;
  q?: string;
  page?: number;
}

export interface SaleListSearch {
  tab?: Exclude<SaleTab, 'pending'>;
  q?: string;
  page?: number;
}

export interface BatchListSearch {
  q?: string;
  page?: number;
}

const text = (raw: unknown) =>
  typeof raw === 'string' && raw.trim() && raw.length <= 100
    ? raw.trim()
    : undefined;
const page = (raw: unknown) => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 1 ? n : undefined;
};

export function parseVoucherSearch(
  raw: Record<string, unknown>,
): VoucherListSearch {
  const out: VoucherListSearch = {};
  if (typeof raw.tab === 'string' && VOUCHER_TABS.has(raw.tab)) {
    out.tab = raw.tab as VoucherListSearch['tab'];
  }
  const q = text(raw.q);
  if (q) out.q = q;
  const p = page(raw.page);
  if (p) out.page = p;
  return out;
}

export function parseSaleSearch(raw: Record<string, unknown>): SaleListSearch {
  const out: SaleListSearch = {};
  if (typeof raw.tab === 'string' && SALE_TABS.has(raw.tab)) {
    out.tab = raw.tab as SaleListSearch['tab'];
  }
  const q = text(raw.q);
  if (q) out.q = q;
  const p = page(raw.page);
  if (p) out.page = p;
  return out;
}

export function parseBatchSearch(
  raw: Record<string, unknown>,
): BatchListSearch {
  const out: BatchListSearch = {};
  const q = text(raw.q);
  if (q) out.q = q;
  const p = page(raw.page);
  if (p) out.page = p;
  return out;
}

/** Share of the voucher used (sold and confirmed), for its progress bar. */
export const usedShare = (v: Pick<VoucherDto, 'quantity' | 'spentQuantity'>) =>
  v.quantity === 0 ? 0 : Math.min(100, (v.spentQuantity * 100) / v.quantity);

export type VoucherStatus = VoucherDto['status'];
export type SaleStatus = VoucherSaleDto['status'];

/** A voucher's value: quantity × unit price, exact to the poisha. */
export const voucherValue = (quantity: number, unitPrice: string) =>
  toTaka(toPoisha(unitPrice) * BigInt(quantity));

/** Whether a lot is past its expiry day (in Bangladesh). */
export const isExpired = (b: Pick<BatchDto, 'expiresOn'>) =>
  !!b.expiresOn && b.expiresOn < todayBd();

const PROPOSERS = new Set(['operations', 'admin', 'super_admin']);
/** Who proposes vouchers (and discards one the ledger never got); Accounts approves. */
export const canProposeVouchers = (role: string) => PROPOSERS.has(role);
