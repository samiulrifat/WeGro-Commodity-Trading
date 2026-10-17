import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
} from 'typeorm';
import { blockNumberTransformer } from '../../../blockchain/indexer/chain-event.entity';
import { BaseEntity } from '../../../database/base.entity';
import { Language } from '../language';
import { ParticipantStatus, Role } from '../roles';
import { PersonalDetails } from './personal-details.entity';

/** Where a person's registration stands on the ledger. */
export enum ChainState {
  /** Saved here; the registration transaction is not yet confirmed on-chain. */
  Submitted = 'submitted',
  /** Seen on-chain. */
  Confirmed = 'confirmed',
  /** The super admin: the contracts' operator key, not a registered participant. */
  Operator = 'operator',
}

/**
 * A person who can sign in. Holds what authentication and authorisation need;
 * personal details live encrypted in `personal_details`.
 *
 * `status`, `account` and `fieldOfficerId` mirror the ledger (AccessRegistry
 * events), which is the source of truth for them.
 */
@Entity('users')
@Index('ix_users_role_status', ['role', 'status'])
@Index('uq_users_single_super_admin', ['role'], {
  unique: true,
  where: `"role" = 'super_admin'`,
})
@Index('ix_users_pending', ['createdAt'], { where: `"status" = 'pending'` })
@Check('ck_users_language', `"language" IN ('en', 'bn')`)
export class User extends BaseEntity {
  @Column({ type: 'varchar', length: 20 })
  role: Role;

  @Column({ type: 'varchar', length: 10 })
  status: ParticipantStatus;

  @Column({ type: 'varchar', length: 10 })
  chainState: ChainState;

  /** Keyed hash of the normalised phone number: the login lookup. */
  @Index('uq_users_phone_index', { unique: true })
  @Column({ type: 'char', length: 64 })
  phoneIndex: string;

  @Column({ type: 'varchar', length: 200 })
  passwordHash: string;

  /** Set for temporary passwords: until changed, the account can only change its password. */
  @Column({ type: 'boolean', default: false })
  mustChangePassword: boolean;

  /** Bumped to invalidate every access token at once (password change, logout everywhere, key change). */
  @Column({ type: 'int', default: 0 })
  tokenVersion: number;

  @Column({ type: 'int', default: 0 })
  failedLoginCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  /** Index of this person's signing key under the master seed. */
  @Index('uq_users_key_index', { unique: true })
  @Column({ type: 'int' })
  keyIndex: number;

  /** New key index while a key replacement is being confirmed on-chain. */
  @Index('uq_users_pending_key_index', { unique: true })
  @Column({ type: 'int', nullable: true })
  pendingKeyIndex: number | null;

  /** Current on-chain address (from the ledger). */
  @Index('uq_users_account', { unique: true })
  @Column({ type: 'char', length: 42 })
  account: string;

  @Index('ix_users_registered_by')
  @Column({ type: 'uuid', nullable: true })
  registeredById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'registered_by_id' })
  registeredBy?: User | null;

  /** A farmer's field officer (from the ledger). */
  @Index('ix_users_field_officer')
  @Column({ type: 'uuid', nullable: true })
  fieldOfficerId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'field_officer_id' })
  fieldOfficer?: User | null;

  /** Why the person was rejected; kept off-chain. */
  @Column({ type: 'varchar', length: 300, nullable: true })
  statusReason: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  statusChangedAt: Date | null;

  @Column({ type: 'char', length: 66, nullable: true })
  registrationTx: string | null;

  /**
   * Position (block, log index) of the last ledger event applied to this row.
   * Events apply only if newer, so applying one twice, or late, is harmless.
   */
  @Column({
    type: 'bigint',
    default: -1,
    transformer: blockNumberTransformer,
  })
  chainEventBlock: number;

  @Column({ type: 'int', default: -1 })
  chainEventLog: number;

  @Column({ type: 'boolean', default: false })
  isDemo: boolean;

  /** The language the person chose; null until they choose (the app shows English). */
  @Column({ type: 'varchar', length: 2, nullable: true })
  language: Language | null;

  @OneToOne(() => PersonalDetails, (d) => d.user)
  details?: PersonalDetails;
}
