import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import type { EnvironmentVariables } from '../../config/env.validation';
import { Reservation } from './entities/reservation.entity';
import { ReservationStatus } from './project.enums';

/** Releases unpaid reservations past their deadline, returning their slots. */
@Injectable()
export class ReservationExpiryJob extends ExpiryJob<number> {
  constructor(
    config: ConfigService<EnvironmentVariables, true>,
    clock: ChainClock,
    receipts: ReceiptApplier,
    @InjectRepository(Reservation)
    private readonly reservations: Repository<Reservation>,
    private readonly tx: TransactionService,
  ) {
    super(
      ReservationExpiryJob.name,
      config.get('JOBS_ENABLED', { infer: true }),
      config.get('EXPIRY_SWEEP_MS', { infer: true }),
      clock,
      receipts,
    );
  }

  protected async dueIds(chainNow: Date, limit: number): Promise<number[]> {
    const rows = await this.reservations.find({
      where: {
        status: ReservationStatus.Pending,
        expiresAt: LessThanOrEqual(chainNow),
      },
      select: { id: true },
      order: { expiresAt: 'ASC' },
      take: limit,
    });
    return rows.map((r) => r.id);
  }

  protected expire(id: number): Promise<TxResult> {
    return this.tx.send(KeyService.OPERATOR_INDEX, 'ProjectLedger', (c) =>
      c.expireReservation.populateTransaction(id),
    );
  }
}
