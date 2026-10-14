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
/** Blocks per pass when filling in senders of events indexed before senders were kept. */
const SENDER_FILL_BLOCKS = 50;
const MAX_BACKOFF_MS = 30_000;
/**
 * Block fetches in flight at once (four JSON-RPC batches of 100). Firing a
 * whole range at once opens dozens of connections, and nodes drop them.
 */
const BLOCK_FETCH_WAVE = 400;

export interface IndexerStatus {
  enabled: boolean;
  lastBlock: number | null;
  running: boolean;
  /** Consecutive failed passes; 0 once a pass succeeds. */
  failures: number;
  lastError: string | null;
}

/**
 * Copies every platform contract event into the database.
 *
 * Each tick takes the next block range (up to INDEXER_BATCH_BLOCKS), fetches
 * the logs of all nine contracts with ONE getLogs call, decodes them, and in
 * ONE database transaction stores the events, runs the read-model handlers
 * and moves the checkpoint. A crash mid-batch therefore leaves nothing half
 * done. If the chain is found rewritten below the checkpoint, everything is
 * rebuilt from the deployment block. Blocks with logs are fetched with their
 * transactions, which gives each event's sender at no extra cost. A failed
 * pass halves the next range (down to one block) and successes grow it back,
 * so a range the node will not serve in one go cannot stall indexing.
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
  private lastError: string | null = null;
  /** Blocks per pass now: INDEXER_BATCH_BLOCKS, less after failures. */
  private span: number;

  constructor(
    config: ConfigService<EnvironmentVariables, true>,
    private readonly registry: ContractsRegistry,
    private readonly handlers: EventHandlerRegistry,
    private readonly dataSource: DataSource,
  ) {
    this.enabled = config.get('INDEXER_ENABLED', { infer: true });
    this.pollMs = config.get('INDEXER_POLL_MS', { infer: true });
    this.batchBlocks = config.get('INDEXER_BATCH_BLOCKS', { infer: true });
    this.span = this.batchBlocks;
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
      failures: this.failures,
      lastError: this.lastError,
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
          this.lastError = null;
          // Behind the head: continue at once. Caught up: wait for new blocks.
          this.schedule(covered > 0 ? 0 : this.pollMs);
        })
        .catch((error: unknown) => {
          this.failures++;
          this.lastError =
            error instanceof Error ? error.message : String(error);
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
    if ((await this.fillSenders()) > 0) return 1;
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
    const to = Math.min(safeHead, from + this.span - 1);
    try {
      await this.indexRange(from, to);
    } catch (error) {
      if (this.span > 1) this.span = Math.max(1, Math.floor(this.span / 2));
      throw error;
    }
    this.span = Math.min(this.batchBlocks, this.span * 2);
    return to - from + 1;
  }

  /** One range: logs, their blocks, then events and checkpoint in one transaction. */
  private async indexRange(from: number, to: number): Promise<void> {
    const provider = this.registry.provider;

    // One call for every platform contract over the whole range.
    const logs = await provider.getLogs({
      address: this.registry.addresses(),
      fromBlock: from,
      toBlock: to,
    });

    // Blocks we need: those with logs (for timestamps and, with their
    // transactions, senders) and `to` (checkpoint hash). Fetched in waves;
    // within a wave ethers groups the calls into JSON-RPC batches.
    const withLogs = new Set(logs.map((l) => l.blockNumber));
    const needed = [...new Set([...withLogs, to])];
    const blocks = new Map<number, Block>();
    for (let i = 0; i < needed.length; i += BLOCK_FETCH_WAVE) {
      await Promise.all(
        needed.slice(i, i + BLOCK_FETCH_WAVE).map(async (n) => {
          const block = await provider.getBlock(n, withLogs.has(n));
          if (!block?.hash) throw new Error(`Block ${n} not available`);
          blocks.set(n, block);
        }),
      );
    }

    // Only blocks fetched with their transactions can name senders.
    const senders = sendersOf([...withLogs].map((n) => blocks.get(n)!));
    const events = logs
      .map((log) => this.decode(log, blocks, senders))
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
  }

  private decode(
    log: Log,
    blocks: Map<number, Block>,
    senders: Map<string, string>,
  ): ChainEvent | null {
    const info = this.registry.byContractAddress(log.address);
    if (!info) return null;
    const parsed = info.iface.parseLog(log);
    if (!parsed) return null;
    const event = new ChainEvent();
    event.blockNumber = log.blockNumber;
    event.blockHash = log.blockHash;
    event.blockTime = new Date(blocks.get(log.blockNumber)!.timestamp * 1000);
    event.txHash = log.transactionHash;
    event.txFrom = senders.get(log.transactionHash) ?? null;
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
   * Fills in the sender of events indexed before senders were kept, a few
   * blocks per pass (one block fetch each, with its transactions). Returns
   * how many blocks it filled; zero once there is nothing left.
   */
  private async fillSenders(): Promise<number> {
    const rows: Array<{ block_number: string }> = await this.dataSource.query(
      `SELECT DISTINCT block_number FROM chain_event WHERE tx_from IS NULL
        ORDER BY block_number LIMIT ${SENDER_FILL_BLOCKS}`,
    );
    if (rows.length === 0) return 0;
    const provider = this.registry.provider;
    const blocks = await Promise.all(
      rows.map(async (r) => {
        const block = await provider.getBlock(Number(r.block_number), true);
        if (!block?.hash)
          throw new Error(`Block ${r.block_number} not available`);
        return block;
      }),
    );
    const senders = sendersOf(blocks);
    await this.dataSource.query(
      `UPDATE chain_event c SET tx_from = v.sender
         FROM unnest($1::text[], $2::text[]) AS v(hash, sender)
        WHERE c.tx_hash = v.hash AND c.tx_from IS NULL`,
      [[...senders.keys()], [...senders.values()]],
    );
    this.logger.log(`Filled in senders for ${blocks.length} indexed block(s)`);
    return blocks.length;
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

/** Transaction hash -> sender, for blocks fetched with their transactions. */
function sendersOf(blocks: Iterable<Block>): Map<string, string> {
  const senders = new Map<string, string>();
  for (const block of blocks) {
    for (const tx of block.prefetchedTransactions)
      senders.set(tx.hash, tx.from);
  }
  return senders;
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
