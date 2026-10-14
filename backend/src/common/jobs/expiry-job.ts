import { Logger } from '@nestjs/common';
import type { ChainClock } from '../../blockchain/chain-clock';
import { ContractRevertException } from '../../blockchain/errors/contract-errors';
import type { ReceiptApplier } from '../../blockchain/indexer/receipt-applier';
import type { TxResult } from '../../blockchain/tx/transaction.service';
import { PartialJobFailure, type ScheduledJobRunner } from './scheduled-job';

/** Items sent together; a run takes batches until nothing is due. */
const BATCH = 100;

/**
 * Releases ledger items past their deadline (unpaid reservations, unconfirmed
 * sales, unpaid deals). Anyone may call the contracts' expire functions; the
 * operator key does it here. The scheduler runs it (@ScheduledJob on each
 * subclass).
 *
 * Due items come from one indexed query, judged by the chain's clock, and a
 * batch is sent together: the per-key queue pipelines their nonces, so a
 * batch costs about one block rather than one each. A run keeps taking
 * batches until nothing is due, stopping early if a batch releases nothing
 * (items the ledger says are not due yet, or already closed elsewhere: the
 * indexer brings those up to date). Runs are never concurrent.
 */
export abstract class ExpiryJob<Id> implements ScheduledJobRunner {
  protected readonly logger: Logger;
  private running?: Promise<number>;

  protected constructor(
    readonly name: string,
    private readonly clock: ChainClock,
    private readonly receipts: ReceiptApplier,
  ) {
    this.logger = new Logger(name);
  }

  /** Ids whose deadline is at or before `chainNow`, oldest first. */
  protected abstract dueIds(chainNow: Date, limit: number): Promise<Id[]>;

  /** Sends the expire transaction for one item. */
  protected abstract expire(id: Id): Promise<TxResult>;

  /** Releases everything due; returns how many items were released. */
  run(): Promise<number> {
    this.running ??= this.sweep().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  private async sweep(): Promise<number> {
    let released = 0;
    const errors: string[] = [];
    for (;;) {
      const ids = await this.dueIds(await this.clock.now(), BATCH);
      if (ids.length === 0) break;
      const results = await Promise.allSettled(
        ids.map((id) => this.release(id)),
      );
      let progress = 0;
      for (const r of results) {
        if (r.status === 'rejected') errors.push(String(r.reason));
        else if (r.value) progress++;
      }
      released += progress;
      if (ids.length < BATCH || progress === 0) break;
    }
    if (released > 0) this.logger.log(`Released ${released} item(s)`);
    if (errors.length > 0) {
      throw new PartialJobFailure(released, errors.length, errors[0]);
    }
    return released;
  }

  private async release(id: Id): Promise<boolean> {
    try {
      await this.receipts.apply(await this.expire(id));
      return true;
    } catch (error) {
      // Not yet due by the chain's clock, or already closed elsewhere: the
      // indexer brings the database up to date; the next run tries again.
      if (error instanceof ContractRevertException) return false;
      throw error;
    }
  }
}
