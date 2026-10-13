import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import {
  bigintTransformer,
  numericBigintTransformer,
} from '../../../database/transformers';

/**
 * One version of an insurer's cover on a project, fingerprinted as the
 * ledger's termsHash. Saved before its transaction, marked recorded by the
 * CoverageSet event; the project's cover is its latest recorded version, so
 * the history of changes is kept. Each version's fingerprint includes the one
 * it replaced, so the versions form a chain and none can be dropped unnoticed.
 */
@Entity('coverage_terms')
@Index('uq_coverage_terms_hash', ['projectId', 'termsHash'], { unique: true })
@Index('ix_coverage_terms_current', [
  'projectId',
  'status',
  'chainEventBlock',
  'chainEventLog',
])
@Check('ck_coverage_terms_status', `"status" IN ('submitted', 'recorded')`)
@Check('ck_coverage_terms_max', `"max_amount" > 0`)
export class CoverageTerms {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'uuid' })
  insurerId: string;

  /** Poisha. */
  @Column({ type: 'bigint', transformer: bigintTransformer })
  maxAmount: bigint;

  /** Weather event type codes this cover pays for, sorted. */
  @Column({ type: 'varchar', length: 31, array: true })
  coveredEventTypes: string[];

  @Column({ type: 'varchar', length: 2000, nullable: true })
  notes: string | null;

  @Column({ type: 'char', length: 66 })
  termsHash: string;

  /** The version this one replaced; null for the first. */
  @Column({ type: 'char', length: 66, nullable: true })
  previousTermsHash: string | null;

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
