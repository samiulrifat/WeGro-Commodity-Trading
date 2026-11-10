import { Check, Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';
import { bigintTransformer } from '../../../database/transformers';
import { PaymentMethod, ProofStatus } from '../../projects/payment-proof.enums';
import { ClaimProofFile } from './claim-proof-file.entity';

/**
 * An insurer's evidence of a transfer to WeGro for an approved claim: how
 * much, when, how, and the files (photos or PDFs, encrypted). A claim is paid
 * in one or more of them; Accounts accepts each against the bank statement,
 * with the bank's reference, or rejects it. When accepted proofs add up to
 * the approved amount, the claim's payment is recorded on the ledger.
 */
@Entity('claim_proofs')
@Check('ck_claim_proofs_amount', `"amount" > 0`)
@Check(
  'ck_claim_proofs_routing',
  `"routing_number" IS NULL OR "routing_number" ~ '^[0-9]{9}$'`,
)
@Check(
  'ck_claim_proofs_status',
  `"status" IN ('pending', 'accepted', 'rejected')`,
)
@Check(
  'ck_claim_proofs_method',
  `"method" IN ('bank_deposit', 'cash', 'cheque')`,
)
@Index('ix_claim_proofs_claim', ['claimId'])
@Index('ix_claim_proofs_pending', ['createdAt'], {
  where: `"status" = 'pending'`,
})
@Index('uq_claim_proofs_verified_ref', ['verifiedRefHash'], {
  unique: true,
  where: '"verified_ref_hash" IS NOT NULL',
})
export class ClaimProof extends BaseEntity {
  @Column({ type: 'uuid' })
  claimId: string;

  @Column({ type: 'uuid' })
  insurerId: string;

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

  /** The transaction reference as the insurer typed it; encrypted. */
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

  @OneToMany(() => ClaimProofFile, (f) => f.proof)
  files?: ClaimProofFile[];
}
