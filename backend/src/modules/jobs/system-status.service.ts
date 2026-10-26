import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ContractsRegistry } from '../../blockchain/contracts.registry';
import { EventIndexerService } from '../../blockchain/indexer/event-indexer.service';
import type { SystemStatusDto } from './dto/system.dto';
import { IndexerWatchdogJob } from './indexer-watchdog.job';

const CHAIN_TIMEOUT_MS = 2000;

/**
 * How the platform stands, for staff: the database, the node and the
 * ledger's time, how far the database's copy of the ledger is behind (as
 * the watchdog counts it, against what it allows), and any open incident.
 * The node is asked once, with a timeout; nothing waits on a slow one.
 */
@Injectable()
export class SystemStatusService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly contracts: ContractsRegistry,
    private readonly indexer: EventIndexerService,
    private readonly watchdog: IndexerWatchdogJob,
  ) {}

  async status(): Promise<SystemStatusDto> {
    const [database, block, indexer] = await Promise.all([
      this.dataSource.query('SELECT 1').then(
        () => 'up' as const,
        () => 'down' as const,
      ),
      this.latestBlock(),
      this.indexer.status().catch(() => null),
    ]);
    const indexedBlock = indexer?.lastBlock ?? null;
    const confirmations = this.watchdog.confirmationBlocks;
    const behind =
      block && indexedBlock !== null
        ? Math.max(0, block.number - confirmations - indexedBlock)
        : null;
    const allowedBehind = this.watchdog.allowedLag;
    const incident = this.watchdog.openIncident();
    const healthy =
      block !== null &&
      !incident &&
      (behind === null || behind <= allowedBehind) &&
      (indexer?.failures ?? 0) === 0;
    return {
      status: database === 'down' ? 'down' : healthy ? 'ok' : 'degraded',
      checkedAt: new Date(),
      database,
      chain: {
        status: block ? 'up' : 'down',
        chainId: this.contracts.chainId,
        blockNumber: block?.number ?? null,
        ledgerTime: block ? new Date(block.timestamp * 1000) : null,
      },
      indexer: {
        enabled: indexer?.enabled ?? false,
        running: indexer?.running ?? false,
        indexedBlock,
        behind,
        allowedBehind,
        confirmations,
        failures: indexer?.failures ?? 0,
        lastError: indexer?.lastError ?? null,
      },
      incident,
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  /** The latest block's number and time, or null if the node does not answer in time. */
  private async latestBlock(): Promise<{
    number: number;
    timestamp: number;
  } | null> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), CHAIN_TIMEOUT_MS);
    });
    try {
      const block = await Promise.race([
        this.contracts.provider.getBlock('latest'),
        timeout,
      ]);
      return block
        ? { number: block.number, timestamp: block.timestamp }
        : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
