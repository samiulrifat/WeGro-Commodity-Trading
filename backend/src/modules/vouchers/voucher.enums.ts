/** Mirrors VoucherRegistry.VoucherStatus; `submitted` = sent, not yet on the ledger. */
export enum VoucherStatus {
  SUBMITTED = 'submitted',
  PROPOSED = 'proposed',
  ACTIVE = 'active',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}

/** Mirrors VoucherRegistry.SaleStatus. */
export enum SaleStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

export enum BatchStatus {
  SUBMITTED = 'submitted',
  REGISTERED = 'registered',
}

/** Open vouchers: their limits and balances still matter. */
export const OPEN_VOUCHER: readonly VoucherStatus[] = [
  VoucherStatus.PROPOSED,
  VoucherStatus.ACTIVE,
];
