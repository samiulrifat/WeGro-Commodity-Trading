export enum NotificationCategory {
  /** A deadline is near or has passed. */
  REMINDER = 'reminder',
  /** Something waits for the recipient to act. */
  ACTION = 'action',
  /** What happened to something of the recipient's. */
  OUTCOME = 'outcome',
}

/**
 * The values a notification's text is built from, flat, so the app can put
 * them into its own wording in the reader's language.
 */
export type NotificationParams = Record<
  string,
  string | number | boolean | null
>;

/**
 * What a notification is about: the app words it from this and its params
 * in the reader's language. One kind per meaning.
 */
export enum NotificationKind {
  PARTICIPANT_REGISTERED = 'participant.registered',
  PARTICIPANT_VERIFIED = 'participant.verified',
  PARTICIPANT_REJECTED = 'participant.rejected',
  FARMER_ASSIGNED = 'farmer.assigned',
  RESERVATION_MADE = 'reservation.made',
  RESERVATION_CONFIRMED = 'reservation.confirmed',
  RESERVATION_EXPIRED = 'reservation.expired',
  RESERVATION_CANCELLED = 'reservation.cancelled',
  RESERVATION_EXPIRING = 'reservation.expiring',
  PROJECT_FUNDED = 'project.funded',
  PROJECT_ACTIVE = 'project.active',
  PROJECT_READY_FOR_SALE = 'project.ready-for-sale',
  PROJECT_PAID_OUT = 'project.paid-out',
  PROJECT_CANCELLED = 'project.cancelled',
  PROJECT_REFUNDS_DUE = 'project.refunds-due',
  REFUND_PAID = 'refund.paid',
  VOUCHER_PROPOSED = 'voucher.proposed',
  VOUCHER_APPROVED = 'voucher.approved',
  VOUCHER_REJECTED = 'voucher.rejected',
  VOUCHER_CANCELLED = 'voucher.cancelled',
  VOUCHER_INACTIVE_SOON = 'voucher.inactive-soon',
  VOUCHER_INACTIVE = 'voucher.inactive',
  SALE_RECORDED = 'sale.recorded',
  SALE_CONFIRMED = 'sale.confirmed',
  SALE_CANCELLED = 'sale.cancelled',
  SALE_EXPIRED = 'sale.expired',
  SALE_CONFIRM_DUE = 'sale.confirm-due',
  RECEIPT_ISSUED = 'receipt.issued',
  RECEIPT_EXPIRING = 'receipt.expiring',
  HANDOVER_OFFERED = 'handover.offered',
  HANDOVER_CANCELLED = 'handover.cancelled',
  HANDOVER_ACCEPTED = 'handover.accepted',
  OFFER_MADE = 'offer.made',
  OFFER_APPROVED = 'offer.approved',
  OFFER_REJECTED = 'offer.rejected',
  DEAL_AWAITING_PAYMENT = 'deal.awaiting-payment',
  DEAL_PAYMENT_DUE = 'deal.payment-due',
  DEAL_CANCELLED = 'deal.cancelled',
  DEAL_EXPIRED = 'deal.expired',
  DEAL_PAID = 'deal.paid',
  DEAL_DELIVER = 'deal.deliver',
  DEAL_DELIVERED = 'deal.delivered',
  CLAIM_OPENED = 'claim.opened',
  CLAIM_APPROVED = 'claim.approved',
  CLAIM_REJECTED = 'claim.rejected',
  ROUND_PREPARED = 'round.prepared',
  ROUND_REJECTED = 'round.rejected',
  ROUND_APPROVED = 'round.approved',
  PAYOUT_PAID = 'payout.paid',
  TRACK_RECORD_PUBLISHED = 'track-record.published',
  TRACK_RECORD_VIEWED = 'track-record.viewed',
  CONSENT_GRANTED = 'consent.granted',
  CONSENT_REVOKED = 'consent.revoked',
  CONSENT_EXPIRING = 'consent.expiring',
  BANK_ACCOUNT_SUBMITTED = 'bank-account.submitted',
  BANK_ACCOUNT_VERIFIED = 'bank-account.verified',
  BANK_ACCOUNT_REJECTED = 'bank-account.rejected',
  DETAILS_CHANGE_REQUESTED = 'details.change-requested',
  DETAILS_CHANGE_APPROVED = 'details.change-approved',
  DETAILS_CHANGE_REJECTED = 'details.change-rejected',
  SYSTEM_NODE_UNREACHABLE = 'system.node-unreachable',
  SYSTEM_INDEXER_BEHIND = 'system.indexer-behind',
  SYSTEM_INDEXER_FAILING = 'system.indexer-failing',
  SYSTEM_RESOLVED = 'system.resolved',
}
