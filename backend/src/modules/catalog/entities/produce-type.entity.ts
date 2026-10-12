import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ProduceCategory } from '../catalog.enums';
import { CatalogEntry } from './catalog-entry.base';
import { Unit } from './unit.entity';

/**
 * A crop a project can grow. Category and unit are fixed once created: they
 * decide the project's path and the meaning of every quantity on the ledger.
 * A different quality is a different produce type, not a grade.
 */
@Entity('produce_types')
@Check('ck_produce_types_code', `"code" ~ '^[A-Z0-9_-]{1,31}$'`)
@Check(
  'ck_produce_types_category',
  `"category" IN ('storable_crop', 'spice', 'perishable')`,
)
@Check(
  'ck_produce_types_duration',
  `"typical_duration_months" BETWEEN 1 AND 60`,
)
@Index('uq_produce_types_name', { synchronize: false })
@Index('ix_produce_types_category', ['category'])
export class ProduceType extends CatalogEntry {
  @Column({ type: 'varchar', length: 16 })
  category: ProduceCategory;

  @Column({ type: 'varchar', length: 31 })
  unitCode: string;

  @ManyToOne(() => Unit, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'unit_code' })
  unit?: Unit;

  /** Usual months from planting to harvest, a hint for project duration. */
  @Column({ type: 'smallint', nullable: true })
  typicalDurationMonths: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  descriptionBn: string | null;
}
