import { Column, Entity, PrimaryColumn } from 'typeorm';

/** A district as the bank list numbers them (Dhaka is split north and south). */
@Entity('bank_list_districts')
export class ListedDistrict {
  @PrimaryColumn({ type: 'smallint' })
  code: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;
}
