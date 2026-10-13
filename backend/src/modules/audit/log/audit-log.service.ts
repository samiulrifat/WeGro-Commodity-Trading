import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Paginated } from '../../../common/dto/pagination.dto';
import { bdDayEnd, bdDayStart } from '../../../common/time/bd-dates';
import { ProjectViews } from '../../projects/project-views';
import type { AuditLogEntryDto, AuditLogQueryDto } from '../dto/audit.dto';
import { AuditLog } from '../entities/audit-log.entity';

/** Searches the write-request log, newest first. */
@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLog) private readonly log: Repository<AuditLog>,
    private readonly views: ProjectViews,
  ) {}

  async search(q: AuditLogQueryDto): Promise<Paginated<AuditLogEntryDto>> {
    const qb = this.log.createQueryBuilder('a');
    if (q.actorId) qb.andWhere('a.actor_id = :actor', { actor: q.actorId });
    if (q.from)
      qb.andWhere('a.at >= :from', {
        from: new Date(bdDayStart(q.from) * 1000),
      });
    if (q.to)
      qb.andWhere('a.at < :to', { to: new Date(bdDayEnd(q.to) * 1000) });
    if (q.route) qb.andWhere('a.route = :route', { route: q.route });
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
