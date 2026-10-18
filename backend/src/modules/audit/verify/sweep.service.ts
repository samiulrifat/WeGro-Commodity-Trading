import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Paginated } from '../../../common/dto/pagination.dto';
import type { AuthUser } from '../../auth/auth-user';
import { ProjectViews } from '../../projects/project-views';
import type {
  SweepDto,
  SweepFindingDto,
  SweepFindingsQueryDto,
} from '../dto/audit.dto';
import { VerificationFinding } from '../entities/verification-finding.entity';
import { VerificationRun } from '../entities/verification-run.entity';
import { VerifyService, type VerifyType } from './verify.service';
import { ErrorCode } from '../../../common/errors/error-code';

const PAGE = 500;
const CONCURRENCY = 8;

/**
 * Which records of each type the ledger should have, listed in pages by
 * keyset (`$1` is the last id of the previous page): memory stays flat
 * however much data there is.
 */
const RECORDS: Readonly<Record<VerifyType, { sql: string; start: string }>> = {
  participant: keyset(
    'users',
    'id',
    'uuid',
    `role <> 'super_admin' AND chain_state = 'confirmed'`,
  ),
  project: keyset('projects', 'id', 'uuid', `chain_state <> 'local'`),
  reservation: keyset('reservations', 'id', 'bigint', 'status IS NOT NULL'),
  voucher: keyset('vouchers', 'id', 'uuid', `status <> 'submitted'`),
  'voucher-sale': keyset('voucher_sales', 'id', 'bigint', 'status IS NOT NULL'),
  batch: keyset('input_batches', 'id', 'uuid', `status = 'registered'`),
  'field-record': keyset('field_records', 'id', 'uuid', `status = 'recorded'`),
  'warehouse-site': keyset(
    'warehouse_sites',
    'id',
    'uuid',
    `status = 'registered'`,
  ),
  receipt: keyset('warehouse_receipts', 'id', 'text', `status <> 'submitted'`),
  listing: keyset('listings', 'id', 'bigint', 'status IS NOT NULL'),
  offer: keyset('offers', 'id', 'bigint', 'status IS NOT NULL'),
  'buyer-request': keyset(
    'buyer_requests',
    'id',
    'bigint',
    'status IS NOT NULL',
  ),
  coverage: {
    sql: `SELECT DISTINCT project_id::text AS id FROM coverage_terms
           WHERE status = 'recorded' AND project_id > $1::uuid
           ORDER BY 1 LIMIT ${PAGE}`,
    start: '00000000-0000-0000-0000-000000000000',
  },
  'weather-event': keyset(
    'weather_events',
    'id',
    'uuid',
    `status = 'recorded'`,
  ),
  claim: keyset('insurance_claims', 'id', 'uuid', `status <> 'submitted'`),
  cost: keyset('project_costs', 'id', 'uuid', `status <> 'submitted'`),
  round: keyset('settlement_rounds', 'id', 'bigint', 'status IS NOT NULL'),
  bank: keyset('banks', 'id', 'uuid', `status = 'registered'`),
  'track-record': keyset('track_records', 'id', 'uuid', `status = 'recorded'`),
  consent: keyset('bank_consents', 'id', 'uuid', `status <> 'submitted'`),
};

/**
 * A sweep checks every ledger record against the ledger in the background,
 * one run at a time, keeping only the records that differ. Linear in the
 * number of records; a few node reads each, eight at a time.
 */
@Injectable()
export class SweepService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(SweepService.name);
  private running: Promise<void> | null = null;
  private stopping = false;

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(VerificationRun)
    private readonly runs: Repository<VerificationRun>,
    @InjectRepository(VerificationFinding)
    private readonly findings: Repository<VerificationFinding>,
    private readonly verifier: VerifyService,
    private readonly views: ProjectViews,
  ) {}

  /** A run left running by a stopped server never finishes: mark it. */
  async onModuleInit(): Promise<void> {
    await this.runs.update(
      { status: 'running' },
      {
        status: 'interrupted',
        finishedAt: new Date(),
        error: 'The server stopped during the sweep',
      },
    );
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    await this.running?.catch(() => undefined);
  }

  async start(actor: AuthUser): Promise<SweepDto> {
    if (this.running) {
      throw new ConflictException({
        message: 'A sweep is already running',
        code: ErrorCode.SWEEP_RUNNING,
      });
    }
    const run = await this.runs.save({
      id: randomUUID(),
      status: 'running',
      startedById: actor.id,
      startedAt: new Date(),
      finishedAt: null,
      checked: 0,
      mismatched: 0,
      error: null,
    });
    this.running = this.sweep(run.id).finally(() => {
      this.running = null;
    });
    return this.one(run.id);
  }

  /** Resolves when the current sweep (if any) finishes; for tests and shutdown. */
  async idle(): Promise<void> {
    await this.running;
  }

  async list(): Promise<SweepDto[]> {
    const rows = await this.runs.find({
      order: { startedAt: 'DESC' },
      take: 50,
    });
    return this.dtos(rows);
  }

  async one(id: string): Promise<SweepDto> {
    const run = await this.runs.findOneBy({ id });
    if (!run)
      throw new NotFoundException({
        message: 'Sweep not found',
        code: ErrorCode.SWEEP_NOT_FOUND,
      });
    return (await this.dtos([run]))[0];
  }

  async findingsOf(
    id: string,
    q: SweepFindingsQueryDto,
  ): Promise<Paginated<SweepFindingDto>> {
    await this.one(id);
    const [rows, total] = await this.findings.findAndCount({
      where: { runId: id },
      order: { type: 'ASC', recordId: 'ASC' },
      skip: q.skip,
      take: q.limit,
    });
    return new Paginated(
      rows.map((f) => ({
        type: f.type,
        recordId: f.recordId,
        mismatches: f.mismatches,
      })),
      total,
      q,
    );
  }

  private async sweep(runId: string): Promise<void> {
    let checked = 0;
    let mismatched = 0;
    try {
      for (const [type, { sql, start }] of Object.entries(RECORDS) as Array<
        [VerifyType, { sql: string; start: string }]
      >) {
        let cursor = start;
        for (;;) {
          if (this.stopping) throw new Error('The server is stopping');
          const page = await this.dataSource.query<Array<{ id: string }>>(sql, [
            cursor,
          ]);
          if (page.length === 0) break;
          const results = await pool(page, CONCURRENCY, async ({ id }) => {
            try {
              const r = await this.verifier.verify(type, id.trim());
              return { id, mismatches: r.mismatches };
            } catch (error) {
              return {
                id,
                mismatches: [
                  `error: ${error instanceof Error ? error.message : String(error)}`.slice(
                    0,
                    200,
                  ),
                ],
              };
            }
          });
          const bad = results.filter((r) => r.mismatches.length > 0);
          checked += page.length;
          mismatched += bad.length;
          if (bad.length > 0) {
            await this.findings.insert(
              bad.map((r) => ({
                runId,
                type,
                recordId: r.id.trim(),
                mismatches: r.mismatches,
              })),
            );
          }
          await this.runs.update(runId, { checked, mismatched });
          cursor = page[page.length - 1].id;
        }
      }
      await this.runs.update(runId, {
        status: 'done',
        finishedAt: new Date(),
        checked,
        mismatched,
      });
      this.logger.log(
        `Sweep ${runId}: ${checked} records checked, ${mismatched} differ from the ledger`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Sweep ${runId} failed: ${message}`);
      await this.runs.update(runId, {
        status: 'failed',
        finishedAt: new Date(),
        checked,
        mismatched,
        error: message.slice(0, 500),
      });
    }
  }

  private async dtos(rows: VerificationRun[]): Promise<SweepDto[]> {
    const names = await this.views.names(rows.map((r) => r.startedById));
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      startedBy: { id: r.startedById, name: names.get(r.startedById) ?? '' },
      checked: r.checked,
      mismatched: r.mismatched,
      error: r.error,
    }));
  }
}

function keyset(
  table: string,
  column: string,
  type: 'uuid' | 'bigint' | 'text',
  where: string,
): { sql: string; start: string } {
  return {
    sql: `SELECT ${column}::text AS id FROM ${table}
           WHERE ${where} AND ${column} > $1::${type}
           ORDER BY ${column} LIMIT ${PAGE}`,
    start:
      type === 'uuid'
        ? '00000000-0000-0000-0000-000000000000'
        : type === 'bigint'
          ? '-1'
          : '',
  };
}

/** Runs `work` over `items`, at most `limit` at a time, keeping their order. */
async function pool<T, R>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await work(items[i]);
      }
    }),
  );
  return out;
}
