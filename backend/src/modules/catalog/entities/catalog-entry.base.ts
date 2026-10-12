import {
  Column,
  CreateDateColumn,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Shared shape of every catalog list. The code is the primary key and is
 * written to the ledger, so it never changes; entries are deactivated rather
 * than deleted.
 */
export abstract class CatalogEntry {
  @PrimaryColumn({ type: 'varchar', length: 31 })
  code: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ type: 'varchar', length: 80 })
  nameBn: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  /** Position in dropdowns; ties are ordered by name. */
  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
