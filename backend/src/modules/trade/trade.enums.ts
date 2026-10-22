/** Mirrors TradeLedger.ListingStatus. */
export enum ListingStatus {
  OPEN = 'open',
  CANCELLED = 'cancelled',
  SOLD_OUT = 'sold_out',
  /** An external seller's listing, waiting for an admin. */
  PENDING = 'pending',
  /** An external seller's listing an admin turned down. */
  REJECTED = 'rejected',
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
  /** External listing: the seller was paid, less the seller fee. */
  SELLER_PAID = 'seller_paid',
}

export enum RequestStatus {
  OPEN = 'open',
  CANCELLED = 'cancelled',
}

export enum DeliverySide {
  BUYER = 'buyer',
  HANDLER = 'handler',
}
