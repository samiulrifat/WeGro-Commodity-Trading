import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import type { TxResult } from '../tx/transaction.service';
import type { ChainEvent } from './chain-event.entity';
import { EventHandlerRegistry } from './event-handler.registry';
import { toJsonSafe } from './event-indexer.service';

/**
 * Applies a transaction's events to the read models straight away, through
 * the very handlers the indexer runs, so the API can answer with the new
 * state without waiting for the indexer. A transaction can touch several
 * contracts (approving a voucher also activates its project): every event
 * goes to its own module, in log order, in one database transaction.
 *
 * Handlers are idempotent, so the indexer applying the same events again
 * later changes nothing.
 */
@Injectable()
export class ReceiptApplier {
  private readonly logger = new Logger(ReceiptApplier.name);

  constructor(
    private readonly handlers: EventHandlerRegistry,
    private readonly dataSource: DataSource,
  ) {}

  async apply(result: TxResult, manager?: EntityManager): Promise<void> {
    if (!manager) {
      try {
        await this.dataSource.transaction((m) => this.apply(result, m));
      } catch (error) {
        // The ledger has it; only our copy failed. Say so plainly, so nobody
        // repeats an action that already happened. The indexer retries.
        this.logger.error(
          `Transaction ${result.hash} succeeded but updating the database failed`,
          error instanceof Error ? error.stack : String(error),
        );
        throw new InternalServerErrorException({
          message:
            'Saved on the ledger, but the database copy could not be updated yet; it will be retried automatically. Do not repeat the action.',
          code: 'READ_MODEL_UPDATE_FAILED',
          details: { txHash: result.hash },
        });
      }
      return;
    }
    for (const e of result.events) {
      const handlers = this.handlers.handlersFor(e.contract, e.name);
      if (handlers.length === 0) continue;
      const event = {
        contract: e.contract,
        eventName: e.name,
        args: toJsonSafe(e.args) as Record<string, unknown>,
        blockNumber: result.blockNumber,
        logIndex: e.logIndex,
        txHash: result.hash,
        blockTime: result.blockTime,
      } as ChainEvent;
      for (const handler of handlers) await handler(event, manager);
    }
  }
}
