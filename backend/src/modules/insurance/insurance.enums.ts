/** Mirrors InsuranceRegistry.ClaimStatus; `submitted` = sent, not yet on the ledger. */
export enum ClaimStatus {
  SUBMITTED = 'submitted',
  TRIGGERED = 'triggered',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  /** Approved and paid by the insurer to WeGro (recorded by Accounts). */
  PAID = 'paid',
}

export const CLAIM_STATUS_BY_CHAIN: Readonly<Record<number, ClaimStatus>> = {
  1: ClaimStatus.TRIGGERED,
  2: ClaimStatus.UNDER_REVIEW,
  3: ClaimStatus.APPROVED,
  4: ClaimStatus.REJECTED,
  5: ClaimStatus.PAID,
};

export enum Severity {
  LOW = 'low',
  MODERATE = 'moderate',
  SEVERE = 'severe',
}

/** Claims still waiting for the insurer: the final payout waits for these. */
export const OPEN_CLAIM: readonly ClaimStatus[] = [
  ClaimStatus.TRIGGERED,
  ClaimStatus.UNDER_REVIEW,
];
