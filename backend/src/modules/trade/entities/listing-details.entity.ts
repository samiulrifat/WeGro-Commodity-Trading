import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';
import {
  bigintTransformer,
  numericBigintTransformer,
} from '../../../database/transformers';

/** A listing photo: the file and its fingerprint. */
export interface ListingPhoto {
  id: string;
  hash: string;
}

/**
 * An external seller's listing as they wrote it: produce, quantity, price,
 * district, description and photos. Saved before the ledger is asked; the
 * ledger keeps `detailsHash`, and `listingId` is filled in when its
 * ExternalListingCreated arrives. Never edited.
 */
@Entity('listing_details')
@Index('uq_listing_details_hash', ['detailsHash'], { unique: true })
@Index('uq_listing_details_listing', ['listingId'], {
  unique: true,
  where: '"listing_id" IS NOT NULL',
})
@Index('ix_listing_details_seller', ['sellerId'])
@Check(
  'ck_listing_details_amounts',
  `"quantity" > 0 AND "asking_unit_price" > 0`,
)
export class ListingDetails {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  sellerId: string;

  @Column({ type: 'varchar', length: 31 })
  produceCode: string;

  @Column({ type: 'bigint', transformer: numericBigintTransformer })
  quantity: number;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  askingUnitPrice: bigint;

  @Column({ type: 'varchar', length: 20 })
  districtCode: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  description: string | null;

  @Column({ type: 'jsonb' })
  photos: ListingPhoto[];

  @Column({ type: 'char', length: 66 })
  detailsHash: string;

  @Column({
    type: 'bigint',
    transformer: numericBigintTransformer,
    nullable: true,
  })
  listingId: number | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
