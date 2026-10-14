import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';
import {
  bigintTransformer,
  numericBigintTransformer,
} from '../../../database/transformers';
import { InputType } from '../../catalog/entities/input-type.entity';
import { Project } from '../../projects/entities/project.entity';
import { User } from '../../users/entities/user.entity';
import { VoucherStatus } from '../voucher.enums';

/**
 * An input voucher: a quantity of one input at a fixed unit price, usable
 * only at its approved suppliers. Status, balances and last activity mirror
 * VoucherRegistry; quantities are whole units of the input, money in poisha.
 */
@Entity('vouchers')
@Index('ix_vouchers_project', ['projectId'])
@Index('ix_vouchers_farmer', ['farmerId'])
@Index('ix_vouchers_status_activity', ['status', 'lastActivityAt'])
@Check(
  'ck_vouchers_status',
  `"status" IN ('submitted', 'proposed', 'active', 'rejected', 'cancelled')`,
)
@Check(
  'ck_vouchers_amounts',
  `"quantity" > 0 AND "unit_price" > 0 AND "value" = "quantity" * "unit_price"`,
)
@Check(
  'ck_vouchers_balance',
  `"spent_quantity" >= 0 AND "held_quantity" >= 0 AND "spent_quantity" + "held_quantity" <= "quantity"`,
)
@Check(
  'ck_vouchers_inactivity',
  `"inactivity_limit_days" IS NULL OR "inactivity_limit_days" BETWEEN 1 AND 3650`,
)
@Index('ix_vouchers_proposed', ['proposedAt'], {
  where: `"status" = 'proposed'`,
})
@Index('ix_vouchers_inactivity', ['lastActivityAt'], {
  where: `"status" = 'active' AND "inactivity_limit_days" IS NOT NULL`,
})
export class Voucher extends BaseEntity {
  @Column({ type: 'uuid' })
  projectId: string;

  @ManyToOne(() => Project, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'project_id' })
  project?: Project;

  @Column({ type: 'uuid' })
  farmerId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'farmer_id' })
  farmer?: User;

  @Column({ type: 'varchar', length: 31 })
  inputTypeCode: string;

  @ManyToOne(() => InputType, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'input_type_code' })
  inputType?: InputType;

  @Column({ type: 'bigint', transformer: numericBigintTransformer })
  quantity: number;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  unitPrice: bigint;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  value: bigint;

  /** Confirmed by the field officer. */
  @Column({ type: 'bigint', default: 0, transformer: numericBigintTransformer })
  spentQuantity: number;

  /** In sales awaiting confirmation. */
  @Column({ type: 'bigint', default: 0, transformer: numericBigintTransformer })
  heldQuantity: number;

  @Column({ type: 'varchar', length: 10 })
  status: VoucherStatus;

  @Column({ type: 'uuid' })
  proposedById: string;

  @Column({ type: 'timestamptz', nullable: true })
  proposedAt: Date | null;

  /** Approval, a sale recorded or a sale confirmed (as the ledger counts it). */
  @Column({ type: 'timestamptz', nullable: true })
  lastActivityAt: Date | null;

  /** Set by the super admin; past it the voucher is flagged. Null = no limit. */
  @Column({ type: 'int', nullable: true })
  inactivityLimitDays: number | null;

  /** Value released when the voucher was cancelled. */
  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  voidedAmount: bigint | null;

  @Column({
    type: 'bigint',
    default: -1,
    transformer: numericBigintTransformer,
  })
  chainEventBlock: number;

  @Column({ type: 'int', default: -1 })
  chainEventLog: number;
}
