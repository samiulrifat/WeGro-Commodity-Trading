import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';
import type { IdCheckReport } from '../id-check/id-check';
import { User } from '../../users/entities/user.entity';

export enum DetailChangeStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  WITHDRAWN = 'withdrawn',
}

/** Which of a person's details a request changes. */
export enum DetailField {
  FULL_NAME = 'fullName',
  PHONE = 'phone',
  NID = 'nid',
  DATE_OF_BIRTH = 'dateOfBirth',
  DISTRICT = 'district',
  ADDRESS = 'address',
}

/**
 * A person's request to change their own details. The ledger lets only an
 * admin (the super admin for staff) record a new details fingerprint, so a
 * change waits for one to approve it; meanwhile the current details stay.
 *
 * The requested details are encrypted as one record bound to this request
 * (the same key as personal details); only blind indexes of the new phone
 * and NID are kept, to refuse duplicates. One pending request per person.
 */
@Entity('detail_change_requests')
@Index('uq_detail_change_requests_pending', ['userId'], {
  unique: true,
  where: `"status" = 'pending'`,
})
@Index('ix_detail_change_requests_status', ['status', 'createdAt'])
@Check(
  'ck_detail_change_requests_status',
  `"status" IN ('pending', 'approved', 'rejected', 'withdrawn')`,
)
export class DetailChangeRequest extends BaseEntity {
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'varchar', length: 10 })
  status: DetailChangeStatus;

  /** The requested details (all of them), encrypted together. */
  @Column({ type: 'text' })
  detailsEnc: string;

  @Column({ type: 'varchar', length: 20, array: true })
  changedFields: DetailField[];

  @Column({ type: 'char', length: 64 })
  phoneIndex: string;

  /** Null for the super admin, who has no NID on file. */
  @Column({ type: 'char', length: 64, nullable: true })
  nidIndex: string | null;

  /** The practice ID check on the requested details; holds no personal data. */
  @Column({ type: 'jsonb', nullable: true })
  idCheck: Omit<IdCheckReport, 'details'> | null;

  @Column({ type: 'uuid', nullable: true })
  decidedById: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  /** Why it was rejected. */
  @Column({ type: 'varchar', length: 300, nullable: true })
  reason: string | null;

  /** The ledger transaction that recorded the approved fingerprint. */
  @Column({ type: 'char', length: 66, nullable: true })
  txHash: string | null;
}
