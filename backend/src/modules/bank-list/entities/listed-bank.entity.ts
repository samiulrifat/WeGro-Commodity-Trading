import { Column, Entity, PrimaryColumn } from 'typeorm';

/** A bank in Bangladesh, from the official list an admin imported. */
@Entity('bank_list_banks')
export class ListedBank {
  /** The bank's clearing code: the first three digits of its routing numbers. */
  @PrimaryColumn({ type: 'smallint' })
  code: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;
}
