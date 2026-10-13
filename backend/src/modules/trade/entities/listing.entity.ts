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
import { Project } from '../../projects/entities/project.entity';
import { ListingStatus } from '../trade.enums';

/**
 * A sale listing, keyed by its ledger id: a warehouse receipt, or fresh
 * produce straight from a project. Created from ListingCreated. `available`
 * and `unpaidDeals` move only with one-way offer status changes. `status`
 * null = waiting for replay after a re-index.
 */
@Entity('listings')
@Index('ix_listings_status_produce', ['status', 'produceCode'])
@Index('ix_listings_project', ['projectId'])
@Index('ix_listings_receipt', ['receiptId'])
@Check(
  'ck_listings_status',
  `"status" IS NULL OR "status" IN ('open', 'cancelled', 'sold_out')`,
)
@Check('ck_listings_seller', `("seller_id" IS NULL) = "seller_is_wegro"`)
@Check(
  'ck_listings_amounts',
  `"quantity" > 0 AND "asking_unit_price" > 0 AND "available" BETWEEN 0 AND "quantity" AND "unpaid_deals" >= 0`,
)
export class Listing {
  @PrimaryColumn({ type: 'bigint', transformer: numericBigintTransformer })
  id: number;

  @Column({ type: 'uuid' })
  projectId: string;

  @ManyToOne(() => Project, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'project_id' })
  project?: Project;

  @Column({ type: 'uuid' })
  farmerId: string;

  /** Null for fresh produce listed from the project. */
  @Column({ type: 'char', length: 66, nullable: true })
  receiptId: string | null;

  @Column({ type: 'boolean' })
  sellerIsWegro: boolean;

  /** The farmer, when the farmer sells (through their field officer). */
  @Column({ type: 'uuid', nullable: true })
  sellerId: string | null;

  @Column({ type: 'varchar', length: 31 })
  produceCode: string;

  @Column({ type: 'bigint', transformer: numericBigintTransformer })
  quantity: number;

  /** Not yet reserved by an approved deal. */
  @Column({ type: 'bigint', transformer: numericBigintTransformer })
  available: number;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  askingUnitPrice: bigint;

  @Column({ type: 'int', default: 0 })
  unpaidDeals: number;

  @Column({ type: 'varchar', length: 10, nullable: true })
  status: ListingStatus | null;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  closedAt: Date | null;
}
