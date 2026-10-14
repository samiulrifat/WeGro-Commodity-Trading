import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { bigintTransformer } from '../../../database/transformers';

/**
 * A project WeGro finished before the platform, imported from its own
 * records. Kept off the ledger and always shown as such; it rounds out a
 * farmer's track record but proves nothing on its own.
 */
@Entity('legacy_projects')
@Index('ix_legacy_projects_farmer', ['farmerId', 'finishedOn'])
@Check('ck_legacy_projects_dates', `"finished_on" >= "started_on"`)
@Check(
  'ck_legacy_projects_money',
  `"funding_raised" >= 0 AND "income" >= 0 AND "costs" >= 0 AND "farmer_received" >= 0`,
)
export class LegacyProject {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  farmerId: string;

  @Column({ type: 'varchar', length: 120 })
  title: string;

  @Column({ type: 'varchar', length: 31 })
  produceCode: string;

  @Column({ type: 'varchar', length: 20 })
  districtCode: string;

  @Column({ type: 'date' })
  startedOn: string;

  @Column({ type: 'date' })
  finishedOn: string;

  /** Poisha. */
  @Column({ type: 'bigint', transformer: bigintTransformer })
  fundingRaised: bigint;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  income: bigint;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  costs: bigint;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  farmerReceived: bigint;

  /** In the produce's unit, as WeGro recorded it. */
  @Column({ type: 'numeric', precision: 14, scale: 3, nullable: true })
  harvested: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 3, nullable: true })
  sold: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  notes: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  importedAt: Date;
}
