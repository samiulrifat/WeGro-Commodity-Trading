import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';
import { PaymentProof } from './payment-proof.entity';

/**
 * One file of a payment proof: a photo or a PDF, stored encrypted (bound to
 * this row) under UPLOAD_DIR/proofs/. `sha256` is of the file as received.
 */
@Entity('payment_proof_files')
@Index('ix_payment_proof_files_proof', ['proofId'])
export class PaymentProofFile extends BaseEntity {
  @Column({ type: 'uuid' })
  proofId: string;

  @ManyToOne(() => PaymentProof, (p) => p.files, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'proof_id' })
  proof?: PaymentProof;

  @Column({ type: 'varchar', length: 40 })
  mimeType: string;

  @Column({ type: 'int' })
  sizeBytes: number;

  @Column({ type: 'char', length: 64 })
  sha256: string;

  @Column({ type: 'varchar', length: 200 })
  storagePath: string;
}
