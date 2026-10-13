import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { numericBigintTransformer } from '../../../database/transformers';

/** A bank officer viewed a farmer's track record (the ledger's SummaryViewed). */
@Entity('summary_views')
@Index('ix_summary_views_farmer', ['farmerId', 'viewedAt'])
export class SummaryView {
  @PrimaryColumn({ type: 'bigint', transformer: numericBigintTransformer })
  blockNumber: number;

  @PrimaryColumn({ type: 'int' })
  logIndex: number;

  @Column({ type: 'uuid' })
  farmerId: string;

  @Column({ type: 'uuid' })
  bankId: string;

  @Column({ type: 'uuid' })
  viewerId: string;

  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'timestamptz' })
  viewedAt: Date;
}
