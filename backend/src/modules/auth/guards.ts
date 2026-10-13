import {
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { Role } from '../users/roles';
import { type AuthUser, canAct } from './auth-user';
import {
  ALLOW_PENDING_PASSWORD,
  AUDIT_ACTION,
  IS_PUBLIC,
  ROLES,
} from './decorators';

const READS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Global: every route needs a valid access token unless marked @Public().
 * A user on a temporary password reaches only @AllowPendingPassword() routes.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.flag(context, IS_PUBLIC)) return true;
    await super.canActivate(context);
    const user = context
      .switchToHttp()
      .getRequest<Request & { user: AuthUser }>().user;
    if (
      user.mustChangePassword &&
      !this.flag(context, ALLOW_PENDING_PASSWORD)
    ) {
      throw new ForbiddenException('Change your temporary password first');
    }
    return true;
  }

  /** One message for every token problem: no hints about what was wrong. */
  handleRequest<T>(error: unknown, user: T): T {
    if (error || !user) {
      throw error instanceof UnauthorizedException
        ? error
        : new UnauthorizedException('Sign in required');
    }
    return user;
  }

  private flag(context: ExecutionContext, key: string): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(key, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    );
  }
}

/**
 * Global: enforces @Roles(). Listed roles only, and only verified ones; the
 * super admin passes wherever it is listed. Auditors only ever read: a write
 * is refused even where they are listed, unless marked @AuditAction().
 */
@Injectable()
export class RolesGuard {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles) return true;
    const user = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>().user;
    if (!user || !roles.includes(user.role)) {
      throw new ForbiddenException('Your role cannot do this');
    }
    if (!canAct(user)) {
      throw new ForbiddenException('Your account is not verified');
    }
    const request = context.switchToHttp().getRequest<Request>();
    if (
      user.role === Role.Auditor &&
      !READS.has(request.method) &&
      this.reflector.getAllAndOverride<boolean>(AUDIT_ACTION, [
        context.getHandler(),
        context.getClass(),
      ]) !== true
    ) {
      throw new ForbiddenException('Auditors have read-only access');
    }
    return true;
  }
}
