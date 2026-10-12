import { Check, Column, Entity, Index } from 'typeorm';
import { CatalogEntry } from './catalog-entry.base';

/** One number the officer enters with a field record, e.g. plant height. */
export interface MeasurementDefinition {
  /** Stable key the value is stored under, e.g. "plant_height". */
  key: string;
  label: string;
  labelBn: string;
  /** Shown after the number, e.g. "cm" or "%". */
  unit: string | null;
  min: number | null;
  max: number | null;
  /** Decimal places allowed, 0 to 3. */
  decimals: number;
  required: boolean;
}

/** A kind of farm update in the field officer's dropdown, and the form it needs. */
@Entity('field_record_types')
@Check('ck_field_record_types_code', `"code" ~ '^[A-Z0-9_-]{1,31}$'`)
@Index('uq_field_record_types_name', { synchronize: false })
export class FieldRecordType extends CatalogEntry {
  @Column({ type: 'boolean', default: false })
  requiresPhoto: boolean;

  @Column({ type: 'boolean', default: true })
  requiresLocation: boolean;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  measurements: MeasurementDefinition[];
}
