import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * A bank branch and its routing number. Bank accounts keep their own copy
 * of the names, so a later list can replace this one freely.
 */
@Entity('bank_list_branches')
@Index('ix_bank_list_branches_bank_district', [
  'bankCode',
  'districtCode',
  'name',
])
export class ListedBranch {
  /** 9 digits: bank, district, branch and a check digit. */
  @PrimaryColumn({ type: 'char', length: 9 })
  routingNumber: string;

  @Column({ type: 'smallint' })
  bankCode: number;

  @Column({ type: 'smallint' })
  districtCode: number;

  @Column({ type: 'smallint' })
  branchCode: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;
}
