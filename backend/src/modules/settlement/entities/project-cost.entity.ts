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
import { CostCategory, CostStatus } from '../settlement.enums';

/**
 * A project cost Accounts entered, with its bill. Saved before its
 * transaction and fingerprinted as the ledger's detailsHash; the CostAdded
 * event gives it the ledger's cost id.
 */
@Entity('project_costs')
@Index('ix_project_costs_project', ['projectId', 'incurredOn'])
@Index('uq_project_costs_details', ['detailsHash'], { unique: true })
@Index('uq_project_costs_cost_id', ['costId'], {
  unique: true,
  where: '"cost_id" IS NOT NULL',
})
@Check(
  'ck_project_costs_status',
  `"status" IN ('submitted', 'recorded', 'voided')`,
)
@Check(
  'ck_project_costs_category',
  `"category" IN ('transport', 'labour', 'irrigation', 'storage', 'services', 'other')`,
)
@Check('ck_project_costs_amount', `"amount" > 0`)
export class ProjectCost {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({
    type: 'bigint',
    nullable: true,
    transformer: numericBigintTransformer,
  })
  costId: number | null;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'varchar', length: 12 })
  category: CostCategory;

  /** Poisha. */
  @Column({ type: 'bigint', transformer: bigintTransformer })
  amount: bigint;

  @Column({ type: 'date' })
  incurredOn: string;

  @Column({ type: 'varchar', length: 1000 })
  note: string;

  @Column({ type: 'uuid', nullable: true })
  photoId: string | null;

  @Column({ type: 'char', length: 66 })
  detailsHash: string;

  @Column({ type: 'uuid' })
  enteredById: string;

  @Column({ type: 'varchar', length: 10 })
  status: CostStatus;

  @Column({ type: 'timestamptz', nullable: true })
  recordedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  voidedById: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  voidedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
