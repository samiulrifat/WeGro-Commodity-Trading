import { Column, Entity, PrimaryColumn } from 'typeorm';

/** A record a sweep found differing from the ledger, and how. */
@Entity('verification_findings')
export class VerificationFinding {
  @PrimaryColumn({ type: 'uuid' })
  runId: string;

  @PrimaryColumn({ type: 'varchar', length: 20 })
  type: string;

  @PrimaryColumn({ type: 'varchar', length: 66 })
  recordId: string;

  @Column({ type: 'varchar', length: 200, array: true })
  mismatches: string[];
}
