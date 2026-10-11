import {
  Column,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { IdCheckReport } from '../../participants/id-check/id-check';
import { User } from './user.entity';

/**
 * A person's details. Never on the ledger: only `detailsHash`, a salted
 * fingerprint of them, is.
 *
 * Every personal field is AES-256-GCM encrypted (see IdentityCryptoService),
 * bound to this row and column. `district` stays readable for filtering; it
 * identifies no one. `nidIndex` is a keyed hash for duplicate detection.
 *
 * NID, birth date and address are empty only for the super admin, who is the
 * platform operator rather than a registered participant.
 */
@Entity('personal_details')
export class PersonalDetails {
  @PrimaryColumn('uuid')
  userId: string;

  @OneToOne(() => User, (u) => u.details, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'text' })
  fullNameEnc: string;

  @Column({ type: 'text' })
  phoneEnc: string;

  @Column({ type: 'text', nullable: true })
  nidEnc: string | null;

  @Column({ type: 'text', nullable: true })
  dateOfBirthEnc: string | null;

  @Column({ type: 'text', nullable: true })
  addressEnc: string | null;

  @Index('ix_personal_details_district')
  @Column({ type: 'varchar', length: 20, nullable: true })
  district: string | null;

  @Index('uq_personal_details_nid_index', { unique: true })
  @Column({ type: 'char', length: 64, nullable: true })
  nidIndex: string | null;

  /** The fingerprint registered on-chain for these details. */
  @Column({ type: 'char', length: 66, nullable: true })
  detailsHash: string | null;

  /** Result of the practice ID check; holds no personal data. */
  @Column({ type: 'jsonb', nullable: true })
  idCheck: Omit<IdCheckReport, 'details'> | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
