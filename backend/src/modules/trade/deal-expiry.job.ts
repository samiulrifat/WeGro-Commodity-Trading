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
import { Offer } from './entities/offer.entity';
import { OfferStatus } from './trade.enums';

/** Releases deals left unpaid past their deadline, returning the quantity to the listing. */
@Injectable()
@ScheduledJob({
  name: 'deal-expiry',
  description: 'Releases deals left unpaid past their payment deadline',
  every: 'EXPIRY_SWEEP_MS',
})
export class DealExpiryJob extends ExpiryJob<number> {
  constructor(
    clock: ChainClock,
    receipts: ReceiptApplier,
    @InjectRepository(Offer) private readonly offers: Repository<Offer>,
    private readonly tx: TransactionService,
  ) {
    super(DealExpiryJob.name, clock, receipts);
  }

  protected async dueIds(chainNow: Date, limit: number): Promise<number[]> {
    const rows = await this.offers.find({
      where: {
        status: OfferStatus.APPROVED,
        paymentDueAt: LessThanOrEqual(chainNow),
      },
      select: { id: true },
      order: { paymentDueAt: 'ASC' },
      take: limit,
    });
    return rows.map((r) => r.id);
  }

  protected expire(id: number): Promise<TxResult> {
    return this.tx.send(KeyService.OPERATOR_INDEX, 'TradeLedger', (c) =>
      c.expireDeal.populateTransaction(id),
    );
  }
}
