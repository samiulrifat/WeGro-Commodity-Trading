import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { ContractName } from '../contracts.registry';
import type { ChainEvent } from './chain-event.entity';

/**
 * Updates a read model from one event. Runs inside the indexer's database
 * transaction: if it throws, the whole batch (events and checkpoint) rolls
 * back and is retried, so read models never drift from the ledger.
 */
export type ChainEventHandler = (
  event: ChainEvent,
  manager: EntityManager,
) => Promise<void>;

/** Clears a read model before a full re-index. */
export type ReadModelReset = (manager: EntityManager) => Promise<void>;

/**
 * Where business modules register their read-model updates. Lookup per event
 * is a single map access.
 */
@Injectable()
export class EventHandlerRegistry {
  private readonly handlers = new Map<string, ChainEventHandler[]>();
  private readonly live = new Map<string, ChainEventHandler[]>();
  private readonly resets: ReadModelReset[] = [];

  on(
    contract: ContractName,
    eventName: string,
    handler: ChainEventHandler,
  ): void {
    const key = `${contract}.${eventName}`;
    const list = this.handlers.get(key);
    if (list) list.push(handler);
    else this.handlers.set(key, [handler]);
  }

  /**
   * Reacts to an event as it happens (notifications): run only for
   * transactions this backend sends, after their read-model update has
   * committed, never by the indexer, so a replay never repeats them.
   */
  onLive(
    contract: ContractName,
    eventName: string,
    handler: ChainEventHandler,
  ): void {
    const key = `${contract}.${eventName}`;
    const list = this.live.get(key);
    if (list) list.push(handler);
    else this.live.set(key, [handler]);
  }

  liveHandlersFor(contract: string, eventName: string): ChainEventHandler[] {
    return this.live.get(`${contract}.${eventName}`) ?? [];
  }

  onReset(reset: ReadModelReset): void {
    this.resets.push(reset);
  }

  handlersFor(contract: string, eventName: string): ChainEventHandler[] {
    return this.handlers.get(`${contract}.${eventName}`) ?? [];
  }

  async resetAll(manager: EntityManager): Promise<void> {
    for (const reset of this.resets) await reset(manager);
  }
}
