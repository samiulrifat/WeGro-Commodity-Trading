import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Role } from '../users/roles';
import type { AuthUser } from './auth-user';

export const IS_PUBLIC = 'auth:public';
export const ROLES = 'auth:roles';
export const ALLOW_PENDING_PASSWORD = 'auth:allowPendingPassword';
export const AUTH_THROTTLE = 'auth:throttle';

/** Open to anyone. Every other route needs a valid access token. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/**
 * Only these roles, and only once verified on the ledger (the super admin is
 * always allowed in when listed). The contracts check the same rule again.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

/** Reachable with a temporary password, before it has been changed. */
export const AllowPendingPassword = () =>
  SetMetadata(ALLOW_PENDING_PASSWORD, true);

/** Counted against the stricter sign-in rate limit (AUTH_THROTTLE_LIMIT per minute). */
export const AuthThrottle = () => SetMetadata(AUTH_THROTTLE, true);

/** The signed-in user, as loaded for this request. */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<Request & { user: AuthUser }>().user,
);
