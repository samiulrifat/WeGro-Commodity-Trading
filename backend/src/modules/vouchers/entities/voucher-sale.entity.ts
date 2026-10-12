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
import { SaleStatus } from '../voucher.enums';
import { Voucher } from './voucher.entity';

/**
 * A supplier's sale against a voucher, keyed by its ledger id and created from
 * the SaleRecorded event. `status` null = waiting for replay after a re-index.
 */
@Entity('voucher_sales')
@Index('ix_voucher_sales_status_expiry', ['status', 'expiresAt'])
@Index('ix_voucher_sales_voucher', ['voucherId'])
@Index('ix_voucher_sales_supplier', ['supplierId'])
@Check(
  'ck_voucher_sales_status',
  `"status" IS NULL OR "status" IN ('pending', 'confirmed', 'cancelled', 'expired')`,
)
@Check('ck_voucher_sales_amounts', `"quantity" > 0 AND "amount" > 0`)
export class VoucherSale {
  @PrimaryColumn({ type: 'bigint', transformer: numericBigintTransformer })
  id: number;

  @Column({ type: 'uuid' })
  voucherId: string;

  @ManyToOne(() => Voucher, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'voucher_id' })
  voucher?: Voucher;

  @Column({ type: 'uuid' })
  supplierId: string;

  @Column({ type: 'bigint', transformer: numericBigintTransformer })
  quantity: number;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  amount: bigint;

  @Column({ type: 'varchar', length: 10, nullable: true })
  status: SaleStatus | null;

  @Column({ type: 'timestamptz' })
  recordedAt: Date;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  /** The field officer who confirmed receipt. */
  @Column({ type: 'uuid', nullable: true })
  confirmedById: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  closedAt: Date | null;
}
