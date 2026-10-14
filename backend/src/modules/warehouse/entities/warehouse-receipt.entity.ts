import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { numericBigintTransformer } from '../../../database/transformers';
import { ReceiptStatus } from '../warehouse.enums';

/**
 * A warehouse receipt, keyed by its ledger id. Receipts a site issues carry
 * the intake record (fingerprinted as detailsHash); receipts split off to
 * buyers by a sale (parentId set) copy their parent's. Status, owner,
 * quantity and expiry mirror the ledger.
 */
@Entity('warehouse_receipts')
@Index('ix_warehouse_receipts_project', ['projectId'])
@Index('ix_warehouse_receipts_site_status', ['siteId', 'status'])
@Index('ix_warehouse_receipts_owner', ['ownerId'])
@Index('ix_warehouse_receipts_parent', ['parentId'])
@Check(
  'ck_warehouse_receipts_status',
  `"status" IN ('submitted', 'issued', 'pending_handover', 'listed', 'sold', 'collected', 'sold_out')`,
)
@Check('ck_warehouse_receipts_owner', `("owner_id" IS NULL) = "owner_is_wegro"`)
@Check(
  'ck_warehouse_receipts_quantity',
  `"quantity" >= 0 AND "quantity" <= "original_quantity" AND ("quantity" > 0 OR "status" = 'sold_out')`,
)
@Index('ix_warehouse_receipts_handover', ['handoverOfferedAt'], {
  where: `"status" = 'pending_handover'`,
})
@Index('ix_warehouse_receipts_expiring', ['expiresOn'], {
  where: `"status" IN ('issued', 'listed', 'pending_handover')`,
})
export class WarehouseReceipt {
  @PrimaryColumn({ type: 'char', length: 66 })
  id: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'uuid' })
  siteId: string;

  /** The participant who owns it; null when WeGro does. */
  @Column({ type: 'uuid', nullable: true })
  ownerId: string | null;

  @Column({ type: 'boolean', default: false })
  ownerIsWegro: boolean;

  @Column({ type: 'boolean', default: false })
  pendingToWegro: boolean;

  /** When the farmer's officer offered the buy-back; null when none is pending. */
  @Column({ type: 'timestamptz', nullable: true })
  handoverOfferedAt: Date | null;

  @Column({ type: 'varchar', length: 31 })
  produceCode: string;

  /** Still held under this receipt (whole units of the produce). */
  @Column({ type: 'bigint', transformer: numericBigintTransformer })
  quantity: number;

  @Column({ type: 'bigint', transformer: numericBigintTransformer })
  originalQuantity: number;

  @Column({ type: 'varchar', length: 20 })
  status: ReceiptStatus;

  @Column({ type: 'char', length: 66, nullable: true })
  parentId: string | null;

  // --- Intake record (as fingerprinted) ---

  @Column({ type: 'int', nullable: true })
  bagCount: number | null;

  /** One decimal place, e.g. "13.5". */
  @Column({ type: 'numeric', precision: 4, scale: 1, nullable: true })
  moisturePercent: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  storageBay: string | null;

  @Column({ type: 'date' })
  intakeDate: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  notes: string | null;

  @Column({ type: 'char', length: 66 })
  detailsHash: string;

  /** Last day the receipt is valid (Bangladesh calendar). */
  @Column({ type: 'date' })
  expiresOn: string;

  @Column({ type: 'uuid', nullable: true })
  issuedById: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  issuedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  collectedAt: Date | null;

  @Column({
    type: 'bigint',
    default: -1,
    transformer: numericBigintTransformer,
  })
  chainEventBlock: number;

  @Column({ type: 'int', default: -1 })
  chainEventLog: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
