import { Check, Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';
import {
  bigintTransformer,
  numericBigintTransformer,
} from '../../../database/transformers';
import { PaymentMethod, ProofStatus } from '../payment-proof.enums';
import { PaymentProofFile } from './payment-proof-file.entity';

/**
 * An investor's evidence of a transfer for a reservation: how much, when,
 * how, and the files (photos or PDFs, encrypted). A reservation is paid in
 * one or more of them; Accounts accepts each against the bank statement,
 * with the bank's reference, or rejects it. When accepted proofs add up to
 * the amount, the reservation is confirmed on the ledger. Money accepted for
 * a reservation that then ended unconfirmed is refunded and recorded here.
 */
@Entity('payment_proofs')
@Check('ck_payment_proofs_amount', `"amount" > 0`)
@Check(
  'ck_payment_proofs_routing',
  `"routing_number" IS NULL OR "routing_number" ~ '^[0-9]{9}$'`,
)
@Check(
  'ck_payment_proofs_status',
  `"status" IN ('pending', 'accepted', 'rejected')`,
)
@Check(
  'ck_payment_proofs_method',
  `"method" IN ('bank_deposit', 'cash', 'cheque')`,
)
@Index('ix_payment_proofs_reservation', ['reservationId'])
@Index('ix_payment_proofs_pending', ['createdAt'], {
  where: `"status" = 'pending'`,
})
@Index('uq_payment_proofs_verified_ref', ['verifiedRefHash'], {
  unique: true,
  where: '"verified_ref_hash" IS NOT NULL',
})
@Index('uq_payment_proofs_refund_ref', ['refundRefHash'], {
  unique: true,
  where: '"refund_ref_hash" IS NOT NULL',
})
export class PaymentProof extends BaseEntity {
  @Column({ type: 'bigint', transformer: numericBigintTransformer })
  reservationId: number;

  @Column({ type: 'uuid' })
  investorId: string;

  /** Poisha. */
  @Column({ type: 'bigint', transformer: bigintTransformer })
  amount: bigint;

  @Column({ type: 'date' })
  transferredOn: string;

  @Column({ type: 'varchar', length: 12 })
  method: PaymentMethod;

  /** The bank paid from (deposit or cheque), as the bank list names it. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  bankName: string | null;

  /** The branch paid from, its district and routing number, as the bank list had them. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  branchName: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  districtName: string | null;

  @Column({ type: 'char', length: 9, nullable: true })
  routingNumber: string | null;

  /** The transaction reference as the investor typed it; encrypted. */
  @Column({ type: 'text', nullable: true })
  referenceEnc: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note: string | null;

  @Column({ type: 'varchar', length: 10 })
  status: ProofStatus;

  /** The reference Accounts found on the statement; encrypted, and keyed-hashed so it is used once. */
  @Column({ type: 'text', nullable: true })
  verifiedRefEnc: string | null;

  @Column({ type: 'char', length: 66, nullable: true })
  verifiedRefHash: string | null;

  @Column({ type: 'uuid', nullable: true })
  decidedById: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  rejectionReason: string | null;

  /** Money accepted for a reservation that ended unconfirmed, paid back. */
  @Column({ type: 'text', nullable: true })
  refundRefEnc: string | null;

  @Column({ type: 'char', length: 66, nullable: true })
  refundRefHash: string | null;

  @Column({ type: 'uuid', nullable: true })
  refundedById: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  refundedAt: Date | null;

  @OneToMany(() => PaymentProofFile, (f) => f.proof)
  files?: PaymentProofFile[];
}
