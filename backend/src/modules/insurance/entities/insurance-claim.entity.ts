import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import {
  bigintTransformer,
  numericBigintTransformer,
} from '../../../database/transformers';
import { ClaimStatus } from '../insurance.enums';

/**
 * A claim for crop damage, opened by the farmer's field officer (or an admin)
 * citing a weather event, and decided by the project's insurer. The claim
 * evidence and the insurer's assessment are each fingerprinted on the ledger.
 */
@Entity('insurance_claims')
@Index('uq_insurance_claims_project_event', ['projectId', 'eventId'], {
  unique: true,
})
@Index('ix_insurance_claims_status', ['status'])
@Check(
  'ck_insurance_claims_status',
  `"status" IN ('submitted', 'triggered', 'under_review', 'approved', 'rejected')`,
)
@Check(
  'ck_insurance_claims_damage',
  `"damage_percent" BETWEEN 0 AND 100 AND ("assessed_damage_percent" IS NULL OR "assessed_damage_percent" BETWEEN 0 AND 100)`,
)
@Check(
  'ck_insurance_claims_amount',
  `("approved_amount" IS NULL) OR ("approved_amount" > 0 AND "status" = 'approved')`,
)
export class InsuranceClaim {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'uuid' })
  eventId: string;

  // --- The officer's claim (as fingerprinted) ---

  /** Estimated share of the crop damaged, one decimal place. */
  @Column({ type: 'numeric', precision: 4, scale: 1 })
  damagePercent: string;

  @Column({ type: 'varchar', length: 2000 })
  notes: string;

  @Column({ type: 'uuid', array: true, default: () => "'{}'" })
  photoIds: string[];

  @Column({ type: 'char', length: 66 })
  claimHash: string;

  @Column({ type: 'uuid' })
  openedById: string;

  @Column({ type: 'varchar', length: 14 })
  status: ClaimStatus;

  @Column({ type: 'timestamptz', nullable: true })
  openedAt: Date | null;

  // --- The insurer's assessment (as fingerprinted) ---

  @Column({ type: 'numeric', precision: 4, scale: 1, nullable: true })
  assessedDamagePercent: string | null;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  assessmentNotes: string | null;

  @Column({ type: 'uuid', nullable: true })
  assessmentPhotoId: string | null;

  @Column({ type: 'char', length: 66, nullable: true })
  assessmentHash: string | null;

  /** Poisha; set when approved. */
  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  approvedAmount: bigint | null;

  @Column({ type: 'uuid', nullable: true })
  reviewedById: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @Column({
    type: 'bigint',
    default: -1,
    transformer: numericBigintTransformer,
  })
  chainEventBlock: number;

  @Column({ type: 'int', default: -1 })
  chainEventLog: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
