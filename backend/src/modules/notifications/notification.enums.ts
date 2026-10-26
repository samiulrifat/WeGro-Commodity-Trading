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
  /** A verified person's role was taken away (they left, were dismissed...). */
  PARTICIPANT_ACCESS_REVOKED = 'participant.access-revoked',
  FARMER_ASSIGNED = 'farmer.assigned',
  /** To a farmer's field officer: their farmer's registration was decided. */
  FARMER_VERIFIED = 'farmer.verified',
  FARMER_REJECTED = 'farmer.rejected',
  FARMER_ACCESS_REVOKED = 'farmer.access-revoked',
  /** To a farmer: who their field officer now is. */
  OFFICER_ASSIGNED = 'officer.assigned',
  RESERVATION_MADE = 'reservation.made',
  RESERVATION_CONFIRMED = 'reservation.confirmed',
  RESERVATION_EXPIRED = 'reservation.expired',
  RESERVATION_CANCELLED = 'reservation.cancelled',
  RESERVATION_EXPIRING = 'reservation.expiring',
  /** An investor sent a payment proof: Accounts to review. */
  PAYMENT_PROOF_SUBMITTED = 'payment-proof.submitted',
  PAYMENT_PROOF_ACCEPTED = 'payment-proof.accepted',
  PAYMENT_PROOF_REJECTED = 'payment-proof.rejected',
  /** Money for a booking that ended unconfirmed was paid back. */
  PAYMENT_REFUNDED = 'payment-proof.refunded',
  PROJECT_FUNDED = 'project.funded',
  /** To the farmer, their officer and the investors (PROJECT_FUNDED asks Operations to act). */
  PROJECT_FULLY_FUNDED = 'project.fully-funded',
  /** To the farmer and their officer: open for funding. */
  PROJECT_LIVE = 'project.live',
  PROJECT_ACTIVE = 'project.active',
  PROJECT_READY_FOR_SALE = 'project.ready-for-sale',
  /** To the investors: harvested and ready for sale. */
  PROJECT_ON_SALE = 'project.on-sale',
  PROJECT_PAID_OUT = 'project.paid-out',
  PROJECT_CANCELLED = 'project.cancelled',
  /** To the farmer and their officer (PROJECT_CANCELLED speaks of refunds to investors). */
  PROJECT_CALLED_OFF = 'project.called-off',
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
  RECEIPT_EXTENDED = 'receipt.extended',
  RECEIPT_COLLECTED = 'receipt.collected',
  /** To a warehouse operator placed at a site. */
  SITE_ASSIGNED = 'site.assigned',
  HANDOVER_OFFERED = 'handover.offered',
  HANDOVER_CANCELLED = 'handover.cancelled',
  HANDOVER_ACCEPTED = 'handover.accepted',
  OFFER_MADE = 'offer.made',
  OFFER_APPROVED = 'offer.approved',
  OFFER_REJECTED = 'offer.rejected',
  /** To whoever decides the offer: the buyer took it back. */
  OFFER_WITHDRAWN = 'offer.withdrawn',
  /** To the farmer and their officer: an offer on their produce was approved. */
  DEAL_AGREED = 'deal.agreed',
  DEAL_AWAITING_PAYMENT = 'deal.awaiting-payment',
  DEAL_PAYMENT_DUE = 'deal.payment-due',
  DEAL_CANCELLED = 'deal.cancelled',
  DEAL_EXPIRED = 'deal.expired',
  DEAL_PAID = 'deal.paid',
  /** To the farmer and their officer: the buyer's payment is confirmed. */
  DEAL_BUYER_PAID = 'deal.buyer-paid',
  DEAL_DELIVER = 'deal.deliver',
  DEAL_DELIVERED = 'deal.delivered',
  /** To admins: a side confirmed a quantity other than the deal's. */
  DELIVERY_MISMATCH = 'delivery.mismatch',
  /** To admins and Operations: a buyer posted what they want to buy. */
  REQUEST_POSTED = 'request.posted',
  LISTING_AWAITING_APPROVAL = 'listing.awaiting-approval',
  LISTING_APPROVED = 'listing.approved',
  LISTING_REJECTED = 'listing.rejected',
  SELLER_PAYOUT_DUE = 'seller.payout-due',
  SELLER_PAID = 'seller.paid',
  CLAIM_OPENED = 'claim.opened',
  /** To the farmer and their officer (CLAIM_OPENED asks the insurer to act). */
  CLAIM_FILED = 'claim.filed',
  CLAIM_APPROVED = 'claim.approved',
  CLAIM_REJECTED = 'claim.rejected',
  CLAIM_PAYMENT_DUE = 'claim.payment-due',
  CLAIM_PAID = 'claim.paid',
  INSURER_ASSIGNED = 'insurer.assigned',
  /** To field officers whose farmers' insured crops in the district cover it. */
  WEATHER_RECORDED = 'weather.recorded',
  ROUND_PREPARED = 'round.prepared',
  ROUND_REJECTED = 'round.rejected',
  ROUND_APPROVED = 'round.approved',
  PAYOUT_PAID = 'payout.paid',
  /** To a farmer's field officer: their farmer was paid. */
  PAYOUT_FARMER_PAID = 'payout.farmer-paid',
  TRACK_RECORD_PUBLISHED = 'track-record.published',
  TRACK_RECORD_VIEWED = 'track-record.viewed',
  /** To a bank's officers: a farmer who allows their bank published a new version. */
  TRACK_RECORD_UPDATED = 'track-record.updated',
  CONSENT_GRANTED = 'consent.granted',
  CONSENT_REVOKED = 'consent.revoked',
  CONSENT_EXPIRING = 'consent.expiring',
  /** To a bank's officers: a farmer gave or withdrew their bank's permission. */
  CONSENT_BANK_GRANTED = 'consent.bank-granted',
  CONSENT_BANK_REVOKED = 'consent.bank-revoked',
  /** To a bank-role person placed at a bank, or taken off it. */
  BANK_OFFICER_ASSIGNED = 'bank.officer-assigned',
  BANK_OFFICER_REMOVED = 'bank.officer-removed',
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
