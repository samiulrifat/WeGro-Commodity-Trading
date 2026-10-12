import { Check, Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';
import { numericBigintTransformer } from '../../../database/transformers';
import { StorageType } from '../warehouse.enums';

/** A warehouse site. Its details are fingerprinted on the ledger when registered. */
@Entity('warehouse_sites')
@Index('uq_warehouse_sites_name', { synchronize: false })
@Check('ck_warehouse_sites_status', `"status" IN ('submitted', 'registered')`)
@Check(
  'ck_warehouse_sites_type',
  `"storage_type" IN ('warehouse', 'cold_storage')`,
)
@Check(
  'ck_warehouse_sites_capacity',
  `"capacity_kg" IS NULL OR "capacity_kg" > 0`,
)
export class WarehouseSite extends BaseEntity {
  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 20 })
  districtCode: string;

  @Column({ type: 'varchar', length: 300 })
  address: string;

  @Column({ type: 'varchar', length: 16 })
  storageType: StorageType;

  @Column({
    type: 'bigint',
    nullable: true,
    transformer: numericBigintTransformer,
  })
  capacityKg: number | null;

  @Column({ type: 'char', length: 66 })
  detailsHash: string;

  @Column({ type: 'varchar', length: 10 })
  status: 'submitted' | 'registered';

  @Column({ type: 'uuid' })
  createdById: string;
}
