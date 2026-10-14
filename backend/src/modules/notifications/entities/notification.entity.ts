import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { NotificationCategory } from '../notification.enums';

/**
 * One in-app notification for one person. dedupe_key names the occasion and
 * the recipient, so the same reminder or event is never sent twice however
 * often it is produced. Kept forever.
 */
@Entity('notifications')
@Index('ix_notifications_user', ['userId', 'id'])
@Index('ix_notifications_unread', ['userId'], { where: '"read_at" IS NULL' })
@Index('uq_notifications_dedupe', ['dedupeKey'], { unique: true })
@Check(
  'ck_notifications_category',
  `"category" IN ('reminder', 'action', 'outcome')`,
)
export class Notification {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 8 })
  category: NotificationCategory;

  /** Machine-readable, e.g. reservation.expiring, offer.approved. */
  @Column({ type: 'varchar', length: 40 })
  kind: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  body: string | null;

  /** What it is about, for linking: e.g. reservation / 12. */
  @Column({ type: 'varchar', length: 30, nullable: true })
  subjectType: string | null;

  @Column({ type: 'varchar', length: 66, nullable: true })
  subjectId: string | null;

  @Column({ type: 'varchar', length: 200 })
  dedupeKey: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  readAt: Date | null;
}
