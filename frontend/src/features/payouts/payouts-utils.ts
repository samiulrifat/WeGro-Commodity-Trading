import type { CostDto, RoundListItemDto } from '@/api/generated/settlement';
import { toPoisha, toTaka } from '@/features/projects/project-math';

export type RoundStatus = RoundListItemDto['status'];
export type CostCategory = CostDto['category'];
export const COST_CATEGORIES: readonly CostCategory[] = [
  'transport',
  'labour',
  'irrigation',
  'storage',
  'services',
  'other',
];

/** Several people act on a round in turn: each page asks afresh when opened. */
export const FRESH = { refetchOnMountOrArgChange: true } as const;

/** What a round pays out: the farmer's and investors' shares and the capital returned. */
export const payoutTotal = (
  r: Pick<RoundListItemDto, 'farmerShare' | 'investorShare' | 'capitalReturn'>,
) =>
  toTaka(
    toPoisha(r.farmerShare) +
      toPoisha(r.investorShare) +
      toPoisha(r.capitalReturn),
  );

/** The days a statement or report covers. */
export interface Period {
  from?: string;
  to?: string;
}

/** A period as query text for a CSV download. */
export const periodQuery = (p: Period) => {
  const q = new URLSearchParams();
  if (p.from) q.set('from', p.from);
  if (p.to) q.set('to', p.to);
  const s = q.toString();
  return s ? `?${s}` : '';
};
