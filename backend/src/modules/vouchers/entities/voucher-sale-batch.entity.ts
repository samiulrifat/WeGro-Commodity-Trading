import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/** Batches a sale drew from: produce can be traced back to these inputs. */
@Entity('voucher_sale_batches')
@Index('ix_voucher_sale_batches_batch', ['batchId'])
export class VoucherSaleBatch {
  @PrimaryColumn({ type: 'bigint' })
  saleId: string;

  @PrimaryColumn({ type: 'uuid' })
  batchId: string;

  @Column({ type: 'smallint' })
  position: number;
}
