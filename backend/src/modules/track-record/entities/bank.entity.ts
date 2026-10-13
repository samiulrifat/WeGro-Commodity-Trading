import { Check, Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';

/** A bank branch farmers can give permission to. Its details are fingerprinted on the ledger. */
@Entity('banks')
@Index('uq_banks_name_branch', { synchronize: false })
@Check('ck_banks_status', `"status" IN ('submitted', 'registered')`)
export class Bank extends BaseEntity {
  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 100 })
  branchName: string;

  @Column({ type: 'varchar', length: 20 })
  districtCode: string;

  @Column({ type: 'varchar', length: 300 })
  address: string;

  @Column({ type: 'char', length: 66 })
  detailsHash: string;

  @Column({ type: 'varchar', length: 10 })
  status: 'submitted' | 'registered';

  @Column({ type: 'uuid' })
  createdById: string;
}
