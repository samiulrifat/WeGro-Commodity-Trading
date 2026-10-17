export enum NotificationCategory {
  /** A deadline is near or has passed. */
  Reminder = 'reminder',
  /** Something waits for the recipient to act. */
  Action = 'action',
  /** What happened to something of the recipient's. */
  Outcome = 'outcome',
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
  ParticipantRegistered = 'participant.registered',
  ParticipantVerified = 'participant.verified',
  ParticipantRejected = 'participant.rejected',
  FarmerAssigned = 'farmer.assigned',
  ReservationMade = 'reservation.made',
  ReservationConfirmed = 'reservation.confirmed',
  ReservationExpired = 'reservation.expired',
  ReservationCancelled = 'reservation.cancelled',
  ReservationExpiring = 'reservation.expiring',
  ProjectFunded = 'project.funded',
  ProjectActive = 'project.active',
  ProjectReadyForSale = 'project.ready-for-sale',
  ProjectPaidOut = 'project.paid-out',
  ProjectCancelled = 'project.cancelled',
  ProjectRefundsDue = 'project.refunds-due',
  RefundPaid = 'refund.paid',
  VoucherProposed = 'voucher.proposed',
  VoucherApproved = 'voucher.approved',
  VoucherRejected = 'voucher.rejected',
  VoucherCancelled = 'voucher.cancelled',
  VoucherInactiveSoon = 'voucher.inactive-soon',
  VoucherInactive = 'voucher.inactive',
  SaleRecorded = 'sale.recorded',
  SaleConfirmed = 'sale.confirmed',
  SaleCancelled = 'sale.cancelled',
  SaleExpired = 'sale.expired',
  SaleConfirmDue = 'sale.confirm-due',
  ReceiptIssued = 'receipt.issued',
  ReceiptExpiring = 'receipt.expiring',
  HandoverOffered = 'handover.offered',
  HandoverCancelled = 'handover.cancelled',
  HandoverAccepted = 'handover.accepted',
  OfferMade = 'offer.made',
  OfferApproved = 'offer.approved',
  OfferRejected = 'offer.rejected',
  DealAwaitingPayment = 'deal.awaiting-payment',
  DealPaymentDue = 'deal.payment-due',
  DealCancelled = 'deal.cancelled',
  DealExpired = 'deal.expired',
  DealPaid = 'deal.paid',
  DealDeliver = 'deal.deliver',
  DealDelivered = 'deal.delivered',
  ClaimOpened = 'claim.opened',
  ClaimApproved = 'claim.approved',
  ClaimRejected = 'claim.rejected',
  RoundPrepared = 'round.prepared',
  RoundRejected = 'round.rejected',
  RoundApproved = 'round.approved',
  PayoutPaid = 'payout.paid',
  TrackRecordPublished = 'track-record.published',
  TrackRecordViewed = 'track-record.viewed',
  ConsentGranted = 'consent.granted',
  ConsentRevoked = 'consent.revoked',
  ConsentExpiring = 'consent.expiring',
  BankAccountSubmitted = 'bank-account.submitted',
  BankAccountVerified = 'bank-account.verified',
  BankAccountRejected = 'bank-account.rejected',
  SystemNodeUnreachable = 'system.node-unreachable',
  SystemIndexerBehind = 'system.indexer-behind',
  SystemIndexerFailing = 'system.indexer-failing',
  SystemResolved = 'system.resolved',
}
