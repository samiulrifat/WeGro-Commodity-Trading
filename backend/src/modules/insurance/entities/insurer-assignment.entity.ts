import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { numericBigintTransformer } from '../../../database/transformers';

/**
 * An admin's choice of insurer for an insured project. Saved before its
 * transaction and marked recorded by the InsurerAssigned event. The project's
 * insurer is its latest recorded assignment. Earlier ones are kept as
 * history, and cover set before the latest assignment no longer counts (the
 * ledger clears it).
 */
@Entity('insurer_assignments')
@Index('ix_insurer_assignments_current', [
  'projectId',
  'status',
  'chainEventBlock',
  'chainEventLog',
])
@Index('ix_insurer_assignments_insurer', ['insurerId', 'projectId'], {
  where: `"status" = 'recorded'`,
})
@Check('ck_insurer_assignments_status', `"status" IN ('submitted', 'recorded')`)
export class InsurerAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'uuid' })
  insurerId: string;

  /** The admin (or super admin) who assigned them. */
  @Column({ type: 'uuid' })
  assignedById: string;

  @Column({ type: 'varchar', length: 10 })
  status: 'submitted' | 'recorded';

  @Column({ type: 'timestamptz', nullable: true })
  recordedAt: Date | null;

  @Column({
    type: 'bigint',
    default: -1,
    transformer: numericBigintTransformer,
  })
  chainEventBlock: number;

  @Column({ type: 'int', default: -1 })
  chainEventLog: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
