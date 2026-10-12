import {
  Column,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { numericBigintTransformer } from '../../../database/transformers';

/** Which site a warehouse operator works at (from the ledger's OperatorAssigned). */
@Entity('warehouse_operators')
@Index('ix_warehouse_operators_site', ['siteId'])
export class WarehouseOperator {
  @PrimaryColumn({ type: 'uuid' })
  operatorId: string;

  /** Null = not assigned anywhere. */
  @Column({ type: 'uuid', nullable: true })
  siteId: string | null;

  @Column({
    type: 'bigint',
    default: -1,
    transformer: numericBigintTransformer,
  })
  chainEventBlock: number;

  @Column({ type: 'int', default: -1 })
  chainEventLog: number;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
