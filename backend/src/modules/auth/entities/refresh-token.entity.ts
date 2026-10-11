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
 * One refresh token. Only its SHA-256 is stored: the token itself is 256
 * random bits, so a plain hash is enough and a database copy cannot be used
 * to sign in.
 *
 * Tokens rotate on every use. All tokens descended from one login share a
 * `familyId`; presenting an already-used token means it was copied, and the
 * whole family is revoked.
 */
@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('ix_refresh_tokens_user')
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Index('ix_refresh_tokens_family')
  @Column({ type: 'uuid' })
  familyId: string;

  @Index('uq_refresh_tokens_hash', { unique: true })
  @Column({ type: 'char', length: 64 })
  tokenHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
