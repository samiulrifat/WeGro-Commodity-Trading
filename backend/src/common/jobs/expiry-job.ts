import {
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { ChainClock } from '../../blockchain/chain-clock';
import { ContractRevertException } from '../../blockchain/errors/contract-errors';
import type { ReceiptApplier } from '../../blockchain/indexer/receipt-applier';
import type { TxResult } from '../../blockchain/tx/transaction.service';

/** Items released per run; the rest wait for the next one. */
const BATCH = 100;

/**
 * Releases ledger items past their deadline (unpaid reservations, unconfirmed
 * sales). Anyone may call the contracts' expire functions; the operator key
 * does it here.
 *
 * Due items come from one indexed query, judged by the chain's clock, and are
 * sent together: the per-key queue pipelines their nonces, so a batch costs
 * about one block rather than one each. Runs are never concurrent.
 */
export abstract class ExpiryJob<Id>
  implements OnApplicationBootstrap, OnModuleDestroy
{
  protected readonly logger: Logger;
  private timer?: NodeJS.Timeout;
  private running?: Promise<number>;

  protected constructor(
    readonly name: string,
    private readonly enabled: boolean,
    private readonly intervalMs: number,
    private readonly clock: ChainClock,
    private readonly receipts: ReceiptApplier,
  ) {
    this.logger = new Logger(name);
  }

  /** Ids whose deadline is at or before `chainNow`, oldest first. */
  protected abstract dueIds(chainNow: Date, limit: number): Promise<Id[]>;

  /** Sends the expire transaction for one item. */
  protected abstract expire(id: Id): Promise<TxResult>;

  onApplicationBootstrap(): void {
    if (!this.enabled) return;
    this.timer = setInterval(() => {
      void this.run().catch((error: unknown) =>
        this.logger.error(`Run failed: ${String(error)}`),
      );
    }, this.intervalMs);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    await this.running?.catch(() => undefined);
  }

  /** Releases what is due; returns how many items were released. */
  run(): Promise<number> {
    this.running ??= this.sweep().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  private async sweep(): Promise<number> {
    const ids = await this.dueIds(await this.clock.now(), BATCH);
    const results = await Promise.allSettled(ids.map((id) => this.release(id)));
    const released = results.filter(
      (r) => r.status === 'fulfilled' && r.value,
    ).length;
    for (const r of results) {
      if (r.status === 'rejected') this.logger.error(String(r.reason));
    }
    if (released > 0) this.logger.log(`Released ${released} item(s)`);
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
