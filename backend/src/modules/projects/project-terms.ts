import { fingerprint } from '../../blockchain/utils/fingerprint';
import { DurationType } from './project.enums';

/** The ledger's limits (ProjectLedger constants). */
export const BPS = 10_000;
export const SHORT_TERM_MAX_MONTHS = 6;
export const MAX_SLOTS = 10_000;
export const DEFAULT_SPLIT = {
  farmerBps: 4000,
  investorBps: 4000,
  wegroBps: 2000,
};

/** Everything that defines a project; fingerprinted into the on-chain termsHash. */
export interface ProjectTerms {
  title: string;
  description: string | null;
  produceCode: string;
  category: string;
  districtCode: string;
  location: string;
  farmerId: string;
  durationType: DurationType;
  durationMonths: number;
  payoutIntervalMonths: number;
  fundingTarget: bigint;
  slotPrice: bigint;
  farmerBps: number;
  investorBps: number;
  wegroBps: number;
  insured: boolean;
  estimatedReturnMinBps: number;
  estimatedReturnMaxBps: number;
  plannedStartDate: string | null;
}

/**
 * Every rule the ledger applies in createProject, plus the backend's own,
 * checked up front so a draft that passes here cannot be refused for a rule
 * when it is published. Returns all problems at once; empty means valid.
 */
export function checkTerms(t: ProjectTerms): string[] {
  const problems: string[] = [];
  if (t.slotPrice <= 0n || t.fundingTarget <= 0n) {
    problems.push('Funding target and slot price must be above zero');
  } else if (t.fundingTarget % t.slotPrice !== 0n) {
    problems.push('Funding target must be a whole number of slots');
  } else if (t.fundingTarget / t.slotPrice > BigInt(MAX_SLOTS)) {
    problems.push(`A project can have at most ${MAX_SLOTS} slots`);
  }

  if (t.farmerBps + t.investorBps + t.wegroBps !== BPS) {
    problems.push('Farmer, investor and WeGro shares must add up to 100%');
  }

  if (t.durationMonths < 1 || t.durationMonths > 255) {
    problems.push('Duration must be 1 to 255 months');
  } else if (t.durationType === DurationType.ShortTerm) {
    if (t.durationMonths > SHORT_TERM_MAX_MONTHS) {
      problems.push(
        `A short-term project lasts at most ${SHORT_TERM_MAX_MONTHS} months`,
      );
    }
    if (t.payoutIntervalMonths !== 0) {
      problems.push('A short-term project has a single final payout');
    }
  } else {
    if (t.durationMonths <= SHORT_TERM_MAX_MONTHS) {
      problems.push(
        `A long-term project lasts more than ${SHORT_TERM_MAX_MONTHS} months`,
      );
    }
    if (t.payoutIntervalMonths > t.durationMonths) {
      problems.push('The payout interval cannot be longer than the project');
    }
  }

  if (t.estimatedReturnMinBps > t.estimatedReturnMaxBps) {
    problems.push('The low estimate is above the high estimate');
  }
  return problems;
}

export function totalSlots(
  t: Pick<ProjectTerms, 'fundingTarget' | 'slotPrice'>,
): number {
  return Number(t.fundingTarget / t.slotPrice);
}

/**
 * The fingerprint registered as termsHash. Recomputing it from the stored
 * draft proves the terms investors see are the terms the ledger holds.
 */
export function termsHash(projectId: string, t: ProjectTerms): string {
  return fingerprint('project.terms', { v: 1, projectId, ...t });
}

/** "40.00" from 4000 basis points. */
export function bpsToPercent(bps: number): string {
  return `${Math.trunc(bps / 100)}.${String(Math.abs(bps % 100)).padStart(2, '0')}`;
}

/** Share of an amount in basis points, rounded down to whole poisha. */
export function applyBps(amount: bigint, bps: number): bigint {
  return (amount * BigInt(bps)) / BigInt(BPS);
}
