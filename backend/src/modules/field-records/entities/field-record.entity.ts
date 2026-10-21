import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Project } from '../../projects/entities/project.entity';
import { Photo } from './photo.entity';

/**
 * A farm update. The id is generated on the officer's phone, so sending the
 * same draft twice can never create two records. Never edited: a correction
 * is a new record pointing at the one it corrects. Values are stored in the
 * canonical text form that was fingerprinted; the ledger holds the
 * fingerprints (dataHash, photoHash).
 */
@Entity('field_records')
@Index('ix_field_records_project_observed', ['projectId', 'observedAt'])
@Index('ix_field_records_corrects', ['correctsEntryId'])
@Index('ix_field_records_recorder_observed', ['recordedById', 'observedAt'])
@Index('ix_field_records_observed', ['observedAt'])
@Check('ck_field_records_status', `"status" IN ('submitted', 'recorded')`)
@Check(
  'ck_field_records_location',
  `("latitude" IS NULL) = ("longitude" IS NULL)`,
)
@Check(
  'ck_field_records_photo',
  `("photo_id" IS NULL) = ("photo_hash" IS NULL)`,
)
export class FieldRecord {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @ManyToOne(() => Project, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'project_id' })
  project?: Project;

  @Column({ type: 'varchar', length: 31 })
  entryTypeCode: string;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  notes: string | null;

  /** Readings by key, each a decimal string with the record type's exact places. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  measurements: Record<string, string>;

  /** Decimal degrees, 6 places, as fingerprinted. */
  @Column({ type: 'numeric', precision: 9, scale: 6, nullable: true })
  latitude: string | null;

  @Column({ type: 'numeric', precision: 9, scale: 6, nullable: true })
  longitude: string | null;

  @Column({ type: 'int', nullable: true })
  accuracyMeters: number | null;

  @Column({ type: 'uuid', nullable: true })
  photoId: string | null;

  @ManyToOne(() => Photo, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'photo_id' })
  photo?: Photo | null;

  @Column({ type: 'uuid', nullable: true })
  correctsEntryId: string | null;

  @Column({ type: 'uuid' })
  recordedById: string;

  /** When the officer saw it, by the phone's clock (may be well before sending). */
  @Column({ type: 'timestamptz' })
  observedAt: Date;

  @Column({ type: 'char', length: 66 })
  dataHash: string;

  @Column({ type: 'char', length: 66, nullable: true })
  photoHash: string | null;

  @Column({ type: 'varchar', length: 10 })
  status: 'submitted' | 'recorded';

  /** Ledger time of the block that recorded it. */
  @Column({ type: 'timestamptz', nullable: true })
  recordedAt: Date | null;

  @Column({ type: 'char', length: 66, nullable: true })
  txHash: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
