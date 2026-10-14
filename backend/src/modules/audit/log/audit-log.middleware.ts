import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { AuthUser } from '../../auth/auth-user';
import { AuditLogService } from './audit-log.service';

const WRITES: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** Recorded when the client leaves before the response (nginx's convention). */
const CLIENT_CLOSED = 499;

/**
 * Logs every write request once it has finished: who (when signed in), the
 * route, the record ids in the path, the status and how long it took. Runs
 * before guards, so refused attempts are logged too. Never the body. A
 * request the client abandons is logged as aborted: its work may still have
 * happened. The insert happens after the response, so it adds no delay.
 */
@Injectable()
export class AuditLogMiddleware implements NestMiddleware {
  constructor(private readonly audit: AuditLogService) {}

  use(
    req: Request & { id?: string; user?: AuthUser },
    res: Response,
    next: NextFunction,
  ): void {
    if (!WRITES.has(req.method)) return next();
    const started = Date.now();
    let logged = false;
    const write = (aborted: boolean) => {
      if (logged) return;
      logged = true;
      const route = req.route as { path?: string } | undefined;
      const user = req.user;
      const params = Object.fromEntries(
        Object.entries((req.params ?? {}) as Record<string, string>).map(
          ([k, v]) => [k, String(v).slice(0, 100)],
        ),
      );
      this.audit.record(
        {
          actorId: user?.id ?? null,
          role: user?.role ?? null,
          method: req.method,
          route: (route?.path ?? req.path).slice(0, 200),
          params,
          statusCode: aborted ? CLIENT_CLOSED : res.statusCode,
          outcome: aborted ? 'aborted' : res.statusCode < 400 ? 'ok' : 'failed',
          requestId: req.id ?? null,
          durationMs: Date.now() - started,
        },
        `${req.method} ${req.path} [${req.id ?? '-'}]`,
      );
    };
    res.on('finish', () => write(false));
    // 'close' follows 'finish' normally; alone, the client went away.
    res.on('close', () => write(!res.writableFinished));
    next();
  }
}
