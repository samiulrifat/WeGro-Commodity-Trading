import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/** A supplier approved for a voucher, in the order the ledger lists them. */
@Entity('voucher_suppliers')
@Index('ix_voucher_suppliers_supplier', ['supplierId'])
export class VoucherSupplier {
  @PrimaryColumn({ type: 'uuid' })
  voucherId: string;

  @PrimaryColumn({ type: 'uuid' })
  supplierId: string;

  @Column({ type: 'smallint' })
  position: number;
}
