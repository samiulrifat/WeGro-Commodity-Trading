import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

/** bigint columns come back from pg as strings; block numbers fit in a JS number. */
export const blockNumberTransformer = {
  to: (value: number) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};

/**
 * One decoded event from a platform contract: the database copy of the
 * ledger's history. A log is identified by its block and position, so the
 * same log can never be stored twice.
 */
@Entity()
@Unique('uq_chain_event_position', ['blockNumber', 'logIndex'])
@Index('ix_chain_event_contract_event', ['contract', 'eventName'])
/** Expression index on args->>'projectId' (migration Projects): per-project history. */
@Index('ix_chain_event_project_id', { synchronize: false })
/** GIN index on args (migration History): any record's history by its id, in any argument. */
@Index('ix_chain_event_args', { synchronize: false })
export class ChainEvent {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'bigint', transformer: blockNumberTransformer })
  blockNumber: number;

  @Column({ type: 'char', length: 66 })
  blockHash: string;

  @Column({ type: 'timestamptz' })
  blockTime: Date;

  @Index('ix_chain_event_tx_hash')
  @Column({ type: 'char', length: 66 })
  txHash: string;

  /** Who sent the transaction (checksummed address); null until filled in for rows indexed before it was kept. */
  @Column({ type: 'char', length: 42, nullable: true })
  txFrom: string | null;

  @Column({ type: 'int' })
  logIndex: number;

  /** Platform contract name, e.g. "ProjectLedger". */
  @Column({ type: 'varchar', length: 32 })
  contract: string;

  @Column({ type: 'char', length: 42 })
  address: string;

  @Column({ type: 'varchar', length: 64 })
  eventName: string;

  /** Event arguments by name; integers as decimal strings, bytes as hex. */
  @Column({ type: 'jsonb' })
  args: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  indexedAt: Date;
}
