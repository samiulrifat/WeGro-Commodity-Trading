/** Mirrors InsuranceRegistry.ClaimStatus; `submitted` = sent, not yet on the ledger. */
export enum ClaimStatus {
  Submitted = 'submitted',
  Triggered = 'triggered',
  UnderReview = 'under_review',
  Approved = 'approved',
  Rejected = 'rejected',
}

export const CLAIM_STATUS_BY_CHAIN: Readonly<Record<number, ClaimStatus>> = {
  1: ClaimStatus.Triggered,
  2: ClaimStatus.UnderReview,
  3: ClaimStatus.Approved,
  4: ClaimStatus.Rejected,
};

export enum Severity {
  Low = 'low',
  Moderate = 'moderate',
  Severe = 'severe',
}

/** Claims still waiting for the insurer: the final payout waits for these. */
export const OPEN_CLAIM: readonly ClaimStatus[] = [
  ClaimStatus.Triggered,
  ClaimStatus.UnderReview,
];
