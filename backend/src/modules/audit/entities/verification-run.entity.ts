import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

/** One sweep over every ledger record, checking each against the ledger. */
@Entity('verification_runs')
@Index('ix_verification_runs_started', ['startedAt'])
@Check(
  'ck_verification_runs_status',
  `"status" IN ('running', 'done', 'failed', 'interrupted')`,
)
export class VerificationRun {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'varchar', length: 12 })
  status: 'running' | 'done' | 'failed' | 'interrupted';

  @Column({ type: 'uuid' })
  startedById: string;

  @Column({ type: 'timestamptz' })
  startedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  finishedAt: Date | null;

  @Column({ type: 'int', default: 0 })
  checked: number;

  @Column({ type: 'int', default: 0 })
  mismatched: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  error: string | null;
}
