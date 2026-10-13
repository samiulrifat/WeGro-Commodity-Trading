import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { NextFunction, Request, Response } from 'express';
import { Repository } from 'typeorm';
import type { AuthUser } from '../../auth/auth-user';
import { AuditLog } from '../entities/audit-log.entity';

const WRITES: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Logs every write request once it has finished: who (when signed in), the
 * route, the record ids in the path, the status and how long it took. Runs
 * before guards, so refused attempts are logged too. Never the body. The
 * insert happens after the response is sent, so it adds no delay.
 */
@Injectable()
export class AuditLogMiddleware implements NestMiddleware {
  private readonly logger = new Logger('AuditLog');

  constructor(
    @InjectRepository(AuditLog) private readonly log: Repository<AuditLog>,
  ) {}

  use(
    req: Request & { id?: string; user?: AuthUser },
    res: Response,
    next: NextFunction,
  ): void {
    if (!WRITES.has(req.method)) return next();
    const started = Date.now();
    res.on('finish', () => {
      const route = req.route as { path?: string } | undefined;
      const user = req.user;
      const params = Object.fromEntries(
        Object.entries((req.params ?? {}) as Record<string, string>).map(
          ([k, v]) => [k, String(v).slice(0, 100)],
        ),
      );
      this.log
        .insert({
          actorId: user?.id ?? null,
          role: user?.role ?? null,
          method: req.method,
          route: (route?.path ?? req.path).slice(0, 200),
          params,
          statusCode: res.statusCode,
          outcome: res.statusCode < 400 ? 'ok' : 'failed',
          requestId: req.id ?? null,
          durationMs: Date.now() - started,
        })
        .catch((error: unknown) =>
          this.logger.error(
            `Could not log ${req.method} ${req.path} [${req.id ?? '-'}]: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
    });
    next();
  }
}
