import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';
import {
  bigintTransformer,
  numericBigintTransformer,
} from '../../../database/transformers';
import { ProduceType } from '../../catalog/entities/produce-type.entity';
import { User } from '../../users/entities/user.entity';
import {
  DurationType,
  ProjectChainState,
  ProjectStage,
} from '../project.enums';

/**
 * A farming project. Terms are editable while the project is a local draft;
 * publishing fingerprints them into the ledger, after which they never
 * change. Stage and slot counts mirror ProjectLedger. Money is in poisha.
 */
@Entity('projects')
@Check(
  'ck_projects_stage',
  `"stage" IN ('draft', 'open_for_funding', 'funded', 'active', 'ready_for_sale', 'paid_out', 'closed', 'cancelled')`,
)
@Check(
  'ck_projects_chain_state',
  `"chain_state" IN ('local', 'submitted', 'confirmed')`,
)
@Check(
  'ck_projects_duration_type',
  `"duration_type" IN ('short_term', 'long_term')`,
)
@Check(
  'ck_projects_category',
  `"category" IN ('storable_crop', 'spice', 'perishable')`,
)
@Check(
  'ck_projects_split',
  `"farmer_bps" + "investor_bps" + "wegro_bps" = 10000`,
)
@Check(
  'ck_projects_money',
  `"slot_price" > 0 AND "funding_target" > 0 AND "funding_target" % "slot_price" = 0`,
)
@Check(
  'ck_projects_slots',
  `"issued_slots" >= 0 AND "reserved_slots" >= 0 AND "issued_slots" + "reserved_slots" <= "total_slots"`,
)
@Check(
  'ck_projects_estimate',
  `"estimated_return_min_bps" BETWEEN 0 AND "estimated_return_max_bps"`,
)
@Index('ix_projects_stage', ['stage'])
@Index('ix_projects_produce', ['produceCode'])
@Index('ix_projects_district', ['districtCode'])
@Index('ix_projects_duration_type', ['durationType'])
@Index('ix_projects_farmer', ['farmerId'])
export class Project extends BaseEntity {
  @Column({ type: 'varchar', length: 120 })
  title: string;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 31 })
  produceCode: string;

  @ManyToOne(() => ProduceType, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'produce_code' })
  produce?: ProduceType;

  /** Copied from the produce type: it decides the project's path. */
  @Column({ type: 'varchar', length: 16 })
  category: string;

  @Column({ type: 'varchar', length: 20 })
  districtCode: string;

  /** Upazila and village; identifies a place, not a person. */
  @Column({ type: 'varchar', length: 200 })
  location: string;

  @Column({ type: 'uuid' })
  farmerId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'farmer_id' })
  farmer?: User;

  @Column({ type: 'varchar', length: 10 })
  durationType: DurationType;

  @Column({ type: 'smallint' })
  durationMonths: number;

  /** 0 = one final payout. */
  @Column({ type: 'smallint', default: 0 })
  payoutIntervalMonths: number;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  fundingTarget: bigint;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  slotPrice: bigint;

  @Column({ type: 'int' })
  totalSlots: number;

  @Column({ type: 'smallint' })
  farmerBps: number;

  @Column({ type: 'smallint' })
  investorBps: number;

  @Column({ type: 'smallint' })
  wegroBps: number;

  @Column({ type: 'boolean', default: false })
  insured: boolean;

  /** Admin's estimate of the investor return; never a promise. */
  @Column({ type: 'int' })
  estimatedReturnMinBps: number;

  @Column({ type: 'int' })
  estimatedReturnMaxBps: number;

  @Column({ type: 'date', nullable: true })
  plannedStartDate: string | null;

  @Column({ type: 'varchar', length: 20 })
  stage: ProjectStage;

  @Column({ type: 'varchar', length: 10 })
  chainState: ProjectChainState;

  /** Fingerprint of the terms, fixed when publishing. */
  @Column({ type: 'char', length: 66, nullable: true })
  termsHash: string | null;

  @Column({ type: 'int', default: 0 })
  issuedSlots: number;

  /** Held by pending reservations. */
  @Column({ type: 'int', default: 0 })
  reservedSlots: number;

  /** Set when a project with paid slots is cancelled: what Accounts must refund. */
  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  refundTotal: bigint | null;

  @Column({ type: 'uuid' })
  createdById: string;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  stageChangedAt: Date | null;

  /** Position of the last ledger stage event applied; older ones are ignored. */
  @Column({
    type: 'bigint',
    default: -1,
    transformer: numericBigintTransformer,
  })
  chainEventBlock: number;

  @Column({ type: 'int', default: -1 })
  chainEventLog: number;
}
