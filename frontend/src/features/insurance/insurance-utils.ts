import type {
  ClaimDto,
  CoverageDto,
  InsuredProjectDto,
} from '@/api/generated/insurance';
import { latinDigits } from '@/lib/format';

export type ClaimStatus = ClaimDto['status'];
export type Severity = 'low' | 'moderate' | 'severe';
export const SEVERITIES: readonly Severity[] = ['low', 'moderate', 'severe'];

/** Photos a claim takes, as the backend allows. */
export const MAX_CLAIM_PHOTOS = 5;

/** Several people act on a claim in turn: each page asks afresh when opened. */
export const FRESH = { refetchOnMountOrArgChange: true } as const;

/**
 * "40.5" (Bengali digits too) as the API takes it: 0 to 100 with at most one
 * decimal place; null when it is not one.
 */
export function typedPercent(text: string): string | null {
  const t = latinDigits(text).trim().replace(/%$/, '').trim();
  return /^(100(\.0)?|\d{1,2}(\.\d)?)$/.test(t) ? t : null;
}

/** Where an insured project stands with its insurer. */
export type CoverState = 'unassigned' | 'no_cover' | 'covered';
export const coverState = (
  p: Pick<InsuredProjectDto, 'insurer' | 'maxAmount'>,
): CoverState =>
  !p.insurer ? 'unassigned' : p.maxAmount ? 'covered' : 'no_cover';

/** The same for a project's full insurance view. */
export const coverStateOf = (c: Pick<CoverageDto, 'insurer' | 'current'>) =>
  coverState({ insurer: c.insurer, maxAmount: c.current?.maxAmount });
