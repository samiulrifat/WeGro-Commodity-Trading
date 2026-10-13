import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import type { TrackRecordSummary } from '../track-record-summary';

/**
 * One published version of a farmer's track record. The summary is built by
 * the backend from ledger-backed data and stored exactly as fingerprinted;
 * the ledger keeps its hash and the projects it covers, and numbers the
 * versions.
 */
@Entity('track_records')
@Index('uq_track_records_version', ['farmerId', 'version'], {
  unique: true,
  where: '"version" IS NOT NULL',
})
@Index('uq_track_records_hash', ['summaryHash'], { unique: true })
@Check('ck_track_records_status', `"status" IN ('submitted', 'recorded')`)
@Check(
  'ck_track_records_version',
  `("status" = 'recorded') = ("version" IS NOT NULL)`,
)
export class TrackRecord {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  farmerId: string;

  /** The ledger's version number; null until recorded. */
  @Column({ type: 'int', nullable: true })
  version: number | null;

  @Column({ type: 'jsonb' })
  summary: TrackRecordSummary;

  @Column({ type: 'char', length: 66 })
  summaryHash: string;

  /** In the ledger's order: ascending as bytes32. */
  @Column({ type: 'uuid', array: true })
  projectIds: string[];

  @Column({ type: 'uuid' })
  publishedById: string;

  @Column({ type: 'varchar', length: 10 })
  status: 'submitted' | 'recorded';

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
