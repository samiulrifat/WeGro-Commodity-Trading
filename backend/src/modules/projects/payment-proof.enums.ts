/** How the investor paid. */
export enum PaymentMethod {
  BANK_DEPOSIT = 'bank_deposit',
  CASH = 'cash',
  CHEQUE = 'cheque',
}

/** Where a payment proof stands with Accounts. */
export enum ProofStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
}
