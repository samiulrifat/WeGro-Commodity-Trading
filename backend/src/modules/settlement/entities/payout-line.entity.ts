import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';
import {
  bigintTransformer,
  numericBigintTransformer,
} from '../../../database/transformers';
import { PayeeRole } from '../settlement.enums';

/**
 * What one payee gets in a round. The ledger holds only its hash; the
 * amount is worked out here and checked against it. The payment reference is
 * saved encrypted before its transaction; the ledger gets its keyed hash.
 */
@Entity('payout_lines')
@Index('ix_payout_lines_payee', ['payeeId', 'roundId'])
@Index('uq_payout_lines_payment_ref', ['paymentRefHash'], {
  unique: true,
  where: '"payment_ref_hash" IS NOT NULL',
})
@Check(
  'ck_payout_lines_role',
  `"payee_role" IS NULL OR "payee_role" IN ('farmer', 'investor')`,
)
@Check('ck_payout_lines_amount', `"amount" IS NULL OR "amount" > 0`)
@Check(
  'ck_payout_lines_paid',
  `"paid_at" IS NULL OR "payment_ref_hash" IS NOT NULL`,
)
export class PayoutLine {
  @PrimaryColumn({ type: 'bigint', transformer: numericBigintTransformer })
  roundId: number;

  @PrimaryColumn({ type: 'uuid' })
  payeeId: string;

  /** Null only if the ledger has a line this backend cannot account for. */
  @Column({ type: 'varchar', length: 10, nullable: true })
  payeeRole: PayeeRole | null;

  @Column({ type: 'int', nullable: true })
  slots: number | null;

  /** Poisha. */
  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  amount: bigint | null;

  /** As on the ledger. */
  @Column({ type: 'char', length: 66 })
  lineHash: string;

  /** The amount here produces the ledger's line hash. */
  @Column({ type: 'boolean', default: false })
  verified: boolean;

  @Column({ type: 'text', nullable: true })
  paymentRefEnc: string | null;

  @Column({ type: 'char', length: 66, nullable: true })
  paymentRefHash: string | null;

  @Column({ type: 'uuid', nullable: true })
  recordedById: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date | null;
}
