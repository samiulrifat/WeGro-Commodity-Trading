import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { ContractsRegistry } from '../../blockchain/contracts.registry';
import { EventIndexerService } from '../../blockchain/indexer/event-indexer.service';
import type { EnvironmentVariables } from '../../config/env.validation';
import {
  NotificationCategory,
  NotificationKind,
  type NotificationParams,
} from '../notifications/notification.enums';
import { NotificationWriter } from '../notifications/notification-writer';
import { Role } from '../users/roles';
import {
  ScheduledJob,
  type ScheduledJobRunner,
} from '../../common/jobs/scheduled-job';

/** Consecutive failed indexer passes that count as "failing". */
const FAILING_PASSES = 3;

type Problem = 'node-unreachable' | 'indexer-behind' | 'indexer-failing';

const KINDS: Record<Problem, NotificationKind> = {
  'node-unreachable': NotificationKind.SYSTEM_NODE_UNREACHABLE,
  'indexer-behind': NotificationKind.SYSTEM_INDEXER_BEHIND,
  'indexer-failing': NotificationKind.SYSTEM_INDEXER_FAILING,
};

const TITLES: Record<Problem, string> = {
  'node-unreachable': 'The blockchain node cannot be reached',
  'indexer-behind': 'The database is falling behind the ledger',
  'indexer-failing': 'Copying ledger events into the database keeps failing',
};

/**
 * Checks that the database keeps up with the ledger: the node answers, the
 * indexer is not failing, and it is no more than WATCHDOG_LAG_BLOCKS behind.
 * A problem opens an incident: admins and the super admin are told once,
 * and again when it is resolved. Two reads per run.
 */
@Injectable()
@ScheduledJob({
  name: 'indexer-watchdog',
  description:
    'Tells admins when the database stops keeping up with the ledger',
  every: 'WATCHDOG_INTERVAL_MS',
})
export class IndexerWatchdogJob implements ScheduledJobRunner {
  private readonly logger = new Logger(IndexerWatchdogJob.name);
  private readonly lagBlocks: number;
  private readonly confirmations: number;
  /** The open incident: what is wrong and since when. */
  private incident: { problem: Problem; since: Date } | null = null;

  constructor(
    config: ConfigService<EnvironmentVariables, true>,
    private readonly dataSource: DataSource,
    private readonly contracts: ContractsRegistry,
    private readonly indexer: EventIndexerService,
    private readonly writer: NotificationWriter,
  ) {
    this.lagBlocks = config.get('WATCHDOG_LAG_BLOCKS', { infer: true });
    this.confirmations = config.get('INDEXER_CONFIRMATIONS', { infer: true });
  }

  /** Returns how many notifications it sent. */
  async run(): Promise<number> {
    const status = await this.indexer.status();
    if (!status.enabled) return 0;
    let problem: Problem | null = null;
    let detail = '';
    let params: NotificationParams = {};
    try {
      const head = await this.contracts.provider.getBlockNumber();
      const lag = head - this.confirmations - (status.lastBlock ?? 0);
      if (status.failures >= FAILING_PASSES) {
        problem = 'indexer-failing';
        detail = `${status.failures} passes in a row failed: ${status.lastError ?? 'unknown error'}`;
        params = { failures: status.failures, error: status.lastError ?? null };
      } else if (lag > this.lagBlocks) {
        problem = 'indexer-behind';
        detail = `${lag} blocks behind the ledger (allowed ${this.lagBlocks}); pages may show old data`;
        params = { lag, allowed: this.lagBlocks };
      }
    } catch (error) {
      problem = 'node-unreachable';
      detail = error instanceof Error ? error.message : String(error);
      params = { error: detail };
    }

    if (problem && this.incident?.problem === problem) return 0;
    let sent = 0;
    if (this.incident && this.incident.problem !== problem) {
      sent += await this.notify(
        `resolved:${this.incident.problem}:${this.incident.since.getTime()}`,
        NotificationCategory.OUTCOME,
        NotificationKind.SYSTEM_RESOLVED,
        `Resolved: ${TITLES[this.incident.problem].toLowerCase()}`,
        `Since ${this.incident.since.toISOString()}`,
        {
          problem: this.incident.problem,
          since: this.incident.since.toISOString(),
        },
      );
      this.incident = null;
    }
    if (problem) {
      this.incident = { problem, since: new Date() };
      this.logger.error(`${TITLES[problem]}: ${detail}`);
      sent += await this.notify(
        `${problem}:${this.incident.since.getTime()}`,
        NotificationCategory.ACTION,
        KINDS[problem],
        TITLES[problem],
        detail,
        params,
      );
    }
    return sent;
  }

  private async notify(
    key: string,
    category: NotificationCategory,
    kind: NotificationKind,
    title: string,
    body: string,
    params: NotificationParams,
  ): Promise<number> {
    const m = this.dataSource.manager;
    return this.writer.send(
      m,
      await this.writer.withRole(m, [Role.SUPER_ADMIN, Role.ADMIN]),
      { category, kind, title, body, params, key: `watchdog:${key}` },
    );
  }
}
