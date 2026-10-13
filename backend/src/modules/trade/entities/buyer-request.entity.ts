import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';
import {
  bigintTransformer,
  numericBigintTransformer,
} from '../../../database/transformers';
import { RequestStatus } from '../trade.enums';

/** A buyer's standing request for produce, keyed by its ledger id. */
@Entity('buyer_requests')
@Index('ix_buyer_requests_status_produce', ['status', 'produceCode'])
@Index('ix_buyer_requests_buyer', ['buyerId'])
@Check(
  'ck_buyer_requests_status',
  `"status" IS NULL OR "status" IN ('open', 'cancelled')`,
)
@Check('ck_buyer_requests_amounts', `"quantity" > 0 AND "max_unit_price" > 0`)
export class BuyerRequest {
  @PrimaryColumn({ type: 'bigint', transformer: numericBigintTransformer })
  id: number;

  @Column({ type: 'uuid' })
  buyerId: string;

  @Column({ type: 'varchar', length: 31 })
  produceCode: string;

  @Column({ type: 'bigint', transformer: numericBigintTransformer })
  quantity: number;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  maxUnitPrice: bigint;

  /** Open until this ledger time. */
  @Column({ type: 'timestamptz' })
  validUntil: Date;

  @Column({ type: 'varchar', length: 10, nullable: true })
  status: RequestStatus | null;

  @Column({ type: 'timestamptz' })
  postedAt: Date;
}
