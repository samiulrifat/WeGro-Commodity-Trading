import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

export enum BankAccountStatus {
  /** Entered, waiting for an admin to verify it. */
  Pending = 'pending',
  /** The one payouts go to. */
  Verified = 'verified',
  Rejected = 'rejected',
  /** Replaced by later details; kept as history. */
  Superseded = 'superseded',
}

/**
 * Where a payee (farmer or investor) is paid. The details are encrypted as
 * one value bound to the row. New or changed details take effect only once
 * an admin other than the person who entered them verifies them; every
 * version is kept, so changes can always be traced.
 */
@Entity('bank_accounts')
@Index('ix_bank_accounts_user', ['userId', 'createdAt'])
@Index('uq_bank_accounts_pending', ['userId'], {
  unique: true,
  where: `"status" = 'pending'`,
})
@Index('uq_bank_accounts_verified', ['userId'], {
  unique: true,
  where: `"status" = 'verified'`,
})
@Check(
  'ck_bank_accounts_status',
  `"status" IN ('pending', 'verified', 'rejected', 'superseded')`,
)
@Index('ix_bank_accounts_pending', ['createdAt'], {
  where: `"status" = 'pending'`,
})
export class BankAccount {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  /** Encrypted JSON: holder, bank, branch, account and routing numbers. */
  @Column({ type: 'text' })
  detailsEnc: string;

  @Column({ type: 'varchar', length: 10 })
  status: BankAccountStatus;

  @Column({ type: 'uuid' })
  enteredById: string;

  @Column({ type: 'uuid', nullable: true })
  decidedById: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  rejectionReason: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
