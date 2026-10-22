import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import {
  bigintTransformer,
  numericBigintTransformer,
} from '../../../database/transformers';
import { OfferStatus } from '../trade.enums';
import { Listing } from './listing.entity';

/**
 * A buyer's offer, keyed by its ledger id. Approved, it is a deal holding its
 * quantity until paid or past `paymentDueAt`. Every status change is one-way
 * and conditional on the previous status, so replays apply exactly once.
 * The payment reference is kept encrypted; the ledger has its keyed hash.
 * Fees are fixed when it is approved; an external seller's payout follows
 * delivery, its reference kept the same way.
 */
@Entity('offers')
@Index('ix_offers_listing_status', ['listingId', 'status'])
@Index('ix_offers_buyer', ['buyerId'])
@Index('ix_offers_status_due', ['status', 'paymentDueAt'])
@Index('uq_offers_payment_ref', ['paymentRefHash'], {
  unique: true,
  where: '"payment_ref_hash" IS NOT NULL',
})
@Check(
  'ck_offers_status',
  `"status" IS NULL OR "status" IN ('pending', 'withdrawn', 'rejected', 'approved', 'cancelled', 'expired', 'paid', 'delivered', 'seller_paid')`,
)
@Check('ck_offers_amounts', `"quantity" > 0 AND "unit_price" > 0`)
@Check(
  'ck_offers_fees',
  `("buyer_fee" IS NULL OR "buyer_fee" >= 0) AND ("seller_fee" IS NULL OR "seller_fee" >= 0)`,
)
@Index('uq_offers_seller_payout_ref', ['sellerPayoutRefHash'], {
  unique: true,
  where: '"seller_payout_ref_hash" IS NOT NULL',
})
@Index('ix_offers_delivered', ['deliveredAt'], {
  where: `"status" = 'delivered'`,
})
@Index('ix_offers_pending', ['madeAt'], { where: `"status" = 'pending'` })
@Index('ix_offers_paid', ['paidAt'], { where: `"status" = 'paid'` })
export class Offer {
  @PrimaryColumn({ type: 'bigint', transformer: numericBigintTransformer })
  id: number;

  @Column({ type: 'bigint', transformer: numericBigintTransformer })
  listingId: number;

  @ManyToOne(() => Listing, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'listing_id' })
  listing?: Listing;

  @Column({ type: 'uuid' })
  buyerId: string;

  @Column({ type: 'bigint', transformer: numericBigintTransformer })
  quantity: number;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  unitPrice: bigint;

  @Column({ type: 'varchar', length: 12, nullable: true })
  status: OfferStatus | null;

  @Column({ type: 'timestamptz' })
  madeAt: Date;

  /** Set when approved: payment must be confirmed before it (ledger time). */
  @Column({ type: 'timestamptz', nullable: true })
  paymentDueAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  paymentRefEnc: string | null;

  @Column({ type: 'char', length: 66, nullable: true })
  paymentRefHash: string | null;

  @Column({ type: 'uuid', nullable: true })
  paidConfirmedById: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  /** The warehouse receipt split off to the buyer on payment. */
  @Column({ type: 'char', length: 66, nullable: true })
  receiptPartId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  deliveredAt: Date | null;

  /** Platform fee the buyer pays on top, fixed on approval. */
  @Column({ type: 'bigint', transformer: bigintTransformer, nullable: true })
  buyerFee: bigint | null;

  /** Platform fee taken from an external seller's payout; 0 on WeGro's listings. */
  @Column({ type: 'bigint', transformer: bigintTransformer, nullable: true })
  sellerFee: bigint | null;

  @Column({ type: 'text', nullable: true })
  sellerPayoutRefEnc: string | null;

  @Column({ type: 'char', length: 66, nullable: true })
  sellerPayoutRefHash: string | null;

  @Column({ type: 'uuid', nullable: true })
  sellerPaidById: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  sellerPaidAt: Date | null;
}
