import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * One password reset code sent by SMS. Only a keyed hash of it is stored
 * (6 digits are guessable; without the key a database copy is not enough).
 * Asking for a reset looks the same whether the number is registered or
 * not: a row is kept either way (`userId` null, nothing sent), so the
 * per-number limits apply alike.
 */
@Entity('password_reset_codes')
@Index('ix_password_reset_codes_phone', ['phoneIndex', 'createdAt'])
export class PasswordResetCode {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  /** The number's blind index, as on users. */
  @Column({ type: 'char', length: 64 })
  phoneIndex: string;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User | null;

  @Column({ type: 'char', length: 64 })
  codeHash: string;

  /** Wrong codes tried against it. */
  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  /** Used, replaced by a newer code, or out of tries: no longer accepted. */
  @Column({ type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
