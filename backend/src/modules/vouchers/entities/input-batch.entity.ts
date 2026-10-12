import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';
import { numericBigintTransformer } from '../../../database/transformers';
import { InputType } from '../../catalog/entities/input-type.entity';
import { User } from '../../users/entities/user.entity';
import { BatchStatus } from '../voucher.enums';

/**
 * A batch of an input a supplier produced or received. Its id is what the
 * QR code on the bags encodes; the ledger holds a fingerprint of these details.
 */
@Entity('input_batches')
@Index('uq_input_batches_lot', ['supplierId', 'inputTypeCode', 'lotNumber'], {
  unique: true,
})
@Check('ck_input_batches_status', `"status" IN ('submitted', 'registered')`)
@Check(
  'ck_input_batches_dates',
  `"expires_on" IS NULL OR "expires_on" >= "produced_on"`,
)
export class InputBatch extends BaseEntity {
  @Column({ type: 'uuid' })
  supplierId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'supplier_id' })
  supplier?: User;

  @Column({ type: 'varchar', length: 31 })
  inputTypeCode: string;

  @ManyToOne(() => InputType, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'input_type_code' })
  inputType?: InputType;

  /** The supplier's own lot or batch number, as printed on the goods. */
  @Column({ type: 'varchar', length: 64 })
  lotNumber: string;

  /** Batch size in the input's unit, if known. */
  @Column({
    type: 'bigint',
    nullable: true,
    transformer: numericBigintTransformer,
  })
  quantity: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  manufacturer: string | null;

  @Column({ type: 'date' })
  producedOn: string;

  @Column({ type: 'date', nullable: true })
  expiresOn: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes: string | null;

  @Column({ type: 'char', length: 66 })
  detailsHash: string;

  @Column({ type: 'varchar', length: 10 })
  status: BatchStatus;

  @Column({ type: 'timestamptz', nullable: true })
  registeredAt: Date | null;
}
