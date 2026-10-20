import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';

/**
 * A WeGro bank account investors pay into. The branch is picked from the
 * bank list; its names are kept here, so a later list does not change them.
 * Retired, never deleted: bookings may point people to it.
 */
@Entity('payment_accounts')
@Index('uq_payment_accounts_account', ['routingNumber', 'accountNumber'], {
  unique: true,
})
export class PaymentAccount extends BaseEntity {
  @Column({ type: 'varchar', length: 100 })
  bankName: string;

  @Column({ type: 'varchar', length: 100 })
  branchName: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  districtName: string | null;

  @Column({ type: 'char', length: 9 })
  routingNumber: string;

  /** The name on the account, as investors must write it. */
  @Column({ type: 'varchar', length: 100 })
  accountName: string;

  @Column({ type: 'varchar', length: 20 })
  accountNumber: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  /** Order shown to investors; ties by bank name. */
  @Column({ type: 'smallint', default: 0 })
  sortOrder: number;

  @Column({ type: 'uuid' })
  createdById: string;

  @Column({ type: 'uuid' })
  updatedById: string;
}
