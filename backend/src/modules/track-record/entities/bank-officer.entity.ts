import {
  Column,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { numericBigintTransformer } from '../../../database/transformers';

/** Which bank a bank officer works for (from the ledger's BankOfficerAssigned). */
@Entity('bank_officers')
@Index('ix_bank_officers_bank', ['bankId'])
export class BankOfficer {
  @PrimaryColumn({ type: 'uuid' })
  officerId: string;

  /** Null = not assigned to any bank. */
  @Column({ type: 'uuid', nullable: true })
  bankId: string | null;

  @Column({
    type: 'bigint',
    default: -1,
    transformer: numericBigintTransformer,
  })
  chainEventBlock: number;

  @Column({ type: 'int', default: -1 })
  chainEventLog: number;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
