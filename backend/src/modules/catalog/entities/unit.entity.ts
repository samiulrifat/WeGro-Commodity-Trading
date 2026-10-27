import { Check, Column, Entity, Index } from 'typeorm';
import { UnitKind } from '../catalog.enums';
import { CatalogEntry } from './catalog-entry.base';

/**
 * A unit of measure. Quantities on the ledger are whole numbers in the unit
 * of their produce or input, so a unit is chosen small enough that whole
 * numbers suffice (GRAM for seed, ML for pesticide).
 */
@Entity('units')
@Check('ck_units_code', `"code" ~ '^[A-Z0-9_-]{1,31}$'`)
@Check('ck_units_kind', `"kind" IN ('mass', 'volume', 'count')`)
@Index('uq_units_name', { synchronize: false })
export class Unit extends CatalogEntry {
  @Column({ type: 'varchar', length: 10 })
  kind: UnitKind;

  /** Short label shown after numbers, e.g. "kg". */
  @Column({ type: 'varchar', length: 12 })
  symbol: string;

  /** The same in Bengali, e.g. "কেজি". */
  @Column({ type: 'varchar', length: 12 })
  symbolBn: string;
}
