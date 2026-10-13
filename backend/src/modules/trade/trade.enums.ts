/** Mirrors TradeLedger.ListingStatus. */
export enum ListingStatus {
  Open = 'open',
  Cancelled = 'cancelled',
  SoldOut = 'sold_out',
}

/** Mirrors TradeLedger.OfferStatus. An approved offer is a deal. */
export enum OfferStatus {
  Pending = 'pending',
  Withdrawn = 'withdrawn',
  Rejected = 'rejected',
  Approved = 'approved',
  Cancelled = 'cancelled',
  Expired = 'expired',
  Paid = 'paid',
  Delivered = 'delivered',
}

export enum RequestStatus {
  Open = 'open',
  Cancelled = 'cancelled',
}

export enum DeliverySide {
  Buyer = 'buyer',
  Handler = 'handler',
}
