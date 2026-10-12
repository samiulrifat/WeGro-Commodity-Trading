import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { InputKind } from '../catalog.enums';
import { CatalogEntry } from './catalog-entry.base';
import { ProduceType } from './produce-type.entity';
import { Unit } from './unit.entity';

/** An input given through vouchers. Unit and produce are fixed once created. */
@Entity('input_types')
@Check('ck_input_types_code', `"code" ~ '^[A-Z0-9_-]{1,31}$'`)
@Check(
  'ck_input_types_kind',
  `"kind" IN ('seed', 'fertilizer', 'pesticide', 'other')`,
)
@Index('uq_input_types_name', { synchronize: false })
@Index('ix_input_types_kind', ['kind'])
export class InputType extends CatalogEntry {
  @Column({ type: 'varchar', length: 12 })
  kind: InputKind;

  @Column({ type: 'varchar', length: 31 })
  unitCode: string;

  @ManyToOne(() => Unit, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'unit_code' })
  unit?: Unit;

  /** The crop a seed is for; empty for inputs used on any crop. */
  @Column({ type: 'varchar', length: 31, nullable: true })
  produceCode: string | null;

  @ManyToOne(() => ProduceType, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'produce_code' })
  produce?: ProduceType | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;
}
