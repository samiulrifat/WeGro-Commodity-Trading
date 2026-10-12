/** Mirrors VoucherRegistry.VoucherStatus; `submitted` = sent, not yet on the ledger. */
export enum VoucherStatus {
  Submitted = 'submitted',
  Proposed = 'proposed',
  Active = 'active',
  Rejected = 'rejected',
  Cancelled = 'cancelled',
}

/** Mirrors VoucherRegistry.SaleStatus. */
export enum SaleStatus {
  Pending = 'pending',
  Confirmed = 'confirmed',
  Cancelled = 'cancelled',
  Expired = 'expired',
}

export enum BatchStatus {
  Submitted = 'submitted',
  Registered = 'registered',
}

/** Open vouchers: their limits and balances still matter. */
export const OPEN_VOUCHER: readonly VoucherStatus[] = [
  VoucherStatus.Proposed,
  VoucherStatus.Active,
];
