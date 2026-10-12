import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Block, Log } from 'ethers';
import {
  DataSource,
  type EntityManager,
  type QueryDeepPartialEntity,
} from 'typeorm';
import type { EnvironmentVariables } from '../../config/env.validation';
import { ContractsRegistry } from '../contracts.registry';
import { eventArgs } from '../utils/event-args';
import { ChainEvent } from './chain-event.entity';
import { EventHandlerRegistry } from './event-handler.registry';
import { IndexerState } from './indexer-state.entity';

const STATE_ID = 'main';
const INSERT_CHUNK = 500;
const MAX_BACKOFF_MS = 30_000;

export interface IndexerStatus {
  enabled: boolean;
  lastBlock: number | null;
  running: boolean;
}

/**
 * Copies every platform contract event into the database.
 *
 * Each tick takes the next block range (up to INDEXER_BATCH_BLOCKS), fetches
 * the logs of all nine contracts with ONE getLogs call, decodes them, and in
 * ONE database transaction stores the events, runs the read-model handlers
 * and moves the checkpoint. A crash mid-batch therefore leaves nothing half
 * done. If the chain is found rewritten below the checkpoint, everything is
 * rebuilt from the deployment block.
 */
@Injectable()
export class EventIndexerService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(EventIndexerService.name);

  private readonly enabled: boolean;
  private readonly pollMs: number;
  private readonly batchBlocks: number;
  private readonly confirmations: number;
  private readonly configuredStart?: number;

  private timer?: NodeJS.Timeout;
  private stopped = true;
  private current?: Promise<number>;
  private failures = 0;

  constructor(
    config: ConfigService<EnvironmentVariables, true>,
    private readonly registry: ContractsRegistry,
    private readonly handlers: EventHandlerRegistry,
    private readonly dataSource: DataSource,
  ) {
    this.enabled = config.get('INDEXER_ENABLED', { infer: true });
    this.pollMs = config.get('INDEXER_POLL_MS', { infer: true });
    this.batchBlocks = config.get('INDEXER_BATCH_BLOCKS', { infer: true });
    this.confirmations = config.get('INDEXER_CONFIRMATIONS', { infer: true });
    this.configuredStart = config.get('CHAIN_START_BLOCK', { infer: true });
  }

  onApplicationBootstrap(): void {
    if (this.enabled) this.start();
  }

  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.schedule(0);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.current?.catch(() => undefined);
  }

  async status(): Promise<IndexerStatus> {
    const state = await this.dataSource
      .getRepository(IndexerState)
      .findOneBy({ id: STATE_ID });
    return {
      enabled: this.enabled,
      lastBlock: state?.lastBlock ?? null,
      running: !this.stopped,
    };
  }

  /**
   * Processes the next block range. Returns how many blocks it covered (0
   * when caught up). Never runs twice at once.
   */
  tick(): Promise<number> {
    this.current ??= this.processNextRange().finally(() => {
      this.current = undefined;
    });
    return this.current;
  }

  /** Indexes until caught up with the chain head. */
  async catchUp(): Promise<void> {
    while ((await this.tick()) > 0) {
      /* keep going */
    }
  }

  /**
   * Full rebuild: clears stored events, read models and the checkpoint in one
   * transaction; the next ticks replay the whole ledger history.
   */
  async reindex(): Promise<void> {
    const wasRunning = !this.stopped;
    await this.stop();
    await this.dataSource.transaction(async (manager) => {
      await this.handlers.resetAll(manager);
      await manager.clear(ChainEvent);
      await manager.delete(IndexerState, { id: STATE_ID });
    });
    this.logger.warn(
      'Event index cleared; replaying from the deployment block',
    );
    if (wasRunning) this.start();
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.tick()
        .then((covered) => {
          this.failures = 0;
          // Behind the head: continue at once. Caught up: wait for new blocks.
          this.schedule(covered > 0 ? 0 : this.pollMs);
        })
        .catch((error: unknown) => {
          this.failures++;
          const backoff = Math.min(
            this.pollMs * 2 ** this.failures,
            MAX_BACKOFF_MS,
          );
          this.logger.error(
            `Indexing failed (retry in ${backoff}ms): ${error instanceof Error ? error.message : String(error)}`,
          );
          this.schedule(backoff);
        });
    }, delayMs);
  }

  private async processNextRange(): Promise<number> {
    const provider = this.registry.provider;
    const state = await this.dataSource
      .getRepository(IndexerState)
      .findOneBy({ id: STATE_ID });

    if (state) {
      const stored = await provider.getBlock(state.lastBlock);
      if (!stored || stored.hash !== state.lastBlockHash) {
        this.logger.error(
          `Block ${state.lastBlock} changed on chain (expected ${state.lastBlockHash}); rebuilding the index`,
        );
        await this.dataSource.transaction(async (manager) => {
          await this.handlers.resetAll(manager);
          await manager.clear(ChainEvent);
          await manager.delete(IndexerState, { id: STATE_ID });
        });
        return 1;
      }
    }

    const head = await provider.getBlockNumber();
    const safeHead = head - this.confirmations;
    const from = state ? state.lastBlock + 1 : await this.startBlock();
    if (from > safeHead) return 0;
    const to = Math.min(safeHead, from + this.batchBlocks - 1);

    // One call for every platform contract over the whole range.
    const logs = await provider.getLogs({
      address: this.registry.addresses(),
      fromBlock: from,
      toBlock: to,
    });

    // Blocks we need: those with logs (for timestamps) and `to` (checkpoint hash).
    // Fetched in parallel; ethers sends them as one JSON-RPC batch.
    const needed = [...new Set([...logs.map((l) => l.blockNumber), to])];
    const blocks = new Map<number, Block>();
    await Promise.all(
      needed.map(async (n) => {
        const block = await provider.getBlock(n);
        if (!block?.hash) throw new Error(`Block ${n} not available`);
        blocks.set(n, block);
      }),
    );

    const events = logs
      .map((log) => this.decode(log, blocks))
      .filter((e): e is ChainEvent => e !== null);

    await this.dataSource.transaction(async (manager) => {
      await this.store(manager, events);
      await manager.save(IndexerState, {
        id: STATE_ID,
        lastBlock: to,
        lastBlockHash: blocks.get(to)!.hash!,
      });
    });

    if (events.length > 0) {
      this.logger.log(`Indexed blocks ${from}-${to}: ${events.length} events`);
    }
    return to - from + 1;
  }

  private decode(log: Log, blocks: Map<number, Block>): ChainEvent | null {
    const info = this.registry.byContractAddress(log.address);
    if (!info) return null;
    const parsed = info.iface.parseLog(log);
    if (!parsed) return null;
    const event = new ChainEvent();
    event.blockNumber = log.blockNumber;
    event.blockHash = log.blockHash;
    event.blockTime = new Date(blocks.get(log.blockNumber)!.timestamp * 1000);
    event.txHash = log.transactionHash;
    event.logIndex = log.index;
    event.contract = info.name;
    event.address = info.address;
    event.eventName = parsed.name;
    event.args = toJsonSafe(eventArgs(parsed)) as Record<string, unknown>;
    return event;
  }

  /** Inserts in chunks (skipping any already stored), then runs handlers in log order. */
  private async store(
    manager: EntityManager,
    events: ChainEvent[],
  ): Promise<void> {
    for (let i = 0; i < events.length; i += INSERT_CHUNK) {
      await manager
        .createQueryBuilder()
        .insert()
        .into(ChainEvent)
        .values(
          events.slice(
            i,
            i + INSERT_CHUNK,
          ) as QueryDeepPartialEntity<ChainEvent>[],
        )
        .orIgnore()
        .execute();
    }
    for (const event of events) {
      for (const handler of this.handlers.handlersFor(
        event.contract,
        event.eventName,
      )) {
        await handler(event, manager);
      }
    }
  }

  /**
   * Where indexing begins: CHAIN_START_BLOCK if set, otherwise the block the
   * AccessRegistry was deployed in. Every other contract is deployed after it
   * (each takes its address), so nothing earlier can hold platform events.
   * Found by binary search on contract code: O(log n) calls.
   */
  private async startBlock(): Promise<number> {
    if (this.configuredStart !== undefined) return this.configuredStart;
    const provider = this.registry.provider;
    const address = this.registry.info('AccessRegistry').address;
    try {
      let low = 0;
      let high = await provider.getBlockNumber();
      while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if ((await provider.getCode(address, mid)) === '0x') low = mid + 1;
        else high = mid;
      }
      this.logger.log(`Indexing from deployment block ${low}`);
      return low;
    } catch (error) {
      this.logger.warn(
        `Could not find the deployment block (${error instanceof Error ? error.message : String(error)}); ` +
          'indexing from block 0. Set CHAIN_START_BLOCK to skip the search.',
      );
      return 0;
    }
  }
}

/** bigint -> decimal string, recursively; everything else as is. */
export function toJsonSafe(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, toJsonSafe(v)]),
    );
  }
  return value;
}
