import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * A field photo, stored once per content: its SHA-256 (of the file after
 * metadata was stripped) names the file on disk and is the fingerprint the
 * ledger keeps. Re-uploading the same photo, as an offline resend does,
 * returns the same row.
 */
@Entity('photos')
@Index('uq_photos_sha256', ['sha256'], { unique: true })
@Check(
  'ck_photos_type',
  `"mime_type" IN ('image/jpeg', 'image/png', 'image/webp')`,
)
@Check('ck_photos_size', `"size_bytes" > 0`)
export class Photo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'char', length: 64 })
  sha256: string;

  @Column({ type: 'varchar', length: 20 })
  mimeType: string;

  @Column({ type: 'int' })
  sizeBytes: number;

  /** Relative to UPLOAD_DIR. */
  @Column({ type: 'varchar', length: 200 })
  storagePath: string;

  @Column({ type: 'uuid' })
  uploadedById: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
