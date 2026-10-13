/** Costs Accounts enters; inputs come from voucher spending. On the ledger as upper-case codes. */
export enum CostCategory {
  Transport = 'transport',
  Labour = 'labour',
  Irrigation = 'irrigation',
  Storage = 'storage',
  Services = 'services',
  Other = 'other',
}

export const COST_CATEGORIES = Object.values(CostCategory);

export const CATEGORY_CODE = (c: CostCategory) => c.toUpperCase();

export enum CostStatus {
  /** Sent, not yet on the ledger. */
  Submitted = 'submitted',
  Recorded = 'recorded',
  Voided = 'voided',
}

/** Mirrors SettlementLedger.RoundStatus. */
export enum RoundStatus {
  Prepared = 'prepared',
  Approved = 'approved',
  Rejected = 'rejected',
  Paid = 'paid',
}

export enum PayeeRole {
  Farmer = 'farmer',
  Investor = 'investor',
}

/** Rounds still in progress: payees see only approved and paid ones. */
export const DECIDED_ROUND: readonly RoundStatus[] = [
  RoundStatus.Approved,
  RoundStatus.Paid,
];
