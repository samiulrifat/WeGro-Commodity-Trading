import type {
  FeeSlabDto,
  ListingDto,
  OfferDto,
  ProduceRefDto,
} from '@/api/generated/marketplace';
import { toPoisha, toTaka } from '@/features/projects/project-math';
import { DISTRICTS, type District } from '@/api/generated/codes';
import { latinDigits } from '@/lib/format';

export type ListingStatus = ListingDto['status'];
export type OfferStatus = OfferDto['status'];
export type ListingSource = ListingDto['source'];

/** Several people act on a listing or deal in turn: each page asks afresh when opened. */
export const FRESH = { refetchOnMountOrArgChange: true } as const;

/** The most anyone may list, offer or ask for at once (as the backend). */
export const MAX_QUANTITY = 1_000_000_000_000;
/** Photos an outside seller adds to a listing. */
export const MAX_PHOTOS = 3;

/** The produce in the reader's language. */
export const produceName = (p: ProduceRefDto, bengali: boolean) =>
  bengali && p.nameBn ? p.nameBn : p.name;

/** "12" (Bengali digits too) to 12; null when empty, NaN when not whole. */
export function wholeNumber(text: string): number | null {
  const t = latinDigits(text).replace(/[,\s]/g, '');
  if (!t) return null;
  return /^\d+$/.test(t) ? Number(t) : Number.NaN;
}

/** A quantity someone may list or offer: whole, at least one, at most MAX_QUANTITY. */
export const validQuantity = (n: number | null, most = MAX_QUANTITY) =>
  n !== null && Number.isInteger(n) && n >= 1 && n <= most;

/** quantity × unit price, exactly, as taka text. */
export const dealAmount = (quantity: number, unitPrice: string) =>
  toTaka(toPoisha(unitPrice) * BigInt(quantity));

/**
 * The fixed fee per side for a deal of `amount` taka: the first slab whose
 * upper limit it does not pass; the last has none (as the ledger's feeFor).
 */
export function feeFor(amount: string, slabs: readonly FeeSlabDto[]): string {
  const total = toPoisha(amount);
  const slab = slabs.find((s) => s.upTo == null || total <= toPoisha(s.upTo));
  return slab?.fee ?? '0.00';
}

/** a + b in taka text, exactly. */
export const addTaka = (a: string, b: string) =>
  toTaka(toPoisha(a) + toPoisha(b));

/** WeGro, the farmer or the outside seller, as buyers see them. */
export const sellerName = (l: Pick<ListingDto, 'seller'>, wegro: string) =>
  l.seller.kind === 'wegro' ? wegro : l.seller.name;

/** A district code the app has words for (the API also sends its English name). */
export const knownDistrict = (code: string): code is District =>
  (DISTRICTS as readonly string[]).includes(code);

/** Search params of the marketplace lists. */
export interface MarketSearch {
  page?: number;
  q?: string;
  tab?: string;
}

/** Keeps only well-formed search params (bad ones are dropped, not errors). */
export function parseMarketSearch(raw: Record<string, unknown>): MarketSearch {
  const page = Number(raw.page);
  const q = typeof raw.q === 'string' ? raw.q.trim().slice(0, 100) : '';
  const tab =
    typeof raw.tab === 'string' && /^[a-z_]{1,20}$/.test(raw.tab)
      ? raw.tab
      : undefined;
  return {
    ...(Number.isInteger(page) && page > 1 ? { page } : {}),
    ...(q ? { q } : {}),
    ...(tab ? { tab } : {}),
  };
}

/** Where an offer stands for the whole deal, the order the money moves. */
export const DEAL_STEPS: readonly OfferStatus[] = [
  'pending',
  'approved',
  'paid',
  'delivered',
  'seller_paid',
];
