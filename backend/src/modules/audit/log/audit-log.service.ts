import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Paginated } from '../../../common/dto/pagination.dto';
import { bdDayEnd, bdDayStart } from '../../../common/time/bd-dates';
import { ProjectViews } from '../../projects/project-views';
import type { AuditLogEntryDto, AuditLogQueryDto } from '../dto/audit.dto';
import { AuditLog } from '../entities/audit-log.entity';

/** Writes the write-request log, and searches it newest first. */
@Injectable()
export class AuditLogService implements OnApplicationShutdown {
  private readonly logger = new Logger('AuditLog');
  /** Inserts still in flight: shutdown waits for them. */
  private readonly pending = new Set<Promise<void>>();

  constructor(
    @InjectRepository(AuditLog) private readonly log: Repository<AuditLog>,
    private readonly views: ProjectViews,
  ) {}

  /**
   * Saves one entry without holding up the response. Runs before the
   * database closes: Nest stops the HTTP server first (every response has
   * finished) and shuts the database module down last.
   */
  record(entry: Omit<AuditLog, 'id' | 'at'>, label: string): void {
    const insert: Promise<void> = this.log
      .insert(entry)
      .then(
        () => undefined,
        (error: unknown) =>
          this.logger.error(
            `Could not log ${label}: ${error instanceof Error ? error.message : String(error)}`,
          ),
      )
      .finally(() => this.pending.delete(insert));
    this.pending.add(insert);
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(this.pending);
  }

  async search(q: AuditLogQueryDto): Promise<Paginated<AuditLogEntryDto>> {
    const qb = this.log.createQueryBuilder('a');
    if (q.actorId) qb.andWhere('a.actor_id = :actor', { actor: q.actorId });
    if (q.from)
      qb.andWhere('a.at >= :from', {
        from: new Date(bdDayStart(q.from) * 1000),
      });
    if (q.to)
      qb.andWhere('a.at < :to', { to: new Date(bdDayEnd(q.to) * 1000) });
    // The route or any under it: /api/projects finds /api/projects/:id/activate.
    if (q.route)
      qb.andWhere('starts_with(a.route, :route)', { route: q.route });
    if (q.outcome) qb.andWhere('a.outcome = :outcome', { outcome: q.outcome });
    if (q.statusCode)
      qb.andWhere('a.status_code = :status', { status: q.statusCode });
    const [rows, total] = await qb
      .orderBy('a.id', 'DESC')
      .skip(q.skip)
      .take(q.limit)
      .getManyAndCount();
    const names = await this.views.names(
      rows.flatMap((r) => (r.actorId ? [r.actorId] : [])),
    );
    return new Paginated(
      rows.map((r) => ({
        id: Number(r.id),
        at: r.at,
        actor: r.actorId
          ? {
              id: r.actorId,
              name: names.get(r.actorId) ?? '',
              role: r.role ?? '',
            }
          : null,
        method: r.method,
        route: r.route,
        params: r.params,
        statusCode: r.statusCode,
        outcome: r.outcome,
        requestId: r.requestId,
        durationMs: r.durationMs,
      })),
      total,
      q,
    );
  }
}
