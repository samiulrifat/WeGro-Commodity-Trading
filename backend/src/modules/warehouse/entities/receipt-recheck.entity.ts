import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** A quality re-check that extended a receipt; fingerprinted as the ledger's recheckHash. */
@Entity('receipt_rechecks')
@Index('ix_receipt_rechecks_receipt', ['receiptId'])
@Index('uq_receipt_rechecks_hash', ['recheckHash'], { unique: true })
@Check('ck_receipt_rechecks_status', `"status" IN ('submitted', 'recorded')`)
export class ReceiptRecheck {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'char', length: 66 })
  receiptId: string;

  @Column({ type: 'date' })
  checkedOn: string;

  @Column({ type: 'date' })
  newExpiresOn: string;

  @Column({ type: 'int', nullable: true })
  bagCount: number | null;

  @Column({ type: 'numeric', precision: 4, scale: 1, nullable: true })
  moisturePercent: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  storageBay: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  notes: string | null;

  @Column({ type: 'char', length: 66 })
  recheckHash: string;

  @Column({ type: 'varchar', length: 10 })
  status: 'submitted' | 'recorded';

  @Column({ type: 'uuid' })
  checkedById: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
