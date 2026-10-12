import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { bigintTransformer } from '../../../database/transformers';

/**
 * A refund Accounts paid an investor of a cancelled project. Saved before
 * the ledger transaction (so the encrypted reference cannot be lost) and
 * marked confirmed when the ledger records it.
 */
@Entity('refunds')
@Check('ck_refunds_amount', `"amount" > 0`)
@Index('uq_refunds_payment_ref', ['paymentRefHash'], { unique: true })
export class Refund {
  @PrimaryColumn({ type: 'uuid' })
  projectId: string;

  @PrimaryColumn({ type: 'uuid' })
  investorId: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  amount: bigint;

  @Column({ type: 'text', nullable: true })
  paymentRefEnc: string | null;

  @Column({ type: 'char', length: 66 })
  paymentRefHash: string;

  @Column({ type: 'boolean', default: false })
  confirmed: boolean;

  @Column({ type: 'uuid', nullable: true })
  recordedById: string | null;

  @Column({ type: 'timestamptz' })
  recordedAt: Date;
}
