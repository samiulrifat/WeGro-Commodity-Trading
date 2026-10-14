import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * Which of WeGro's own records an import has already brought in, by kind and
 * WeGro's id, and what it became here. Re-running an import skips them, so a
 * stopped import resumes where it left off.
 */
@Entity('import_records')
export class ImportRecord {
  /** person, project, investment, history, unit, produce-type, ... */
  @PrimaryColumn({ type: 'varchar', length: 20 })
  kind: string;

  /** WeGro's id for the record (the id column of the CSV). */
  @PrimaryColumn({ type: 'varchar', length: 100 })
  externalId: string;

  /** The id here: a uuid, a ledger number or a catalog code. */
  @Column({ type: 'varchar', length: 66 })
  internalId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  importedAt: Date;
}
