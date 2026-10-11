import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { blockNumberTransformer } from './chain-event.entity';

/**
 * How far the indexer has got. Updated in the same database transaction as
 * the events it covers, so the checkpoint and the stored events always agree.
 */
@Entity()
export class IndexerState {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id: string;

  /** Last block whose events are fully stored. */
  @Column({ type: 'bigint', transformer: blockNumberTransformer })
  lastBlock: number;

  /** Hash of `lastBlock`, to notice if the chain was rewritten under us. */
  @Column({ type: 'char', length: 66 })
  lastBlockHash: string;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
