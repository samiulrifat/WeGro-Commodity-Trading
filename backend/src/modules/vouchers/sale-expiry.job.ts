import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { ChainClock } from '../../blockchain/chain-clock';
import { ReceiptApplier } from '../../blockchain/indexer/receipt-applier';
import { KeyService } from '../../blockchain/keys/key.service';
import {
  type TxResult,
  TransactionService,
} from '../../blockchain/tx/transaction.service';
import { ExpiryJob } from '../../common/jobs/expiry-job';
import { ScheduledJob } from '../../common/jobs/scheduled-job';
import { VoucherSale } from './entities/voucher-sale.entity';
import { SaleStatus } from './voucher.enums';

/** Releases voucher sales the field officer did not confirm in time, freeing their quantity. */
@Injectable()
@ScheduledJob({
  name: 'sale-expiry',
  description: 'Releases input sales the field officer did not confirm in time',
  every: 'EXPIRY_SWEEP_MS',
})
export class SaleExpiryJob extends ExpiryJob<number> {
  constructor(
    clock: ChainClock,
    receipts: ReceiptApplier,
    @InjectRepository(VoucherSale)
    private readonly sales: Repository<VoucherSale>,
    private readonly tx: TransactionService,
  ) {
    super(SaleExpiryJob.name, clock, receipts);
  }

  protected async dueIds(chainNow: Date, limit: number): Promise<number[]> {
    const rows = await this.sales.find({
      where: {
        status: SaleStatus.Pending,
        expiresAt: LessThanOrEqual(chainNow),
      },
      select: { id: true },
      order: { expiresAt: 'ASC' },
      take: limit,
    });
    return rows.map((r) => r.id);
  }

  protected expire(id: number): Promise<TxResult> {
    return this.tx.send(KeyService.OPERATOR_INDEX, 'VoucherRegistry', (c) =>
      c.expireSale.populateTransaction(id),
    );
  }
}
