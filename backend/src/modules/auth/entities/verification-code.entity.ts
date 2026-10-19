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

/** What a code is for; each confirms one thing only. */
export enum CodePurpose {
  /** A forgotten password (SMS). */
  PASSWORD_RESET = 'password-reset',
  /** Confirming a new mobile number before a details change (SMS). */
  PHONE_CHANGE = 'phone-change',
  /** Confirming the number of someone signing up (SMS). */
  SIGN_UP = 'sign-up',
  /** Confirming an email address before it can sign in (email). */
  EMAIL = 'email',
}

/**
 * One 6-digit code, sent by SMS to a number or by email to an address. Only
 * a keyed hash of it is stored (6 digits are guessable; without the key a
 * database copy is not enough). For a password reset, asking looks the same
 * whether the number is registered or not: a row is kept either way (with
 * nothing sent), so the per-number limits apply alike.
 */
@Entity('verification_codes')
@Index('ix_verification_codes_target', ['purpose', 'targetIndex', 'createdAt'])
export class VerificationCode {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', length: 20 })
  purpose: CodePurpose;

  /** The blind index of the number (as on users) or of the email address. */
  @Column({ type: 'char', length: 64 })
  targetIndex: string;

  /** Whose code, once they have an account. */
  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User | null;

  /** Whether it went out; a code never sent is never accepted. */
  @Column({ type: 'boolean' })
  sent: boolean;

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
