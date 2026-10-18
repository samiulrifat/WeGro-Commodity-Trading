/** Costs Accounts enters; inputs come from voucher spending. On the ledger as upper-case codes. */
export enum CostCategory {
  TRANSPORT = 'transport',
  LABOUR = 'labour',
  IRRIGATION = 'irrigation',
  STORAGE = 'storage',
  SERVICES = 'services',
  OTHER = 'other',
}

export const COST_CATEGORIES = Object.values(CostCategory);

export const CATEGORY_CODE = (c: CostCategory) => c.toUpperCase();

export enum CostStatus {
  /** Sent, not yet on the ledger. */
  SUBMITTED = 'submitted',
  RECORDED = 'recorded',
  VOIDED = 'voided',
}

/** Mirrors SettlementLedger.RoundStatus. */
export enum RoundStatus {
  PREPARED = 'prepared',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  PAID = 'paid',
}

export enum PayeeRole {
  FARMER = 'farmer',
  INVESTOR = 'investor',
}

/** Rounds still in progress: payees see only approved and paid ones. */
export const DECIDED_ROUND: readonly RoundStatus[] = [
  RoundStatus.APPROVED,
  RoundStatus.PAID,
];
