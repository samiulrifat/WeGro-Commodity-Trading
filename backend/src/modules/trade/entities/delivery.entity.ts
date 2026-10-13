import { Check, Column, Entity, PrimaryColumn } from 'typeorm';
import { numericBigintTransformer } from '../../../database/transformers';
import { DeliverySide } from '../trade.enums';

/**
 * One side's delivery confirmation: the buyer, or the handler (warehouse site
 * operator, or the farmer's field officer for fresh produce). Saved before
 * the ledger transaction and marked recorded by its event; the ledger keeps
 * the fingerprint as qualityHash.
 */
@Entity('deliveries')
@Check('ck_deliveries_side', `"side" IN ('buyer', 'handler')`)
@Check('ck_deliveries_status', `"status" IN ('submitted', 'recorded')`)
@Check('ck_deliveries_quantity', `"quantity" > 0`)
export class Delivery {
  @PrimaryColumn({ type: 'bigint', transformer: numericBigintTransformer })
  offerId: number;

  @PrimaryColumn({ type: 'varchar', length: 8 })
  side: DeliverySide;

  @Column({ type: 'bigint', transformer: numericBigintTransformer })
  quantity: number;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  notes: string | null;

  @Column({ type: 'uuid', nullable: true })
  photoId: string | null;

  @Column({ type: 'char', length: 66, nullable: true })
  photoHash: string | null;

  @Column({ type: 'char', length: 66 })
  qualityHash: string;

  @Column({ type: 'uuid', nullable: true })
  confirmedById: string | null;

  @Column({ type: 'varchar', length: 10 })
  status: 'submitted' | 'recorded';

  @Column({ type: 'timestamptz', nullable: true })
  recordedAt: Date | null;
}
