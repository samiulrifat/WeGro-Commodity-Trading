/** Mirrors TradeLedger.ListingStatus. */
export enum ListingStatus {
  OPEN = 'open',
  CANCELLED = 'cancelled',
  SOLD_OUT = 'sold_out',
}

/** Mirrors TradeLedger.OfferStatus. An approved offer is a deal. */
export enum OfferStatus {
  PENDING = 'pending',
  WITHDRAWN = 'withdrawn',
  REJECTED = 'rejected',
  APPROVED = 'approved',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  PAID = 'paid',
  DELIVERED = 'delivered',
}

export enum RequestStatus {
  OPEN = 'open',
  CANCELLED = 'cancelled',
}

export enum DeliverySide {
  BUYER = 'buyer',
  HANDLER = 'handler',
}
