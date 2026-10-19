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

/** What a code sent by SMS is for. */
export enum SmsCodePurpose {
  /** A forgotten password. */
  PASSWORD_RESET = 'password-reset',
  /** Confirming a new mobile number before a details change. */
  PHONE_CHANGE = 'phone-change',
}

/**
 * One 6-digit code sent by SMS. Only a keyed hash of it is stored (6 digits
 * are guessable; without the key a database copy is not enough). For a
 * password reset, asking looks the same whether the number is registered or
 * not: a row is kept either way (`userId` null, nothing sent), so the
 * per-number limits apply alike.
 */
@Entity('sms_codes')
@Index('ix_sms_codes_phone', ['purpose', 'phoneIndex', 'createdAt'])
export class SmsCode {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', length: 20 })
  purpose: SmsCodePurpose;

  /** The number's blind index, as on users. */
  @Column({ type: 'char', length: 64 })
  phoneIndex: string;

  /** Whose code: for a phone change, the person changing their number. */
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
