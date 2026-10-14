import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A job run worth keeping: one that handled something, failed, or was started
 * by hand. Quiet scheduled runs are only reflected in the in-memory status.
 */
@Entity('job_runs')
@Index('ix_job_runs_job', ['job', 'id'])
@Check('ck_job_runs_outcome', `"outcome" IN ('ok', 'failed')`)
@Check('ck_job_runs_trigger', `"trigger" IN ('schedule', 'manual')`)
export class JobRun {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', length: 50 })
  job: string;

  @Column({ type: 'varchar', length: 8 })
  trigger: 'schedule' | 'manual';

  @Column({ type: 'uuid', nullable: true })
  triggeredById: string | null;

  @Column({ type: 'timestamptz' })
  startedAt: Date;

  @Column({ type: 'timestamptz' })
  finishedAt: Date;

  @Column({ type: 'varchar', length: 6 })
  outcome: 'ok' | 'failed';

  @Column({ type: 'int' })
  items: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  error: string | null;
}
